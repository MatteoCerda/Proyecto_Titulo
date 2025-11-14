import { Router } from 'express';
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
import multer from 'multer';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { imageSize } from 'image-size';
import type { Express } from 'express';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { prisma } from '../../lib/prisma';
import { calculateTaxBreakdown, DEFAULT_CURRENCY, TAX_RATE } from '../common/pricing';
import { sendEmail } from '../../lib/email';
import * as pedidosController from './pedidos.controller';
import type { JwtUser } from './pedidos.service';

const router = Router();
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

const uploadStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_TMP_DIR);
  },
  filename: (_req, file, cb) => {
    cb(null, buildUploadFilename(file.originalname));
  }
});

const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: 25 * 1024 * 1024, files: 10 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'image/png' || file.mimetype === 'image/jpeg' || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no soportado'));
    }
  }
});
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

async function getOperatorContact(userId?: number | null) {
  if (!userId) {
    return { email: null, nombre: null };
  }
  const operator = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, fullName: true }
  });
  return {
    email: operator?.email ?? null,
    nombre: operator?.fullName ?? null
  };
}

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

function canAccessPedido(user: JwtUser | undefined, pedido: { userId: number | null; clienteEmail: string | null }): boolean {
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

const itemSchema = z.object({
  displayName: z.string().min(1),
  quantity: z.number().int().min(1),
  widthCm: z.number().nonnegative(),
  heightCm: z.number().nonnegative(),
  sizeMode: z.string().optional(),
  previewUrl: z.string().optional().or(z.null()).optional(),
  coverageRatio: z.number().min(0).max(1).optional(),
  outlinePath: z.string().max(20000).optional().or(z.null()).optional(),
  pixelArea: z.number().nonnegative().optional(),
  trimmedWidthPx: z.number().nonnegative().optional(),
  trimmedHeightPx: z.number().nonnegative().optional()
});

const placementSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  previewUrl: z.string().optional().or(z.null()).optional(),
  clipPath: z.string().optional().or(z.null()).optional(),
  rotation: z.number().optional(),
  designWidth: z.number().nonnegative().optional(),
  designHeight: z.number().nonnegative().optional(),
  margin: z.number().nonnegative().optional(),
  itemId: z.number().int().optional(),
  copyIndex: z.number().int().optional()
});

const createSchema = z.object({
  materialId: z.string().min(1),
  materialLabel: z.string().min(1),
  materialWidthCm: z.number().nonnegative(),
  usedHeight: z.number().nonnegative(),
  totalPrice: z.number().nonnegative(),
  note: z.string().max(600).optional(),
  items: z.array(itemSchema).min(1),
  placements: z.array(placementSchema).optional()
});

const cartProductSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  price: z.number().nonnegative(),
  quantity: z.number().int().positive(),
  itemType: z.string().max(120).optional(),
  color: z.string().max(120).optional(),
  provider: z.string().max(120).optional(),
  imageUrl: z.string().url().optional().or(z.literal('')).or(z.null())
}).transform(item => ({
  ...item,
  imageUrl: item.imageUrl === '' ? null : item.imageUrl
}));

const cartQuoteItemSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().int().positive(),
  widthCm: z.number().nonnegative(),
  heightCm: z.number().nonnegative()
});

const cartQuoteSchema = z.object({
  materialId: z.string().min(1),
  materialLabel: z.string().min(1),
  totalPrice: z.number().nonnegative(),
  usedHeight: z.number().nonnegative(),
  note: z.string().max(600).optional(),
  items: z.array(cartQuoteItemSchema).default([]),
  createdAt: z.string().optional()
});

const cartCreateSchema = z.object({
  source: z.literal('cart'),
  products: z.array(cartProductSchema).default([]),
  quote: cartQuoteSchema.optional().nullable(),
  note: z.string().max(600).optional()
}).superRefine((data, ctx) => {
  const productsCount = data.products?.length ?? 0;
  const quoteItems = data.quote?.items?.length ?? 0;
  if (!productsCount && !quoteItems) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Debes incluir al menos un producto o una cotizacion.'
    });
  }
});

function isOperator(role?: string | null) {
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

  switch (pedido.estado) {
    case 'EN_REVISION':
      return {
        subject: `Tu pedido #${pedido.id} esta en revision`,
        html: `<p>${baseLabel},</p><p>Tu solicitud <strong>#${pedido.id}</strong> fue tomada por el equipo y esta en revision.</p><p>Puedes seguir el avance en tu panel: <a href="${enlaces.cliente}">${enlaces.cliente}</a>.</p>`
      };
    case 'POR_PAGAR':
      return {
        subject: `Pedido #${pedido.id} listo para pago`,
        html: `<p>${baseLabel},</p><p>Tu pedido <strong>#${pedido.id}</strong> fue aprobado y esta listo para pago.</p><p>Puedes completar el pago desde tu panel: <a href="${enlaces.pagosCliente}">${enlaces.pagosCliente}</a>.</p>`
      };
    case 'EN_PRODUCCION':
      return {
        subject: `Tu pedido #${pedido.id} está en producción`,
        html: `<p>${baseLabel},</p><p>Tu pedido <strong>#${pedido.id}</strong> ha entrado en producción.</p><p>Te notificaremos cuando esté listo para retiro.</p><p>Puedes seguir el avance en tu panel: <a href="${enlaces.cliente}">${enlaces.cliente}</a>.</p>`
      };
    case 'LISTO_RETIRO':
      return {
        subject: `Tu pedido #${pedido.id} está listo para retiro`,
        html: `<p>${baseLabel},</p><p>Tu pedido <strong>#${pedido.id}</strong> está listo para ser retirado en nuestra tienda.</p><p>Gracias por tu compra!</p>`
      };
    case 'COMPLETADO':
      return {
        subject: `Tu pedido #${pedido.id} ha sido completado`,
        html: `<p>${baseLabel},</p><p>Tu pedido <strong>#${pedido.id}</strong> ha sido marcado como completado.</p><p>¡Gracias por preferirnos!</p>`
      };
    default:
      return null;
  }
}

async function notifyPedidoEstado(pedido: PedidoNotifyPayload) {
  if (!pedido.clienteEmail) {
    return;
  }

  const message = buildEstadoMessage(pedido);
  if (!message) {
    return;
  }

  await sendEmail({
    to: pedido.clienteEmail,
    subject: message.subject,
    html: message.html,
  });
}

async function handleCartOrder(dto: CartCreate, user: JwtUser | undefined, res: any) {
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
      return res.status(400).json({
        message: 'Producto de catálogo inválido',
        detalles: { productId: product.id }
      });
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
      return res.status(400).json({
        message: 'Material de cotizacion invalido',
        detalles: { materialId: dto.quote.materialId }
      });
    }
    const pricePerMeter = quoteInventory
      ? resolveInventoryUnitPrice(quoteInventory)
      : quotePreset?.pricePerMeter ?? 0;
    if (!pricePerMeter) {
      return res.status(400).json({
        message: 'No existe tarifa configurada para el material seleccionado',
        detalles: { materialId: dto.quote.materialId }
      });
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

  return res.status(201).json({ id: pedidoId });
}

async function handleDesignerOrder(dto: DesignerCreate, user: JwtUser | undefined, res: any) {
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
    return res.status(400).json({
      message: 'Material invalido',
      detalles: { materialId: dto.materialId }
    });
  }
  const pricePerMeter = materialInventory
    ? resolveInventoryUnitPrice(materialInventory)
    : materialPreset?.pricePerMeter ?? 0;
  if (!pricePerMeter) {
    return res.status(400).json({
      message: 'No existe tarifa configurada para el material seleccionado',
      detalles: { materialId: dto.materialId }
    });
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

  res.status(201).json({ id: pedidoId });
}

router.post('/', pedidosController.createPedido);

router.get('/', pedidosController.getPedidos);

router.get('/admin/clientes', async (req, res) => {
  try {
    const user = (req as any).user as JwtUser | undefined;
    if (!isOperator(user?.role)) {
      return res.status(403).json({ message: 'Requiere rol operador' });
    }

    const pedidosSelect = {
      select: {
        id: true,
        estado: true,
        createdAt: true,
        total: true,
        subtotal: true,
        taxTotal: true,
        moneda: true,
        materialLabel: true
      },
      orderBy: { createdAt: 'desc' },
      take: 30
    } as const;

    const [clientes, usuariosSinPerfil] = await Promise.all([
      prisma.cliente.findMany({
        orderBy: { creado_en: 'desc' },
        take: 200,
        include: {
          user: {
            select: {
              email: true,
              fullName: true
            }
          },
          pedidos: pedidosSelect
        }
      }),
      prisma.user.findMany({
        where: {
          cliente: null,
          role: { notIn: ['ADMIN', 'OPERATOR'] }
        },
        orderBy: { createdAt: 'desc' },
        take: 150,
        select: {
          id: true,
          email: true,
          fullName: true,
          createdAt: true,
          pedidos: pedidosSelect
        }
      })
    ]);

    const normalizePedido = (pedido: {
      id: number;
      estado: string;
      createdAt: Date;
      total: number | null;
      subtotal: number | null;
      taxTotal: number | null;
      moneda: string | null;
      materialLabel: string | null;
    }) => ({
      id: pedido.id,
      estado: pedido.estado,
      createdAt: pedido.createdAt,
      total: pedido.total ?? null,
      subtotal: pedido.subtotal ?? null,
      taxTotal: pedido.taxTotal ?? null,
      currency: pedido.moneda ?? null,
      material: pedido.materialLabel ?? null
    });

    const combined = [
      ...clientes.map(cliente => ({
        id: cliente.id_cliente,
        email: cliente.email ?? cliente.user?.email ?? null,
        nombre: cliente.nombre_contacto ?? cliente.user?.fullName ?? null,
        rut: cliente.rut ?? null,
        rutNormalizado: cliente.rutNormalizado ?? null,
        createdAt: cliente.creado_en,
        pedidos: (cliente.pedidos ?? []).map(normalizePedido)
      })),
      ...usuariosSinPerfil.map(usuario => ({
        id: usuario.id,
        email: usuario.email,
        nombre: usuario.fullName,
        rut: null,
        rutNormalizado: null,
        createdAt: usuario.createdAt,
        pedidos: (usuario.pedidos ?? []).map(normalizePedido)
      }))
    ]
      .sort((a, b) => {
        const left = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const right = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return right - left;
      })
      .map(({ createdAt, ...rest }) => rest);

    res.json(combined);
  } catch (error) {
    console.error('Error listando clientes con pedidos', error);
    res.status(500).json({ message: 'Error interno' });
  }
});

router.post('/:id/work-orders', async (req, res) => {
  try {
    const user = (req as any).user as JwtUser | undefined;
    if (!isOperator(user?.role)) {
      return res.status(403).json({ message: 'Requiere rol operador' });
    }

    const id = Number(req.params.id);
    if (!id) {
      return res.status(400).json({ message: 'ID invalido' });
    }

    const { tecnica, maquina, programadoPara, notas } = req.body || {};
    if (!tecnica || typeof tecnica !== 'string' || !tecnica.trim()) {
      return res.status(400).json({ message: 'Debes indicar la tecnica de impresion' });
    }

    const pedido = await prisma.pedido.findUnique({
      where: { id },
      include: { ordenesTrabajo: { orderBy: { createdAt: 'desc' } } }
    });
    if (!pedido) {
      return res.status(404).json({ message: 'Pedido no encontrado' });
    }

    const alreadyExists = pedido.ordenesTrabajo?.some(ot => ot.estado !== 'finalizado');
    if (alreadyExists) {
      return res.status(409).json({ message: 'El pedido ya tiene una orden de trabajo activa' });
    }

    const scheduledAt =
      programadoPara && typeof programadoPara === 'string'
        ? new Date(programadoPara)
        : null;

    const workOrder = await prisma.ordenTrabajo.create({
      data: {
        pedidoId: id,
        tecnica: tecnica.trim(),
        maquina: typeof maquina === 'string' && maquina.trim().length ? maquina.trim() : null,
        programadoPara: scheduledAt && !isNaN(scheduledAt.getTime()) ? scheduledAt : null,
        notas: typeof notas === 'string' && notas.trim().length ? notas.trim() : null
      }
    });

    if ((pedido.estado || '').toUpperCase() !== 'EN_IMPRESION') {
      await prisma.pedido.update({
        where: { id },
        data: { estado: 'EN_IMPRESION' }
      });
    }

    res.status(201).json(workOrder);
  } catch (error) {
    console.error('Error creando orden de trabajo', error);
    res.status(500).json({ message: 'Error interno' });
  }
});

router.patch('/work-orders/:workOrderId', async (req, res) => {
  try {
    const user = (req as any).user as JwtUser | undefined;
    if (!isOperator(user?.role)) {
      return res.status(403).json({ message: 'Requiere rol operador' });
    }

    const workOrderId = Number(req.params.workOrderId);
    if (!workOrderId) {
      return res.status(400).json({ message: 'ID invalido' });
    }

    const body = req.body || {};
    const data: any = {};

    if (typeof body.estado === 'string' && body.estado.trim().length) {
      data.estado = body.estado.trim();
    }
    if (typeof body.maquina === 'string') {
      data.maquina = body.maquina.trim().length ? body.maquina.trim() : null;
    }
    if (typeof body.notas === 'string') {
      data.notas = body.notas.trim().length ? body.notas.trim() : null;
    }
    if (body.programadoPara) {
      const parsed = new Date(body.programadoPara);
      data.programadoPara = !isNaN(parsed.getTime()) ? parsed : null;
    }
    if (body.iniciaEn) {
      const parsed = new Date(body.iniciaEn);
      data.iniciaEn = !isNaN(parsed.getTime()) ? parsed : null;
    }
    if (body.terminaEn) {
      const parsed = new Date(body.terminaEn);
      data.terminaEn = !isNaN(parsed.getTime()) ? parsed : null;
    }

    if (!Object.keys(data).length) {
      return res.status(400).json({ message: 'No se proporcionaron campos para actualizar' });
    }

    const updated = await prisma.ordenTrabajo.update({
      where: { id: workOrderId },
      data
    });

    if (data.estado && data.estado.toUpperCase() === 'LISTO_RETIRO') {
      const operatorContact = await getOperatorContact(user?.sub ? Number(user.sub) : null);
      const updatedPedido = await prisma.pedido.update({
        where: { id: updated.pedidoId },
        data: { estado: 'LISTO_RETIRO' },
        select: {
          id: true,
          estado: true,
          notificado: true,
          clienteEmail: true,
          clienteNombre: true,
          total: true,
          subtotal: true,
          taxTotal: true,
          moneda: true,
          materialLabel: true,
          payload: true,
          createdAt: true
        }
      });

      await notifyPedidoEstado({
        id: updatedPedido.id,
        estado: updatedPedido.estado,
        clienteEmail: updatedPedido.clienteEmail || null,
        clienteNombre: updatedPedido.clienteNombre || null,
        total: typeof updatedPedido.total === 'number' ? updatedPedido.total : null,
        subtotal: typeof updatedPedido.subtotal === 'number' ? updatedPedido.subtotal : null,
        taxTotal: typeof updatedPedido.taxTotal === 'number' ? updatedPedido.taxTotal : null,
        currency: updatedPedido.moneda || CURRENCY_CODE,
        materialLabel: updatedPedido.materialLabel || null,
        payload: updatedPedido.payload,
        createdAt: updatedPedido.createdAt,
        operadorEmail: operatorContact.email,
        operadorNombre: operatorContact.nombre
      });
    }

    res.json(updated);
  } catch (error) {
    console.error('Error actualizando orden de trabajo', error);
    res.status(500).json({ message: 'Error interno' });
  }
});

router.get('/work-orders/calendar', async (req, res) => {
  try {
    const user = (req as any).user as JwtUser | undefined;
    if (!isOperator(user?.role)) {
      return res.status(403).json({ message: 'Requiere rol operador' });
    }

    const fromParam = req.query.from as string | undefined;
    const toParam = req.query.to as string | undefined;
    const from = fromParam ? new Date(fromParam) : new Date();
    const to = toParam ? new Date(toParam) : new Date(Date.now() + 1000 * 60 * 60 * 24 * 14);

    const workOrders = await prisma.ordenTrabajo.findMany({
      where: {
        programadoPara: {
          gte: isNaN(from.getTime()) ? undefined : from,
          lte: isNaN(to.getTime()) ? undefined : to
        }
      },
      include: {
        pedido: {
          select: {
            id: true,
            clienteNombre: true,
            clienteEmail: true,
            estado: true,
            materialLabel: true
          }
        }
      },
      orderBy: [
        { programadoPara: 'asc' },
        { createdAt: 'asc' }
      ]
    });

    res.json(workOrders);
  } catch (error) {
    console.error('Error listando calendario de ordenes de trabajo', error);
    res.status(500).json({ message: 'Error interno' });
  }
});

router.get('/admin/clientes/legacy', async (req, res) => {
  try {
    const user = (req as any).user as JwtUser | undefined;
    if (!isOperator(user?.role)) {
      return res.status(403).json({ message: 'Requiere rol operador' });
    }

    const pedidos = await prisma.pedido.findMany({
      orderBy: { createdAt: 'desc' }
    });

    const grouped = new Map<string, {
      email: string;
      nombre: string | null;
      pedidos: Array<{
        id: number;
        estado: string;
        createdAt: Date;
        total: number | null;
        material: string | null;
      }>;
    }>();

    for (const pedido of pedidos) {
      const email = (pedido.clienteEmail || 'sin-email').toLowerCase();
      if (!grouped.has(email)) {
        grouped.set(email, {
          email,
          nombre: pedido.clienteNombre || null,
          pedidos: []
        });
      }
      grouped.get(email)!.pedidos.push({
        id: pedido.id,
        estado: pedido.estado,
        createdAt: pedido.createdAt,
        total: pedido.total ?? null,
        material: pedido.materialLabel ?? null
      });
    }

    const response = Array.from(grouped.values()).map(entry => ({
      email: entry.email === 'sin-email' ? null : entry.email,
      nombre: entry.nombre,
      pedidos: entry.pedidos
    }));

    res.json(response);
  } catch (error) {
    console.error('Error listando clientes con pedidos', error);
    res.status(500).json({ message: 'Error interno' });
  }
});

router.get('/:id/quote.pdf', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: 'ID invalido' });
    const user = (req as any).user as JwtUser | undefined;
    if (!user) return res.status(401).json({ message: 'No autorizado' });

    const pedido = await prisma.pedido.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        clienteNombre: true,
        clienteEmail: true,
        estado: true,
        total: true,
        itemsCount: true,
        materialLabel: true,
        materialId: true,
        createdAt: true,
        payload: true,
        adjuntos: {
          select: {
            id: true,
            filename: true,
            mimeType: true,
            data: true
          }
        }
      }
    });
    if (!pedido) return res.status(404).json({ message: 'Pedido no encontrado' });

    const canAdmin = (user.role ?? '').toUpperCase() === 'ADMIN';
    const canOp = isOperator(user.role);
    const canClient = canAccessPedido(user, { userId: pedido.userId ?? null, clienteEmail: pedido.clienteEmail ?? null });
    if (!(canAdmin || canOp || canClient)) {
      return res.status(403).json({ message: 'No autorizado' });
    }

    const payload = parsePayload(pedido.payload) as any;
    const products = Array.isArray(payload?.products) ? payload.products : [];
    const quote = payload?.quote && typeof payload.quote === 'object' ? payload.quote : null;
    const attachments = Array.isArray(payload?.attachments) ? payload.attachments : [];
    const totals = {
      area: typeof payload?.filesTotalAreaCm2 === 'number' ? payload.filesTotalAreaCm2 : null,
      length: typeof payload?.filesTotalLengthCm === 'number' ? payload.filesTotalLengthCm : null,
      price: typeof payload?.filesTotalPrice === 'number' ? payload.filesTotalPrice : null
    };

    const pdfDoc = await PDFDocument.create();
    let page = pdfDoc.addPage([595.28, 841.89]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontSize = 11;
    const margin = 40;
    let y = page.getHeight() - margin;

    const addLine = (text: string, options?: { bold?: boolean; size?: number }) => {
      if (y <= margin + 20) {
        page = pdfDoc.addPage([595.28, 841.89]);
        y = page.getHeight() - margin;
      }
      const size = options?.size ?? fontSize;
      const usedFont = options?.bold ? fontBold : font;
      page.drawText(text, { x: margin, y, size, font: usedFont });
      y -= size + 6;
    };

    addLine('Cotizacion de Pedido', { bold: true, size: 18 });
    addLine(`Numero de pedido: #${pedido.id}`, { bold: true });
    addLine(`Fecha: ${new Date(pedido.createdAt).toLocaleString('es-CL')}`);
    addLine(`Cliente: ${pedido.clienteNombre || 'No indicado'}`);
    addLine(`Correo: ${pedido.clienteEmail || 'No indicado'}`);
    addLine(`Estado actual: ${pedido.estado}`);
    addLine('');

    addLine('Resumen', { bold: true, size: 14 });
    addLine(`Material: ${pedido.materialLabel || quote?.materialLabel || 'No definido'}`);
    addLine(`Codigo material: ${pedido.materialId || quote?.materialId || '-'}`);
    addLine(`Total items: ${pedido.itemsCount ?? products.reduce((acc: number, item: any) => acc + (Number(item?.quantity) || 0), 0)}`);
    addLine(`Total estimado: ${formatCurrencyCLP(quote?.totalPrice ?? totals.price ?? pedido.total ?? null)}`);
    if (quote?.usedHeight) {
      addLine(`Uso de material: ${Number(quote.usedHeight).toFixed(1)} cm (${(Number(quote.usedHeight) / 100).toFixed(2)} m aprox.)`);
    } else if (totals.length) {
      addLine(`Uso de material: ${Number(totals.length).toFixed(1)} cm (${(Number(totals.length) / 100).toFixed(2)} m aprox.)`);
    }
    addLine('');

    if (products.length) {
      addLine('Productos del catalogo', { bold: true, size: 14 });
      products.forEach((item: any, index: number) => {
        const qty = Number(item?.quantity) || 0;
        const price = Number(item?.price) || 0;
        const line = `${index + 1}. ${item?.name || 'Producto'} - Cantidad: ${qty} - Precio unitario: ${formatCurrencyCLP(price)} - Subtotal: ${formatCurrencyCLP(price * qty)}`;
        addLine(line);
      });
      addLine('');
    }

    if (quote?.items?.length) {
      addLine('Elementos de la cotizacion', { bold: true, size: 14 });
      quote.items.forEach((item: any, index: number) => {
        const qty = Number(item?.quantity) || 0;
        const width = Number(item?.widthCm) || 0;
        const height = Number(item?.heightCm) || 0;
        const line = `${index + 1}. ${item?.name || 'Item'} - Cantidad: ${qty} - ${width.toFixed(1)} cm x ${height.toFixed(1)} cm`;
        addLine(line);
      });
      addLine('');
    }

    if (attachments.length) {
      addLine('Archivos adjuntos', { bold: true, size: 14 });
      attachments.forEach((file: any, index: number) => {
        const sizeKb = file?.sizeBytes ? `${Math.round(file.sizeBytes / 1024)} KB` : 'Tamaño desconocido';
        const lengthCm = file?.lengthCm ? `${Number(file.lengthCm).toFixed(1)} cm` : '-';
        addLine(`${index + 1}. ${file?.filename || 'archivo'} (${sizeKb}) - Largo estimado: ${lengthCm}`);
      });
      addLine('');
    }

    if (pedido.adjuntos?.length) {
      addLine('Previsualizaciones', { bold: true, size: 14 });
      for (const adj of pedido.adjuntos) {
        const mime = (adj.mimeType || '').toLowerCase();
        if (!mime.startsWith('image/') || !adj.data) continue;
        let embeddedImage;
        const buffer = Buffer.isBuffer(adj.data) ? adj.data : Buffer.from(adj.data);
        if (mime.includes('png')) {
          embeddedImage = await pdfDoc.embedPng(buffer);
        } else if (mime.includes('jpg') || mime.includes('jpeg')) {
          embeddedImage = await pdfDoc.embedJpg(buffer);
        } else {
          continue;
        }

        const maxWidth = page.getWidth() - margin * 2;
        const maxHeight = page.getHeight() - margin * 2;
        const { width, height } = embeddedImage.scale(1);
        const scale = Math.min(maxWidth / width, maxHeight / height, 1);
        const imgWidth = width * scale;
        const imgHeight = height * scale;

        if (y - imgHeight < margin) {
          page = pdfDoc.addPage([595.28, 841.89]);
          y = page.getHeight() - margin;
        }

        const label = adj.filename || 'Imagen adjunta';
        const labelHeight = fontSize + 6;
        const spaceNeeded = labelHeight + imgHeight + 12;
        if (y - spaceNeeded < margin) {
          page = pdfDoc.addPage([595.28, 841.89]);
          y = page.getHeight() - margin;
        }
        addLine(label);
        if (y - imgHeight < margin) {
          page = pdfDoc.addPage([595.28, 841.89]);
          y = page.getHeight() - margin;
        }
        page.drawImage(embeddedImage, {
          x: margin + (maxWidth - imgWidth) / 2,
          y: y - imgHeight,
          width: imgWidth,
          height: imgHeight
        });
        y -= imgHeight + 12;
      }
    }

    if (payload?.note) {
      addLine('Notas del cliente', { bold: true, size: 14 });
      String(payload.note)
        .split(/\r?\n/)
        .forEach(line => addLine(line || ''));
      addLine('');
    }

    if (totals.area || totals.length || totals.price) {
      addLine('Metricas', { bold: true, size: 14 });
      if (totals.area) addLine(`Area total: ${Number(totals.area).toFixed(1)} cm²`);
      if (totals.length) addLine(`Largo total estimado: ${Number(totals.length).toFixed(1)} cm (${(Number(totals.length) / 100).toFixed(2)} m)`);
      if (totals.price) addLine(`Costo total estimado: ${formatCurrencyCLP(totals.price)}`);
      addLine('');
    }

    addLine('---', { bold: true });
    addLine('Documento generado automaticamente desde el panel de operadores de Kingstone.', { size: 10 });

    const pdfBytes = await pdfDoc.save();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="cotizacion-${pedido.id}.pdf"`);
    res.send(Buffer.from(pdfBytes));
  } catch (error) {
    console.error('Error generando PDF de cotizacion', error);
    res.status(500).json({ message: 'Error interno' });
  }
});

router.get('/:id/files/jobs', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) {
      return res.status(400).json({ message: 'ID invalido' });
    }
    const user = (req as any).user as JwtUser | undefined;
    if (!user) {
      return res.status(401).json({ message: 'No autorizado' });
    }

    const pedido = await prisma.pedido.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        clienteEmail: true,
        processingJobs: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            status: true,
            retryCount: true,
            lastError: true,
            createdAt: true,
            startedAt: true,
            completedAt: true,
            updatedAt: true
          }
        }
      }
    });

    if (!pedido) {
      return res.status(404).json({ message: 'Pedido no encontrado' });
    }
    const canOperator = isOperator(user.role);
    const canOwner = canAccessPedido(user, { userId: pedido.userId ?? null, clienteEmail: pedido.clienteEmail ?? null });
    if (!(canOperator || canOwner)) {
      return res.status(403).json({ message: 'No autorizado' });
    }

    res.json({
      pedidoId: pedido.id,
      jobs: pedido.processingJobs.map(job => ({
        id: job.id,
        status: job.status,
        retryCount: job.retryCount,
        lastError: job.lastError,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        updatedAt: job.updatedAt
      }))
    });
  } catch (error) {
    console.error('Error listando trabajos de archivos de pedido', error);
    res.status(500).json({ message: 'Error interno' });
  }
});

router.get('/:id/files', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) {
      return res.status(400).json({ message: 'ID invalido' });
    }
    const user = (req as any).user as JwtUser | undefined;
    const pedido = await prisma.pedido.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        clienteEmail: true
      }
    });
    if (!pedido) {
      return res.status(404).json({ message: 'Pedido no encontrado' });
    }
    if (!canAccessPedido(user, pedido)) {
      return res.status(403).json({ message: 'No autorizado' });
    }
    const adjuntos = await prisma.pedidoAdjunto.findMany({
      where: { pedidoId: id },
      orderBy: { createdAt: 'desc' }
    });
    const response = adjuntos.map(file => ({
      id: file.id,
      filename: file.filename,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      widthCm: file.widthCm,
      lengthCm: file.lengthCm,
      areaCm2: file.areaCm2,
      createdAt: file.createdAt
    }));
    res.json(response);
  } catch (error) {
    console.error('Error listando archivos de pedido', error);
    res.status(500).json({ message: 'Error interno' });
  }
});

router.get('/:id/files/:fileId', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const fileId = Number(req.params.fileId);
    if (!id || !fileId) {
      return res.status(400).json({ message: 'ID invalido' });
    }
    const user = (req as any).user as JwtUser | undefined;
    const file = await prisma.pedidoAdjunto.findUnique({
      where: { id: fileId },
      include: {
        pedido: {
          select: {
            id: true,
            userId: true,
            clienteEmail: true
          }
        }
      }
    });
    if (!file || file.pedidoId !== id) {
      return res.status(404).json({ message: 'Archivo no encontrado' });
    }
    if (!canAccessPedido(user, file.pedido)) {
      return res.status(403).json({ message: 'No autorizado' });
    }
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.filename)}"`);
    res.send(Buffer.from(file.data));
  } catch (error) {
    console.error('Error descargando archivo de pedido', error);
    res.status(500).json({ message: 'Error interno' });
  }
});

router.post('/:id/files', upload.array('files', 10), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) {
      return res.status(400).json({ message: 'ID invalido' });
    }
    const files = (req.files as Express.Multer.File[]) || [];
    if (!files.length) {
      return res.status(400).json({ message: 'Debes adjuntar al menos un archivo' });
    }
    const user = (req as any).user as JwtUser | undefined;
    const pedido = await prisma.pedido.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        clienteEmail: true,
        materialId: true,
        materialLabel: true,
        payload: true
      }
    });
    if (!pedido) {
      return res.status(404).json({ message: 'Pedido no encontrado' });
    }
    if (!canAccessPedido(user, pedido)) {
      return res.status(403).json({ message: 'No autorizado' });
    }

    const materialId = extractMaterialIdFromPedido(pedido);
    const fallbackWidth = extractMaterialWidthFromPedido(pedido);

    const storedFiles: Array<{
      path: string;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
    }> = [];
    const errors: Array<{ filename: string; message: string }> = [];

    for (const file of files) {
      if (!file.path) {
        errors.push({
          filename: file.originalname || file.filename || 'archivo',
          message: 'No se pudo almacenar el archivo temporalmente'
        });
        continue;
      }
      storedFiles.push({
        path: file.path,
        originalName: file.originalname || file.filename || path.basename(file.path),
        mimeType: file.mimetype,
        sizeBytes: file.size
      });
    }

    if (!storedFiles.length) {
      for (const file of files) {
        if (file.path) {
          await fsPromises.unlink(file.path).catch(() => undefined);
        }
      }
      const firstError = errors[0]?.message || 'No se pudieron almacenar los archivos';
      return res.status(400).json({ message: firstError, errors });
    }

    try {
      const job = await prisma.fileProcessingJob.create({
        data: {
          pedidoId: id,
          status: 'PENDING',
          payload: {
            files: storedFiles,
            materialId,
            fallbackWidth,
            clienteEmail: pedido.clienteEmail ?? null
          }
        },
        select: {
          id: true,
          status: true,
          createdAt: true
        }
      });

      res.status(202).json({
        ok: true,
        job: {
          id: job.id,
          status: job.status,
          createdAt: job.createdAt,
          files: storedFiles.map(file => ({
            originalName: file.originalName,
            mimeType: file.mimeType,
            sizeBytes: file.sizeBytes
          }))
        },
        errors
      });
    } catch (error) {
      for (const file of storedFiles) {
        await fsPromises.unlink(file.path).catch(() => undefined);
      }
      throw error;
    }
  } catch (error: any) {
    if (error?.code === 'INSUFFICIENT_STOCK') {
      return res.status(409).json({
        message: 'No hay stock suficiente para registrar los archivos.',
        detalles: error?.details || null
      });
    }
    console.error('Error subiendo archivos de pedido', error);
    res.status(500).json({ message: 'Error interno' });
  }
});

router.post('/:id/ack', async (req, res) => {
  try {
    const user = (req as any).user as JwtUser | undefined;
    const userId = user?.sub ? Number(user.sub) : null;
    if (!user || !isOperator(user.role)) {
      return res.status(403).json({ message: 'Requiere rol operador' });
    }

    const id = Number(req.params.id);
    if (!id) {
      return res.status(400).json({ message: 'ID invalido' });
    }

    const pedido = await prisma.pedido.findUnique({ where: { id } });
    if (!pedido) {
      return res.status(404).json({ message: 'Pedido no encontrado' });
    }

    const estadoBody = typeof req.body?.estado === 'string' ? String(req.body.estado).trim().toUpperCase() : undefined;
    const allowedStates = ['EN_REVISION', 'POR_PAGAR', 'EN_PRODUCCION', 'LISTO_RETIRO', 'COMPLETADO'];
    const nextEstado = estadoBody
      ? allowedStates.includes(estadoBody) ? estadoBody : null
      : (pedido.estado === 'PENDIENTE' ? 'EN_REVISION' : pedido.estado);

    if (!nextEstado) {
      return res.status(400).json({ message: 'Estado no soportado' });
    }

    const notificado = nextEstado === 'POR_PAGAR' ? true : false;

    const updated = await prisma.pedido.update({
      where: { id },
      data: {
        estado: nextEstado,
        notificado
      },
      select: {
        id: true,
        estado: true,
        notificado: true,
        clienteEmail: true,
        clienteNombre: true,
        total: true,
        subtotal: true,
        taxTotal: true,
        moneda: true,
        materialLabel: true,
        payload: true,
        createdAt: true
      }
    });

    const operatorContact = await getOperatorContact(userId);

    await notifyPedidoEstado({
      id: updated.id,
      estado: updated.estado,
      clienteEmail: updated.clienteEmail || null,
      clienteNombre: updated.clienteNombre || null,
      total: typeof updated.total === 'number' ? updated.total : null,
      subtotal: typeof updated.subtotal === 'number' ? updated.subtotal : null,
      taxTotal: typeof updated.taxTotal === 'number' ? updated.taxTotal : null,
      currency: updated.moneda || CURRENCY_CODE,
      materialLabel: updated.materialLabel || null,
      payload: updated.payload,
      createdAt: updated.createdAt,
      operadorEmail: operatorContact.email,
      operadorNombre: operatorContact.nombre
    });

    res.json(updated);
  } catch (error) {
    console.error('Error confirmando pedido', error);
    res.status(500).json({ message: 'Error interno' });
  }
});

export default router;

