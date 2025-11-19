
import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import {
  CartCreate,
  CartProduct,
  CartQuote,
  CartQuoteItem,
  DesignerCreate,
  PedidoPayload,
  createCartSchema,
  createDesignerSchema
} from './pedidos.types';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { imageSize } from 'image-size';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { prisma } from '../../lib/prisma';
import { calculateTaxBreakdown, DEFAULT_CURRENCY, TAX_RATE } from '../common/pricing';

type DbClient = Prisma.TransactionClient | PrismaClient;

const UPLOAD_BASE_DIR =
  process.env.PEDIDOS_UPLOAD_DIR || path.join(process.cwd(), 'uploads', 'pedidos');
const UPLOAD_TMP_DIR = path.join(UPLOAD_BASE_DIR, 'tmp');

if (!fs.existsSync(UPLOAD_TMP_DIR)) {
  fs.mkdirSync(UPLOAD_TMP_DIR, { recursive: true });
}

function buildUploadFilename(originalName?: string | null) {
  const safeExt = originalName ? path.extname(originalName) : '';
  const randomId =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : crypto.randomBytes(16).toString('hex');
  const timestamp = Date.now();
  return `${timestamp}-${randomId}${safeExt}`;
}

const DEFAULT_IMAGE_DPI = 300;

const MATERIAL_WIDTH_MAP: Record<string, number> = {
  dtf: 57,
  dtf57: 57,
  dtftextil: 57,
  'dtf-textil': 57,
  dtftextiladhesivo: 57,
  'dtf-adhesivo': 57,
  dtfadhesivo: 57,
  dtfadhesivo57: 57,
  dtftransfer: 57,
  vinilotextil: 47,
  vinilotextil47: 47,
  vinilotextiladhesivo: 47,
  vinilodecorativo: 56,
  vinilodecorativo56: 56,
  vinilodecorativo56cm: 56,
  sticker70: 70,
  sticker70cm: 70,
  comprinter: 47,
  comprinterpvc: 47,
  comprinterpvc47: 47,
  comprinterpu: 47,
  comprinterpu47: 47
};

type MaterialPreset = {
  label: string;
  pricePerMeter: number;
  widthCm: number;
};

const MATERIAL_PRESET_MAP: Record<string, MaterialPreset> = {};
const MATERIAL_UNIT_LENGTH_CM = 100;
const CURRENCY_CODE = DEFAULT_CURRENCY;

export type JwtUser = { sub?: number; email?: string; role?: string };

function createStockError(details: Record<string, unknown> = {}) {
  return Object.assign(new Error('INSUFFICIENT_STOCK'), { code: 'INSUFFICIENT_STOCK', details });
}

function normalizeMaterialKey(value?: string | null): string | null {
  if (!value || typeof value !== 'string') return null;
  return value.toLowerCase().replace(/[\s_\-]/g, '');
}

function registerMaterialPreset(ids: string[], preset: MaterialPreset) {
  for (const id of ids) {
    const key = normalizeMaterialKey(id);
    if (!key) continue;
    MATERIAL_PRESET_MAP[key] = preset;
  }
}

registerMaterialPreset(
  ['dtf-57', 'dtf', 'dtf57', 'dtf-textil', 'dtftextil', 'dtftextiladhesivo', 'dtf-adhesivo', 'dtfadhesivo', 'dtfadhesivo57', 'dtftransfer'],
  { label: 'DTF 57 cm', pricePerMeter: 13000, widthCm: 57 }
);

registerMaterialPreset(
  ['vinilo-textil', 'vinilotextil', 'vinilotextil47', 'vinilotextiladhesivo'],
  { label: 'Vinilo textil 47 cm', pricePerMeter: 10000, widthCm: 47 }
);

registerMaterialPreset(
  ['vinilo-decorativo', 'vinilodecorativo', 'vinilodecorativo56', 'vinilodecorativo56cm'],
  { label: 'Vinilo decorativo 56 cm', pricePerMeter: 10000, widthCm: 56 }
);

registerMaterialPreset(
  ['sticker-70', 'sticker70', 'sticker70cm'],
  { label: 'Sticker 70 cm', pricePerMeter: 7000, widthCm: 70 }
);

registerMaterialPreset(
  ['comprinter-pvc', 'comprinter', 'comprinterpvc', 'comprinterpvc47'],
  { label: 'Comprinter PVC 47 cm', pricePerMeter: 7500, widthCm: 47 }
);

registerMaterialPreset(
  ['comprinter-pu', 'comprinterpu', 'comprinterpu47'],
  { label: 'Comprinter PU 47 cm', pricePerMeter: 8500, widthCm: 47 }
);

function getMaterialPreset(materialId?: string | null): MaterialPreset | null {
  const key = normalizeMaterialKey(materialId);
  if (!key) return null;
  return MATERIAL_PRESET_MAP[key] ?? null;
}

async function findInventoryByMaterial(materialId?: string | null, client: DbClient = prisma) {
  const key = normalizeMaterialKey(materialId);
  const candidates = new Set<string>();
  if (materialId && materialId.length) {
    candidates.add(materialId);
    candidates.add(materialId.toLowerCase());
    candidates.add(materialId.toUpperCase());
  }
  if (key && key.length) {
    candidates.add(key);
  }
  if (!candidates.size) return null;
  const whereClauses = Array.from(candidates).flatMap(value => [
    { code: { equals: value } },
    { name: { equals: value } }
  ]);
  const item = await client.inventoryItem.findFirst({
    where: { OR: whereClauses }
  });
  return item;
}

function getNumericValue(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isNaN(value) ? null : value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (typeof value === 'object' && typeof (value as any)?.toNumber === 'function') {
    const parsed = (value as any).toNumber();
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function resolveInventoryUnitPrice(item: { priceWeb: any; priceStore: any; priceWsp: any }): number {
  const candidates = [
    getNumericValue(item.priceWeb),
    getNumericValue(item.priceStore),
    getNumericValue(item.priceWsp)
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && candidate >= 0) {
      return candidate;
    }
  }
  return 0;
}

function calculateMaterialPrice(lengthCm: number, pricePerMeter: number): number {
  if (!lengthCm || lengthCm <= 0) return 0;
  if (!pricePerMeter || pricePerMeter <= 0) return 0;
  return Math.round((lengthCm / 100) * pricePerMeter);
}

export function bufferToUint8Array(buffer: Buffer): Uint8Array<ArrayBuffer> {
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer;
  return new Uint8Array(arrayBuffer);
}

function getMaterialWidth(materialId?: string | null, fallback?: number): number | null {
  const key = normalizeMaterialKey(materialId);
  if (key && MATERIAL_WIDTH_MAP[key]) {
    return MATERIAL_WIDTH_MAP[key];
  }
  return typeof fallback === 'number' && fallback > 0 ? fallback : null;
}

function formatCurrencyCLP(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-';
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0
  }).format(value);
}

export function canAccessPedido(user: JwtUser | undefined, pedido: { userId: number | null; clienteEmail: string | null }): boolean {
  if (!user) return false;
  if (isOperator(user.role)) return true;
  const userId = user.sub ? Number(user.sub) : null;
  if (userId && pedido.userId && pedido.userId === userId) return true;
  if (pedido.clienteEmail && user.email && pedido.clienteEmail.toLowerCase() === user.email.toLowerCase()) return true;
  return false;
}

function parsePayload(payload: unknown): PedidoPayload | null {
  if (!payload) {
    return null;
  }
  if (typeof payload === 'object') {
    return payload as PedidoPayload;
  }
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload) as PedidoPayload;
    } catch {
      return null;
    }
  }
  return null;
}

export function extractMaterialIdFromPedido(pedido: { materialId: string | null, payload: any }): string | null {
  if (typeof pedido?.materialId === 'string' && pedido.materialId.length) {
    return pedido.materialId;
  }
  const payload = parsePayload(pedido?.payload) as any;
  if (typeof payload?.materialId === 'string') {
    return payload.materialId;
  }
  if (typeof payload?.material === 'string') {
    return payload.material;
  }
  if (typeof payload?.quote?.materialId === 'string') {
    return payload.quote.materialId;
  }
  if (Array.isArray(payload?.products)) {
    for (const product of payload.products) {
      if (typeof product?.materialId === 'string') {
        return product.materialId;
      }
    }
  }
  return null;
}

export function extractMaterialWidthFromPedido(pedido: { materialWidthCm?: number | null, payload: any }): number | null {
  if (typeof pedido?.materialWidthCm === 'number') {
    return pedido.materialWidthCm;
  }
  const payload = parsePayload(pedido?.payload) as any;
  const widths = [
    payload?.materialWidthCm,
    payload?.materialWidth,
    payload?.quote?.materialWidthCm,
    payload?.quote?.materialWidth
  ].filter(value => typeof value === 'number' && value > 0);
  if (widths.length) {
    return widths[0] as number;
  }
  return null;
}

export async function calculateAttachmentMetrics(
  source: { buffer: Buffer; originalName?: string | null; mimeType?: string | null },
  materialId: string | null,
  fallbackWidth?: number | null
) {
  const buffer = source.buffer;
  const originalName = source.originalName || 'archivo';
  const mime = source.mimeType?.toLowerCase() || '';
  const materialWidth = getMaterialWidth(materialId, fallbackWidth ?? undefined);

  if (mime === 'application/pdf' || originalName.toLowerCase().endsWith('.pdf')) {
    const pdf = await PDFDocument.load(buffer);
    let totalArea = 0;
    let maxPageWidth = 0;
    for (let i = 0; i < pdf.getPageCount(); i++) {
      const page = pdf.getPage(i);
      const size = page.getSize();
      const widthCm = (size.width * 2.54) / 72;
      const heightCm = (size.height * 2.54) / 72;
      totalArea += widthCm * heightCm;
      if (widthCm > maxPageWidth) {
        maxPageWidth = widthCm;
      }
    }
    const widthCm = materialWidth ?? maxPageWidth;
    const lengthCm = widthCm > 0 ? totalArea / widthCm : totalArea;
    return {
      widthCm,
      heightCm: lengthCm,
      areaCm2: totalArea,
      lengthCm
    };
  }

  if (mime.startsWith('image/') || /\.(png|jpg|jpeg)$/i.test(originalName)) {
    const dimensions = imageSize(buffer);
    if (!dimensions.width || !dimensions.height) {
      throw new Error('No se pudo determinar el tamaño de la imagen');
    }
    const dpiCandidate = (dimensions as any).dpi;
    const dpi = typeof dpiCandidate === 'number' && dpiCandidate > 0 ? dpiCandidate : DEFAULT_IMAGE_DPI;
    const widthCmRaw = (dimensions.width / dpi) * 2.54;
    const heightCmRaw = (dimensions.height / dpi) * 2.54;
    const area = widthCmRaw * heightCmRaw;
    const widthCm = materialWidth ?? widthCmRaw;
    const lengthCm = widthCm > 0 ? area / widthCm : heightCmRaw;
    return {
      widthCm,
      heightCm: lengthCm,
      areaCm2: area,
      lengthCm
    };
  }

  throw new Error('Formato de archivo no soportado');
}

async function adjustMaterialStock(
  materialId: string | null,
  deltaLengthCm: number,
  client: DbClient = prisma
) {
  if (!materialId) return;
  if (!deltaLengthCm || Math.abs(deltaLengthCm) < 0.01) return;
  const inventory = await findInventoryByMaterial(materialId, client);
  if (!inventory) return;
  const deltaCm = Math.round(deltaLengthCm);
  if (!deltaCm) {
    return;
  }

  const remainderRecord = await client.inventoryLengthRemainder.findUnique({
    where: { inventoryId: inventory.id }
  });
  let remainderCm = remainderRecord?.remainderCm ?? 0;

  if (deltaCm > 0) {
    const availableCm = (inventory.quantity ?? 0) * MATERIAL_UNIT_LENGTH_CM - remainderCm;
    if (deltaCm > availableCm) {
      throw createStockError({
        materialId,
        inventoryId: inventory.id,
        requestedCentimeters: deltaCm,
        availableCentimeters: availableCm,
        remainderCentimeters: remainderCm
      });
    }
    const totalConsumed = remainderCm + deltaCm;
    const wholeMeters = Math.floor(totalConsumed / MATERIAL_UNIT_LENGTH_CM);
    remainderCm = totalConsumed % MATERIAL_UNIT_LENGTH_CM;
    if (wholeMeters > 0) {
      const result = await client.inventoryItem.updateMany({
        where: { id: inventory.id, quantity: { gte: wholeMeters } },
        data: { quantity: { decrement: wholeMeters } }
      });
      if (!result.count) {
        throw createStockError({
          materialId,
          inventoryId: inventory.id,
          requested: wholeMeters,
          available: inventory.quantity ?? 0,
          remainderCentimeters: remainderCm
        });
      }
      inventory.quantity = (inventory.quantity ?? 0) - wholeMeters;
    }
  } else {
    let totalRemainder = remainderCm + deltaCm;
    let metersToReturn = 0;
    while (totalRemainder < 0) {
      totalRemainder += MATERIAL_UNIT_LENGTH_CM;
      metersToReturn += 1;
    }
    remainderCm = totalRemainder;
    if (metersToReturn > 0) {
      await client.inventoryItem.update({
        where: { id: inventory.id },
        data: { quantity: { increment: metersToReturn } }
      });
      inventory.quantity = (inventory.quantity ?? 0) + metersToReturn;
    }
  }

  if (remainderCm < 0) {
    remainderCm =
      ((remainderCm % MATERIAL_UNIT_LENGTH_CM) + MATERIAL_UNIT_LENGTH_CM) % MATERIAL_UNIT_LENGTH_CM;
  }

  await client.inventoryLengthRemainder.upsert({
    where: { inventoryId: inventory.id },
    create: { inventoryId: inventory.id, remainderCm },
    update: { remainderCm }
  });
}

async function decrementInventoryItem(
  itemId: number,
  quantity: number,
  client: DbClient = prisma
) {
  if (!itemId || quantity <= 0) return;
  const item = await client.inventoryItem.findUnique({
    where: { id: itemId },
    select: { id: true, quantity: true, code: true, name: true }
  });
  if (!item) return;
  if (item.quantity < quantity) {
    throw createStockError({
      itemId: item.id,
      requested: quantity,
      available: item.quantity,
      code: item.code,
      name: item.name
    });
  }
  const result = await client.inventoryItem.updateMany({
    where: { id: item.id, quantity: { gte: quantity } },
    data: { quantity: { decrement: quantity } }
  });
  if (!result.count) {
    throw createStockError({
      itemId: item.id,
      requested: quantity,
      available: item.quantity,
      code: item.code,
      name: item.name
    });
  }
}

async function adjustCatalogStock(products: CartProduct[] | undefined | null, client: DbClient = prisma) {
  if (!Array.isArray(products)) return;
  for (const product of products) {
    const itemId = typeof product?.id === 'number' ? product.id : null;
    const quantity = typeof product?.quantity === 'number' ? product.quantity : null;
    if (itemId && quantity && quantity > 0) {
      await decrementInventoryItem(itemId, quantity, client);
    }
  }
}

async function adjustQuoteStock(materialId: string | null, quote: CartQuote | null, client: DbClient = prisma) {
  if (!quote) return;
  const usedHeight = typeof quote?.usedHeight === 'number' ? quote.usedHeight : null;
  if (!usedHeight || usedHeight <= 0) return;
  await adjustMaterialStock(materialId, usedHeight, client);
}

export async function recomputePedidoAggregates(pedidoId: number, client: DbClient = prisma) {
  const pedido = await client.pedido.findUnique({
    where: { id: pedidoId },
    include: { adjuntos: true }
  });
  if (!pedido) {
    return null;
  }

  const payload = parsePayload(pedido.payload) as any;
  const oldLength = typeof payload?.filesTotalLengthCm === 'number' ? payload.filesTotalLengthCm : 0;

  const totalArea = pedido.adjuntos.reduce((acc, file) => acc + (file.areaCm2 ?? 0), 0);
  const materialId = extractMaterialIdFromPedido(pedido);
  const widthFromPedido = extractMaterialWidthFromPedido(pedido);
  const widthCm = getMaterialWidth(materialId, widthFromPedido ?? undefined);

  let totalLength = 0;
  if (pedido.adjuntos.length) {
    for (const file of pedido.adjuntos) {
      if (typeof file.lengthCm === 'number') {
        totalLength += file.lengthCm;
      } else if (file.areaCm2 && widthCm) {
        totalLength += file.areaCm2 / widthCm;
      }
    }
  }
  if (!Number.isFinite(totalLength)) {
    totalLength = 0;
  }

  let totalPrice: number | null = payload?.filesTotalPrice ?? null;
  const inventory = await findInventoryByMaterial(materialId, client);
  if (inventory && widthCm && totalLength > 0) {
    const pricePerMeter = inventory.priceWeb ?? inventory.priceStore ?? inventory.priceWsp ?? null;
    if (typeof pricePerMeter === 'number' && pricePerMeter > 0) {
      totalPrice = Math.round((totalLength / 100) * pricePerMeter);
    }
  }

  const attachmentsSummary = pedido.adjuntos.map(file => ({
    id: file.id,
    filename: file.filename,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    areaCm2: file.areaCm2,
    lengthCm: file.lengthCm,
    uploadedAt: file.createdAt
  }));

  const nextPayload = {
    ...payload,
    attachments: attachmentsSummary,
    filesTotalAreaCm2: totalArea,
    filesTotalLengthCm: totalLength,
    filesTotalPrice: totalPrice ?? undefined
  };

  const updateData: any = {
    payload: nextPayload as any
  };
  if ((!pedido.total || pedido.total <= 0) && typeof totalPrice === 'number' && totalPrice > 0) {
    const breakdown = calculateTaxBreakdown(totalPrice, TAX_RATE);
    updateData.total = totalPrice;
    updateData.subtotal = breakdown.subtotal;
    updateData.taxTotal = breakdown.tax;
    updateData.moneda = pedido.moneda || CURRENCY_CODE;
  }

  await client.pedido.update({
    where: { id: pedidoId },
    data: updateData
  });

  const deltaLength = totalLength - (oldLength || 0);
  if (deltaLength) {
    await adjustMaterialStock(materialId, deltaLength, client);
  }

  return { areaCm2: totalArea, lengthCm: totalLength, price: totalPrice };
}

export function isOperator(role?: string | null) {
  if (!role) return false;
  const normalized = role.toUpperCase();
  return normalized === 'OPERATOR' || normalized === 'ADMIN';
}

type PedidoNotifyPayload = {
  id: number;
  estado: string;
  clienteEmail: string | null;
  clienteNombre: string | null;
  total: number | null;
  subtotal?: number | null;
  taxTotal?: number | null;
  currency?: string | null;
  materialLabel: string | null;
  payload: any;
  createdAt: Date;
  operadorEmail?: string | null;
  operadorNombre?: string | null;
};

function buildEstadoMessage(pedido: PedidoNotifyPayload) {
  const baseLabel = pedido.clienteNombre?.split(' ')?.[0] || 'Hola';
  const panelBase = (process.env.PANEL_BASE_URL || 'https://app.kingston.local').replace(/\/$/, '');
  const enlaces = {
    cliente: `${panelBase}/cliente/pedidos/${pedido.id}`,
    operador: `${panelBase}/operador/solicitudes/${pedido.id}`,
    pagosCliente: `${panelBase}/cliente/pagos/${pedido.id}`,
    pagosOperador: `${panelBase}/operador/pagos/${pedido.id}`
  };

  if (pedido.estado === 'EN_REVISION') {
    return {
      subject: `Tu pedido #${pedido.id} esta en revision`,
      text: `${baseLabel}, tu solicitud esta siendo revisada por el equipo. Te avisaremos cuando este lista para pago.`,
      html: `<p>${baseLabel},</p><p>Tu solicitud <strong>#${pedido.id}</strong> fue tomada por el equipo y esta en revision.</p><p>Puedes seguir el avance en tu panel: <a href="${enlaces.cliente}">${enlaces.cliente}</a>.</p>`,
      enlaces
    };
  }

  if (pedido.estado === 'POR_PAGAR') {
    return {
      subject: `Pedido #${pedido.id} listo para pago`,
      text: `${baseLabel}, tu pedido esta listo para pago. Ingresa a tu panel para completar el proceso.`,
      html: `<p>${baseLabel},</p><p>Tu pedido <strong>#${pedido.id}</strong> fue aprobado y esta listo para pago.</p><p>Puedes completar el pago desde tu panel: <a href="${enlaces.pagosCliente}">${enlaces.pagosCliente}</a>.</p>`,
      enlaces
    };
  }

  return null;
}

export async function notifyPedidoEstado(pedido: PedidoNotifyPayload) {
  if (!pedido.clienteEmail) {
    return;
  }
  if (!['EN_REVISION', 'POR_PAGAR'].includes(pedido.estado)) {
    return;
  }
  const fetchFn = (globalThis as any).fetch as typeof fetch | undefined;
  if (!fetchFn) {
    console.warn('[pedidos] fetch no disponible para notificar estado');
    return;
  }
  const webhookUrl = process.env.N8N_PEDIDOS_WEBHOOK_URL || process.env.N8N_WEBHOOK_URL;
  if (!webhookUrl) {
    console.info('[pedidos] Notificacion omitida (sin webhook configurado)');
    return;
  }
  const message = buildEstadoMessage(pedido);
  if (!message) {
    return;
  }
  const payload = {
    tipo: 'pedido_estado',
    pedidoId: pedido.id,
    estado: pedido.estado,
    destinatario: pedido.clienteEmail,
    asunto: message.subject,
    mensaje: message.text,
    html: message.html,
    enlaces: message.enlaces,
    total: pedido.total ?? null,
    subtotal: typeof pedido.subtotal === 'number' ? pedido.subtotal : null,
    taxTotal: typeof pedido.taxTotal === 'number' ? pedido.taxTotal : null,
    currency: pedido.currency || CURRENCY_CODE,
    taxRate: TAX_RATE,
    material: pedido.materialLabel ?? null,
    origen: typeof pedido.payload === 'object' && pedido.payload !== null ? (pedido.payload as any).source ?? null : null,
    operadorEmail: pedido.operadorEmail ?? null,
    operadorNombre: pedido.operadorNombre ?? null
  };

  try {
    const response = await fetchFn(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error('[pedidos] Webhook respondio error', response.status, text);
    } else {
      console.info('[pedidos] Webhook enviado', {
        destinatario: payload.destinatario,
        operador: payload.operadorEmail,
        estado: payload.estado
      });
    }
  } catch (error) {
    console.error('[pedidos] Error enviando notificacion', error);
  }
}

export async function handleCartOrder(dto: CartCreate, user: JwtUser | undefined) {
  const userId = user?.sub ? Number(user.sub) : null;
  let email: string | null = user?.email ?? null;
  let nombre: string | null = null;
  let clienteId: number | null = null;

  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, fullName: true }
    });
    if (user) {
      email = user.email;
      nombre = user.fullName;
      const cliente = await (prisma as any).cliente.findUnique({
        where: { id_usuario: userId },
        select: { id_cliente: true }
      });
      if (cliente?.id_cliente) {
        clienteId = Number(cliente.id_cliente);
      }
    }
  }

  const nowIso = new Date().toISOString();

  const productIds = dto.products.map(product => product.id);
  const inventoryItems = productIds.length
    ? await prisma.inventoryItem.findMany({
        where: { id: { in: productIds } },
        select: {
          id: true,
          name: true,
          itemType: true,
          color: true,
          provider: true,
          imageUrl: true,
          priceWeb: true,
          priceStore: true,
          priceWsp: true
        }
      })
    : [];

  const now = new Date();
  const offers = productIds.length
    ? await prisma.oferta.findMany({
        where: {
          activo: true,
          itemId: { in: productIds },
          OR: [{ startAt: null }, { startAt: { lte: now } }],
          AND: [{ OR: [{ endAt: null }, { endAt: { gte: now } }] }]
        },
        select: {
          id: true,
          itemId: true,
          titulo: true,
          precioOferta: true
        }
      })
    : [];

  const offersByItemId = new Map<number, { id: number; titulo: string | null; precioOferta: number | null }>();
  for (const offer of offers) {
    if (typeof offer.itemId === 'number') {
      offersByItemId.set(offer.itemId, {
        id: offer.id,
        titulo: offer.titulo,
        precioOferta: offer.precioOferta
      });
    }
  }

  const inventoryById = new Map(inventoryItems.map(item => [item.id, item]));
  for (const product of dto.products) {
    if (!inventoryById.get(product.id)) {
      throw new Error('Producto de catálogo inválido');
    }
  }

  const sanitizedProducts = dto.products.map(product => {
    const record = inventoryById.get(product.id)!;
    const baseUnitPrice = resolveInventoryUnitPrice(record);
    const offer = offersByItemId.get(record.id);
    const offerUnitPrice = offer?.precioOferta && offer.precioOferta > 0 ? offer.precioOferta : null;
    const unitPrice = offerUnitPrice ?? baseUnitPrice;
    const lineTotal = unitPrice * product.quantity;
    const originalLineTotal = baseUnitPrice * product.quantity;
    return {
      id: record.id,
      name: record.name,
      quantity: product.quantity,
      price: unitPrice,
      lineTotal,
      originalPrice: baseUnitPrice,
      originalLineTotal,
      offerApplied: offer
        ? {
            id: offer.id,
            title: offer.titulo,
            price: offerUnitPrice
          }
        : null,
      itemType: record.itemType ?? null,
      color: record.color ?? null,
      provider: record.provider ?? null,
      imageUrl: record.imageUrl ?? null
    };
  });

  const catalogTotal = sanitizedProducts.reduce((acc, item) => acc + item.lineTotal, 0);
  const catalogOriginalTotal = sanitizedProducts.reduce(
    (acc, item) => acc + (item.originalLineTotal ?? item.lineTotal),
    0
  );
  const catalogDiscount = catalogOriginalTotal - catalogTotal;
  const clientCatalogTotal = dto.products.reduce((acc, item) => acc + item.price * item.quantity, 0);

  let sanitizedQuote: (CartQuote & {
    totalPrice: number;
    pricePerMeter?: number | null;
    inventoryId?: number | null;
  }) | null = null;
  let quotePreset: MaterialPreset | null = null;
  let quoteTotal = 0;
  let quoteMaterialId: string | null = null;
  let quoteMaterialLabel: string | null = null;

  if (dto.quote) {
    const quoteInventory = await findInventoryByMaterial(dto.quote.materialId);
    quotePreset = getMaterialPreset(dto.quote.materialId);
    if (!quoteInventory && !quotePreset) {
      throw new Error('Material de cotizacion invalido');
    }
    const pricePerMeter = quoteInventory
      ? resolveInventoryUnitPrice(quoteInventory)
      : quotePreset?.pricePerMeter ?? 0;
    if (!pricePerMeter) {
      throw new Error('No existe tarifa configurada para el material seleccionado');
    }
    quoteTotal = calculateMaterialPrice(dto.quote.usedHeight, pricePerMeter);
    const effectiveLabel =
      quoteInventory?.name ?? dto.quote.materialLabel ?? quotePreset?.label ?? null;
    sanitizedQuote = {
      ...dto.quote,
      materialLabel: effectiveLabel ?? dto.quote.materialLabel ?? quotePreset?.label ?? null,
      totalPrice: quoteTotal,
      pricePerMeter,
      inventoryId: quoteInventory?.id ?? null
    };
    quoteMaterialId = dto.quote.materialId ?? null;
    quoteMaterialLabel =
      sanitizedQuote.materialLabel ?? quotePreset?.label ?? quoteMaterialId;
  }

  const productsCount = sanitizedProducts.reduce((acc, item) => acc + item.quantity, 0);
  const quoteCount = sanitizedQuote?.items?.reduce((acc, item) => acc + item.quantity, 0) ?? 0;
  const itemsCount = productsCount + quoteCount;
  const total = Math.round(catalogTotal + quoteTotal);
  const { subtotal, tax } = calculateTaxBreakdown(total, TAX_RATE);
  const clientQuoteTotal = dto.quote?.totalPrice ?? null;

  const pedidoId = await prisma.$transaction(async tx => {
    const pedido = await tx.pedido.create({
      data: {
        userId,
        clienteId,
        clienteEmail: email,
        clienteNombre: nombre,
        estado: 'PENDIENTE',
        notificado: true,
        total,
        subtotal,
        taxTotal: tax,
        moneda: CURRENCY_CODE,
        itemsCount,
        materialId: quoteMaterialId,
        materialLabel: quoteMaterialLabel,
        payload: {
          source: 'cart',
          products: sanitizedProducts,
          quote: sanitizedQuote,
          note: dto.note ?? null,
          pricing: {
            catalogTotal,
            catalogOriginalTotal,
            catalogDiscount,
            quoteTotal,
            computedTotal: total,
            subtotal,
            taxTotal: tax,
            taxRate: TAX_RATE,
            currency: CURRENCY_CODE,
            clientCatalogTotal,
            clientQuoteTotal,
            quotePricePerMeter: sanitizedQuote?.pricePerMeter ?? null,
            quotePresetLabel: sanitizedQuote?.inventoryId ? null : (quotePreset?.label ?? null)
          },
          createdAt: nowIso,
          cliente: { email, nombre }
        }
      },
      select: { id: true }
    });

    await adjustCatalogStock(sanitizedProducts, tx);
    await adjustQuoteStock(quoteMaterialId, sanitizedQuote, tx);

    return pedido.id;
  });

  return pedidoId;
}



export async function getPedidosByClient(userId: number | null, email: string | null, status?: string) {
  if (!userId && !email) {
    return [];
  }

  const orClauses: Prisma.PedidoWhereInput[] = [];
  if (userId) {
    orClauses.push({ userId });
  }
  if (email) {
    orClauses.push({ clienteEmail: email });
  }

  if (!orClauses.length) {
    return [];
  }

  const pedidoWhere: Prisma.PedidoWhereInput = {
    OR: orClauses
  };

  if (status && status !== 'TODOS') {
    pedidoWhere.estado = status;
  }

  const pedidos = await prisma.pedido.findMany({
    where: pedidoWhere,
    orderBy: { id: 'desc' },
    take: 50,
    include: {
      ordenesTrabajo: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          id: true,
          pedidoId: true,
          tecnica: true,
          maquina: true,
          estado: true,
          programadoPara: true,
          iniciaEn: true,
          terminaEn: true,
          notas: true,
          createdAt: true,
          updatedAt: true
        }
      },
      webpayTransactions: {
        where: { status: 'authorized' },
        orderBy: { transactionDate: 'desc' },
        take: 1,
        select: { id: true }
      }
    }
  });

  const respuesta = pedidos.map(p => ({
    id: p.id,
    cliente: p.clienteNombre || p.clienteEmail || 'Tu pedido',
    email: p.clienteEmail || email || '',
    estado: p.estado,
    createdAt: p.createdAt,
    total: typeof p.total === 'number' ? p.total : undefined,
    subtotal: typeof p.subtotal === 'number' ? p.subtotal : undefined,
    taxTotal: typeof p.taxTotal === 'number' ? p.taxTotal : undefined,
    currency: p.moneda || undefined,
    items: p.itemsCount || undefined,
    materialLabel: p.materialLabel || undefined,
    note: typeof p.payload === 'object' && p.payload !== null ? (p.payload as any).note ?? undefined : undefined,
    payload: p.payload,
    workOrder: p.ordenesTrabajo?.[0] ?? null,
    receiptAvailable: (p.webpayTransactions?.length ?? 0) > 0
  }));

  return respuesta;
}

export async function getPedidosByStatus(status: string) {
  const where: Prisma.PedidoWhereInput = {};
  if (status !== 'TODOS') {
    where.estado = status;
  }

  const pedidos = await prisma.pedido.findMany({
    where,
    include: {
      ordenesTrabajo: {
        orderBy: { createdAt: 'desc' }
      },
      webpayTransactions: {
        where: { status: 'authorized' },
        orderBy: { transactionDate: 'desc' },
        take: 1,
        select: { id: true }
      }
    },
    orderBy: { id: 'desc' },
    take: 100
  });

  const respuesta = pedidos.map(p => ({
    id: p.id,
    cliente: p.clienteNombre || p.clienteEmail || 'Cliente',
    email: p.clienteEmail || '',
    estado: p.estado,
    createdAt: p.createdAt,
    total: typeof p.total === 'number' ? p.total : undefined,
    subtotal: typeof p.subtotal === 'number' ? p.subtotal : undefined,
    taxTotal: typeof p.taxTotal === 'number' ? p.taxTotal : undefined,
    currency: p.moneda || undefined,
    items: p.itemsCount || undefined,
    notificado: p.notificado,
    materialLabel: p.materialLabel || undefined,
    note: typeof p.payload === 'object' && p.payload !== null ? (p.payload as any).note ?? undefined : undefined,
    payload: p.payload,
    workOrder: p.ordenesTrabajo?.[0],
    receiptAvailable: (p.webpayTransactions?.length ?? 0) > 0
  }));

  return respuesta;
}

export async function handleDesignerOrder(dto: DesignerCreate, user: JwtUser | undefined) {
  const userId = user?.sub ? Number(user.sub) : null;
  let email: string | null = user?.email ?? null;
  let nombre: string | null = null;
  let clienteId: number | null = null;

  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, fullName: true }
    });
    if (user) {
      email = user.email;
      nombre = user.fullName;
      const cliente = await (prisma as any).cliente.findUnique({
        where: { id_usuario: userId },
        select: { id_cliente: true }
      });
      if (cliente?.id_cliente) {
        clienteId = Number(cliente.id_cliente);
      }
    }
  }

  const nowIso = new Date().toISOString();

  const materialInventory = await findInventoryByMaterial(dto.materialId);
  const materialPreset = getMaterialPreset(dto.materialId);
  if (!materialInventory && !materialPreset) {
    throw new Error('Material invalido');
  }
  const pricePerMeter = materialInventory
    ? resolveInventoryUnitPrice(materialInventory)
    : materialPreset?.pricePerMeter ?? 0;
  if (!pricePerMeter) {
    throw new Error('No existe tarifa configurada para el material seleccionado');
  }
  const computedTotal = calculateMaterialPrice(dto.usedHeight, pricePerMeter);
  const breakdown = calculateTaxBreakdown(computedTotal, TAX_RATE);
  const itemsCount = dto.items.reduce((acc, item) => acc + item.quantity, 0);
  const materialLabel =
    materialInventory?.name ?? dto.materialLabel ?? materialPreset?.label ?? dto.materialId;
  const sanitizedDesignerPayload = {
    ...dto,
    materialLabel,
    totalPrice: computedTotal,
    pricePerMeter,
    inventoryId: materialInventory?.id ?? null
  };

  const pedidoId = await prisma.$transaction(async tx => {
    const pedido = await tx.pedido.create({
      data: {
        userId,
        clienteId,
        clienteEmail: email,
        clienteNombre: nombre,
        estado: 'PENDIENTE',
        notificado: true,
        total: computedTotal,
        subtotal: breakdown.subtotal,
        taxTotal: breakdown.tax,
        moneda: CURRENCY_CODE,
        itemsCount,
        materialId: dto.materialId,
        materialLabel,
        payload: {
          source: 'designer',
          ...sanitizedDesignerPayload,
          pricing: {
            pricePerMeter,
            computedTotal,
            subtotal: breakdown.subtotal,
            taxTotal: breakdown.tax,
            taxRate: TAX_RATE,
            currency: CURRENCY_CODE,
            clientTotal: dto.totalPrice ?? null,
            presetLabel: materialPreset?.label ?? null
          },
          createdAt: nowIso,
          cliente: {
            email,
            nombre
          }
        }
      },
      select: { id: true }
    });

    await adjustMaterialStock(dto.materialId, dto.usedHeight, tx);

    return pedido.id;
  });

  return pedidoId;
}
