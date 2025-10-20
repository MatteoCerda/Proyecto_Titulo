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
  previewUrl: z.string().optional().or(z.null()).optional()
});

const placementSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  previewUrl: z.string().optional().or(z.null()).optional()
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

function isOperator(role?: string | null) {
  if (!role) return false;
  const normalized = role.toUpperCase();
  return normalized === 'OPERATOR' || normalized === 'ADMIN';
}

router.post('/', async (req, res) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues?.[0];
      return res.status(400).json({
        message: issue?.message || 'Solicitud invalida',
        issues: parsed.error.issues
      });
    }
    const dto = parsed.data;
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

    const itemsCount = dto.items.reduce((acc, item) => acc + item.quantity, 0);
    const total = Math.round(dto.totalPrice || 0);

    const pedido = await prisma.pedido.create({
      data: {
        userId,
        clienteEmail: email,
        clienteNombre: nombre,
        estado: 'PENDIENTE',
        notificado: true,
        total,
        itemsCount,
        materialId: dto.materialId,
        materialLabel: dto.materialLabel,
        payload: {
          ...dto,
          createdAt: new Date().toISOString(),
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
    const user = (req as any).user as { role?: string } | undefined;
    if (!user || !isOperator(user.role)) {
      return res.status(403).json({ message: 'Requiere rol operador' });
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
    const nextEstado = estadoBody || (pedido.estado === 'PENDIENTE' ? 'EN_REVISION' : pedido.estado);

    const updated = await prisma.pedido.update({
      where: { id },
      data: {
        estado: nextEstado,
        notificado: false
      },
      select: {
        id: true,
        estado: true,
        notificado: true
      }
    });

    res.json(updated);
  } catch (error) {
    console.error('Error confirmando pedido', error);
    res.status(500).json({ message: 'Error interno' });
  }
});

export default router;
