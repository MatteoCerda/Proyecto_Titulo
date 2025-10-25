import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const router = Router();
const prisma = new PrismaClient();

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
