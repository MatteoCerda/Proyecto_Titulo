import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import multer from 'multer';
import { PDFDocument } from 'pdf-lib';
import { imageSize } from 'image-size';
import type { Express } from 'express';

const router = Router();
const prisma = new PrismaClient();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 10 }
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

type JwtUser = { sub?: number; email?: string; role?: string };

function normalizeMaterialKey(value?: string | null): string | null {
  if (!value || typeof value !== 'string') return null;
  return value.toLowerCase().replace(/[\s_\-]/g, '');
}

async function findInventoryByMaterial(materialId?: string | null) {
  const key = normalizeMaterialKey(materialId);
  if (!key) return null;
  const whereClauses: any[] = [];
  if (materialId && materialId.length) {
    whereClauses.push({ code: { equals: materialId } });
    whereClauses.push({ name: { equals: materialId, mode: 'insensitive' as const } });
  }
  if (key && key.length) {
    whereClauses.push({ code: { equals: key } });
  }
  if (!whereClauses.length) {
    return null;
  }
  const item = await prisma.inventoryItem.findFirst({
    where: { OR: whereClauses }
  });
  return item;
}

function getMaterialWidth(materialId?: string | null, fallback?: number): number | null {
  const key = normalizeMaterialKey(materialId);
  if (key && MATERIAL_WIDTH_MAP[key]) {
    return MATERIAL_WIDTH_MAP[key];
  }
  return typeof fallback === 'number' && fallback > 0 ? fallback : null;
}

function canAccessPedido(user: JwtUser | undefined, pedido: { userId: number | null; clienteEmail: string | null }): boolean {
  if (!user) return false;
  if (isOperator(user.role)) return true;
  const userId = user.sub ? Number(user.sub) : null;
  if (userId && pedido.userId && pedido.userId === userId) return true;
  if (pedido.clienteEmail && user.email && pedido.clienteEmail.toLowerCase() === user.email.toLowerCase()) return true;
  return false;
}

function parsePayload(payload: any): any {
  if (payload && typeof payload === 'object') {
    return payload;
  }
  try {
    return JSON.parse(payload);
  } catch {
    return {};
  }
}

function extractMaterialIdFromPedido(pedido: any): string | null {
  if (typeof pedido?.materialId === 'string' && pedido.materialId.length) {
    return pedido.materialId;
  }
  const payload = parsePayload(pedido?.payload);
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

function extractMaterialWidthFromPedido(pedido: any): number | null {
  if (typeof pedido?.materialWidthCm === 'number') {
    return pedido.materialWidthCm;
  }
  const payload = parsePayload(pedido?.payload);
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

async function calculateAttachmentMetrics(
  file: Express.Multer.File,
  materialId: string | null,
  fallbackWidth?: number | null
) {
  const buffer = file.buffer;
  const originalName = file.originalname || 'archivo';
  const mime = file.mimetype?.toLowerCase() || '';
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

async function adjustMaterialStock(materialId: string | null, deltaLengthCm: number) {
  if (!materialId) return;
  if (!deltaLengthCm || Math.abs(deltaLengthCm) < 0.01) return;
  const inventory = await findInventoryByMaterial(materialId);
  if (!inventory) return;
  const meters = deltaLengthCm / 100;
  if (meters > 0) {
    const decrement = Math.max(1, Math.ceil(meters));
    try {
      await prisma.inventoryItem.update({
        where: { id: inventory.id },
        data: { quantity: { decrement } }
      });
    } catch {
      await prisma.inventoryItem.updateMany({
        where: { id: inventory.id, quantity: { gte: decrement } },
        data: { quantity: { decrement } }
      });
    }
  } else {
    const increment = Math.max(1, Math.ceil(Math.abs(meters)));
    await prisma.inventoryItem.update({
      where: { id: inventory.id },
      data: { quantity: { increment } }
    });
  }
}

async function decrementInventoryItem(itemId: number, quantity: number) {
  if (!itemId || quantity <= 0) return;
  try {
    await prisma.inventoryItem.update({
      where: { id: itemId },
      data: { quantity: { decrement: quantity } }
    });
  } catch {
    await prisma.inventoryItem.updateMany({
      where: { id: itemId, quantity: { gte: quantity } },
      data: { quantity: { decrement: quantity } }
    });
  }
}

async function adjustCatalogStock(products: any[] | undefined | null) {
  if (!Array.isArray(products)) return;
  for (const product of products) {
    const itemId = typeof product?.id === 'number' ? product.id : null;
    const quantity = typeof product?.quantity === 'number' ? product.quantity : null;
    if (itemId && quantity && quantity > 0) {
      await decrementInventoryItem(itemId, quantity);
    }
  }
}

async function adjustQuoteStock(materialId: string | null, quote: any) {
  if (!quote) return;
  const usedHeight = typeof quote?.usedHeight === 'number' ? quote.usedHeight : null;
  if (!usedHeight || usedHeight <= 0) return;
  await adjustMaterialStock(materialId, usedHeight);
}

async function recomputePedidoAggregates(pedidoId: number) {
  const pedido = await prisma.pedido.findUnique({
    where: { id: pedidoId },
    include: { adjuntos: true }
  });
  if (!pedido) {
    return null;
  }

  const payload = parsePayload(pedido.payload);
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
  const inventory = await findInventoryByMaterial(materialId);
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

  await prisma.pedido.update({
    where: { id: pedidoId },
    data: {
      payload: nextPayload as any,
      total: pedido.total && pedido.total > 0 ? pedido.total : (totalPrice ?? pedido.total)
    }
  });

  const deltaLength = totalLength - (oldLength || 0);
  if (deltaLength) {
    await adjustMaterialStock(materialId, deltaLength);
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
  materialLabel: string | null;
  payload: any;
  createdAt: Date;
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

async function notifyPedidoEstado(pedido: PedidoNotifyPayload) {
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
    material: pedido.materialLabel ?? null,
    origen: typeof pedido.payload === 'object' && pedido.payload !== null ? (pedido.payload as any).source ?? null : null
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
    }
  } catch (error) {
    console.error('[pedidos] Error enviando notificacion', error);
  }
}

router.post('/', async (req, res) => {
  try {
    const isCartSource = typeof req.body?.source === 'string' && req.body.source === 'cart';
    const parsed = isCartSource ? cartCreateSchema.safeParse(req.body) : createSchema.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues?.[0];
      return res.status(400).json({
        message: issue?.message || 'Solicitud invalida',
        issues: parsed.error.issues
      });
    }
    const dto = parsed.data as typeof parsed.data;
    const payloadUser = (req as any).user as { sub?: number; email?: string } | undefined;
    const userId = payloadUser?.sub ? Number(payloadUser.sub) : null;

    let email: string | null = payloadUser?.email ?? null;
    let nombre: string | null = null;

    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, fullName: true }
      });
      if (user) {
        email = user.email;
        nombre = user.fullName;
      }
    }

    const nowIso = new Date().toISOString();

    if (isCartSource) {
      const cartDto = dto as z.infer<typeof cartCreateSchema>;
      const productsCount = cartDto.products.reduce((acc, item) => acc + item.quantity, 0);
      const quoteCount = cartDto.quote?.items?.reduce((acc, item) => acc + item.quantity, 0) ?? 0;
      const itemsCount = productsCount + quoteCount;
      const catalogTotal = cartDto.products.reduce((acc, item) => acc + item.price * item.quantity, 0);
      const total = Math.round(catalogTotal + (cartDto.quote?.totalPrice ?? 0));
      const materialId = cartDto.quote?.materialId ?? null;
      const materialLabel = cartDto.quote?.materialLabel ?? null;

      const pedido = await prisma.pedido.create({
        data: {
          userId,
          clienteEmail: email,
          clienteNombre: nombre,
          estado: 'PENDIENTE',
          notificado: true,
          total,
          itemsCount,
          materialId,
          materialLabel,
          payload: {
            source: 'cart',
            products: cartDto.products,
            quote: cartDto.quote ?? null,
            note: cartDto.note ?? null,
            createdAt: nowIso,
            cliente: { email, nombre }
          }
        },
        select: { id: true }
      });

      await adjustCatalogStock(cartDto.products);
      await adjustQuoteStock(materialId, cartDto.quote);

      return res.status(201).json({ id: pedido.id });
    }

    const designerDto = dto as z.infer<typeof createSchema>;
    const itemsCount = designerDto.items.reduce((acc, item) => acc + item.quantity, 0);
    const total = Math.round(designerDto.totalPrice || 0);

    const pedido = await prisma.pedido.create({
      data: {
        userId,
        clienteEmail: email,
        clienteNombre: nombre,
        estado: 'PENDIENTE',
        notificado: true,
        total,
        itemsCount,
        materialId: designerDto.materialId,
        materialLabel: designerDto.materialLabel,
        payload: {
          source: 'designer',
          ...designerDto,
          createdAt: nowIso,
          cliente: {
            email,
            nombre
          }
        }
      },
      select: { id: true }
    });

    await adjustMaterialStock(designerDto.materialId, designerDto.usedHeight);

    res.status(201).json({ id: pedido.id });
  } catch (error) {
    console.error('Error creando pedido', error);
    res.status(500).json({ message: 'Error interno' });
  }
});

router.get('/', async (req, res) => {
  try {
    const user = (req as any).user as { role?: string; sub?: number; email?: string } | undefined;
    const isOp = isOperator(user?.role);
    if (!isOp) {
      const userId = user?.sub ? Number(user.sub) : null;
      const email = user?.email ?? null;
      if (!userId && !email) {
        return res.json([]);
      }

      const pedidoWhere: any = {
        OR: [
          userId ? { userId } : undefined,
          email ? { clienteEmail: email } : undefined
        ].filter(Boolean)
      };

      if (!pedidoWhere.OR || !pedidoWhere.OR.length) {
        return res.json([]);
      }

      const statusRaw = (req.query.status as string | undefined)?.trim();
      const status = statusRaw && statusRaw.length ? statusRaw.toUpperCase() : undefined;
      if (status && status !== 'TODOS') {
        pedidoWhere.estado = status;
      }

      const pedidos = await prisma.pedido.findMany({
        where: pedidoWhere,
        orderBy: { id: 'desc' },
        take: 50
      });

      const respuesta = pedidos.map(p => ({
        id: p.id,
        cliente: p.clienteNombre || p.clienteEmail || 'Tu pedido',
        email: p.clienteEmail || email || '',
        estado: p.estado,
        createdAt: p.createdAt,
        total: p.total || undefined,
        items: p.itemsCount || undefined,
        materialLabel: p.materialLabel || undefined,
        note: typeof p.payload === 'object' && p.payload !== null ? (p.payload as any).note ?? undefined : undefined,
        payload: p.payload
      }));

      return res.json(respuesta);
    }

    const statusRaw = (req.query.status as string | undefined)?.trim();
    const status = statusRaw && statusRaw.length ? statusRaw.toUpperCase() : 'PENDIENTE';
    const where: any = {};
    if (status !== 'TODOS') {
      where.estado = status;
    }

    const pedidos = await prisma.pedido.findMany({
      where,
      orderBy: { id: 'desc' },
      take: 100
    });

    const respuesta = pedidos.map(p => ({
      id: p.id,
      cliente: p.clienteNombre || p.clienteEmail || 'Cliente',
      email: p.clienteEmail || '',
      estado: p.estado,
      createdAt: p.createdAt,
      total: p.total || undefined,
      items: p.itemsCount || undefined,
      notificado: p.notificado,
      materialLabel: p.materialLabel || undefined,
      note: typeof p.payload === 'object' && p.payload !== null ? (p.payload as any).note ?? undefined : undefined,
      payload: p.payload
    }));

    res.json(respuesta);
  } catch (error) {
    console.error('Error listando pedidos', error);
    res.status(500).json({ message: 'Error interno' });
  }
});

router.get('/admin/clientes', async (req, res) => {
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

    const created: Array<{ id: number; filename: string }> = [];
    const errors: Array<{ filename: string; message: string }> = [];

    for (const file of files) {
      try {
        const metrics = await calculateAttachmentMetrics(file, materialId, fallbackWidth);
        const createdFile = await prisma.pedidoAdjunto.create({
          data: {
            pedidoId: id,
            filename: file.originalname || file.filename || 'archivo',
            mimeType: file.mimetype,
            sizeBytes: file.size,
            widthCm: metrics.widthCm,
            heightCm: metrics.heightCm,
            areaCm2: metrics.areaCm2,
            lengthCm: metrics.lengthCm,
            data: Buffer.from(file.buffer)
          }
        });
        created.push({ id: createdFile.id, filename: createdFile.filename });
      } catch (inner) {
        console.error('Error procesando archivo adjunto', inner);
        errors.push({
          filename: file.originalname || file.filename || 'archivo',
          message: inner instanceof Error ? inner.message : 'Error desconocido'
        });
      }
    }

    await recomputePedidoAggregates(id);

    res.status(201).json({ ok: true, created, errors });
  } catch (error) {
    console.error('Error subiendo archivos de pedido', error);
    res.status(500).json({ message: 'Error interno' });
  }
});

router.post('/:id/ack', async (req, res) => {
  try {
    const user = (req as any).user as { role?: string } | undefined;
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
    const allowedStates = ['EN_REVISION', 'POR_PAGAR'];
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
        materialLabel: true,
        payload: true,
        createdAt: true
      }
    });

    await notifyPedidoEstado({
      id: updated.id,
      estado: updated.estado,
      clienteEmail: updated.clienteEmail || null,
      clienteNombre: updated.clienteNombre || null,
      total: typeof updated.total === 'number' ? updated.total : null,
      materialLabel: updated.materialLabel || null,
      payload: updated.payload,
      createdAt: updated.createdAt
    });

    res.json(updated);
  } catch (error) {
    console.error('Error confirmando pedido', error);
    res.status(500).json({ message: 'Error interno' });
  }
});

export default router;

