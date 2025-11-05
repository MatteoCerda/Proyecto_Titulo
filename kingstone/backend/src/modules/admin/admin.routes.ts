import { Router } from 'express';
import { register as registerUser } from '../auth/auth.service';
import { validate } from '../auth/auth.validation';
import { ZodError, z } from 'zod';
import { prisma } from '../../lib/prisma';

const router = Router();

const DASHBOARD_ALLOWED_STATES = [
  'PENDIENTE',
  'EN_REVISION',
  'POR_PAGAR',
  'EN_IMPRESION',
  'EN_PRODUCCION',
  'COMPLETADO'
] as const;

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

router.get('/dashboard/overview', async (_req, res) => {
  try {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const yearWindowStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    const pedidos = await prisma.pedido.findMany({
      where: {
        estado: { in: DASHBOARD_ALLOWED_STATES as unknown as string[] },
        createdAt: { gte: yearWindowStart }
      },
      select: {
        total: true,
        materialLabel: true,
        materialId: true,
        clienteNombre: true,
        clienteEmail: true,
        createdAt: true,
        estado: true,
        payload: true
      }
    });

    const monthlyPedidos = pedidos.filter(p => p.createdAt >= currentMonthStart && p.createdAt < currentMonthEnd);
    const previousMonthPedidos = pedidos.filter(p => p.createdAt >= previousMonthStart && p.createdAt < currentMonthStart);

    const monthlyTotal = monthlyPedidos.reduce((acc, item) => acc + (typeof item.total === 'number' ? item.total : 0), 0);
    const previousMonthTotal = previousMonthPedidos.reduce((acc, item) => acc + (typeof item.total === 'number' ? item.total : 0), 0);
    const monthlyOrderCount = monthlyPedidos.length;
    const avgTicket = monthlyOrderCount ? Math.round(monthlyTotal / monthlyOrderCount) : 0;
    const growthVsPrev =
      previousMonthTotal > 0 ? Number(((monthlyTotal - previousMonthTotal) / previousMonthTotal * 100).toFixed(1)) : null;

    const distributionMap = new Map<
      string,
      { label: string; total: number; orders: number }
    >();
    for (const pedido of monthlyPedidos) {
      const safeTotal = typeof pedido.total === 'number' ? pedido.total : 0;
      const label =
        (pedido.materialLabel && pedido.materialLabel.trim()) ||
        (pedido.materialId && pedido.materialId.trim()) ||
        'Sin material';
      const key = label.toLowerCase();
      const entry = distributionMap.get(key) ?? { label, total: 0, orders: 0 };
      entry.total += safeTotal;
      entry.orders += 1;
      entry.label = label;
      distributionMap.set(key, entry);
    }
    const distributionTotal = Array.from(distributionMap.values()).reduce((acc, item) => acc + item.total, 0) || 0;
    const materialDistribution = Array.from(distributionMap.values())
      .map(item => ({
        label: item.label,
        total: item.total,
        orders: item.orders,
        percentage: distributionTotal ? Number(((item.total / distributionTotal) * 100).toFixed(1)) : 0
      }))
      .sort((a, b) => b.total - a.total);

    const clientMap = new Map<
      string,
      { label: string; email: string | null; total: number; orders: number }
    >();
    for (const pedido of monthlyPedidos) {
      const safeTotal = typeof pedido.total === 'number' ? pedido.total : 0;
      const email = (pedido.clienteEmail || '').toLowerCase() || null;
      const label = pedido.clienteNombre?.trim() || pedido.clienteEmail?.trim() || 'Cliente sin nombre';
      const key = email || label.toLowerCase();
      const entry = clientMap.get(key) ?? { label, email, total: 0, orders: 0 };
      entry.total += safeTotal;
      entry.orders += 1;
      entry.label = label;
      entry.email = email;
      clientMap.set(key, entry);
    }
    const topClients = Array.from(clientMap.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
      .map((item, index) => ({
        rank: index + 1,
        label: item.label,
        email: item.email,
        total: item.total,
        orders: item.orders,
        percentage: monthlyTotal ? Number(((item.total / monthlyTotal) * 100).toFixed(1)) : 0
      }));

    const productMap = new Map<
      string,
      { label: string; quantity: number; total: number }
    >();

    const parsePayload = (raw: any): any => {
      if (!raw) {
        return null;
      }
      if (typeof raw === 'string') {
        try {
          return JSON.parse(raw);
        } catch {
          return null;
        }
      }
      return raw;
    };

    const pushProduct = (name?: string | null, quantity?: number | string | null, total?: number | string | null) => {
      if (!name) {
        return;
      }
      const normalized = name.trim();
      if (!normalized.length) {
        return;
      }
      const qtyValue = quantity !== null && quantity !== undefined ? Number(quantity) : NaN;
      const totalValue = total !== null && total !== undefined ? Number(total) : 0;
      const key = normalized.toLowerCase();
      const entry = productMap.get(key) ?? { label: normalized, quantity: 0, total: 0 };
      if (!Number.isNaN(qtyValue)) {
        entry.quantity += qtyValue;
      }
      if (!Number.isNaN(totalValue)) {
        entry.total += totalValue;
      }
      entry.label = normalized;
      productMap.set(key, entry);
    };

    for (const pedido of monthlyPedidos) {
      const payload = parsePayload(pedido.payload);
      if (!payload) {
        continue;
      }
      if (Array.isArray(payload.products)) {
        payload.products.forEach((item: any) => {
          pushProduct(item?.name, item?.quantity, typeof item?.price === 'number' ? item.price * (item.quantity ?? 1) : item?.price);
        });
      }
      if (Array.isArray(payload.items)) {
        payload.items.forEach((item: any) => {
          pushProduct(item?.displayName || item?.name, item?.quantity);
        });
      }
      if (Array.isArray(payload.quote?.items)) {
        payload.quote.items.forEach((item: any) => {
          pushProduct(item?.name, item?.quantity);
        });
      }
    }

    const productRanking = Array.from(productMap.values())
      .filter(item => item.quantity > 0)
      .map(item => ({
        label: item.label,
        quantity: item.quantity,
        total: Math.round(item.total)
      }));

    const topProducts = [...productRanking].sort((a, b) => b.quantity - a.quantity || b.total - a.total).slice(0, 10);
    const leastProducts = [...productRanking].sort((a, b) => a.quantity - b.quantity || a.total - b.total).slice(0, 10);

    const paymentFunnel = (() => {
      const funnel = {
        total: monthlyPedidos.length,
        pendientes: 0,
        enRevision: 0,
        porPagar: 0,
        enProduccion: 0,
        completados: 0
      };
      for (const pedido of monthlyPedidos) {
        switch (pedido.estado) {
          case 'PENDIENTE':
            funnel.pendientes += 1;
            break;
          case 'EN_REVISION':
            funnel.enRevision += 1;
            break;
          case 'POR_PAGAR':
            funnel.porPagar += 1;
            break;
          case 'EN_PRODUCCION':
          case 'EN_IMPRESION':
            funnel.enProduccion += 1;
            break;
          case 'COMPLETADO':
            funnel.completados += 1;
            break;
          default:
            break;
        }
      }
      const rate = funnel.total > 0 ? Number(((funnel.porPagar / funnel.total) * 100).toFixed(1)) : 0;
      return { ...funnel, porPagarRate: rate };
    })();

    const monthlyTrend = [];
    for (let i = 11; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${monthDate.getFullYear()}-${monthDate.getMonth()}`;
      const nextMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1);
      const periodPedidos = pedidos.filter(p => p.createdAt >= monthDate && p.createdAt < nextMonth);
      const total = periodPedidos.reduce((acc, item) => acc + (typeof item.total === 'number' ? item.total : 0), 0);
      monthlyTrend.push({
        key: monthKey,
        label: `${MONTH_LABELS[monthDate.getMonth()]} ${monthDate.getFullYear()}`,
        shortLabel: MONTH_LABELS[monthDate.getMonth()],
        month: monthDate.getMonth(),
        year: monthDate.getFullYear(),
        total,
        orders: periodPedidos.length
      });
    }

    const rollingYearTotal = monthlyTrend.reduce((acc, item) => acc + item.total, 0);

    res.json({
      generatedAt: now.toISOString(),
      range: {
        monthlyStart: currentMonthStart.toISOString(),
        monthlyEnd: currentMonthEnd.toISOString(),
        yearlyStart: yearWindowStart.toISOString(),
        yearlyEnd: currentMonthEnd.toISOString()
      },
      totals: {
        monthlySales: monthlyTotal,
        monthlyOrders: monthlyOrderCount,
        averageTicket: avgTicket,
        monthlyGrowth: growthVsPrev,
        rollingYearSales: rollingYearTotal
      },
      materialDistribution,
      topClients,
      monthlyTrend,
      topProducts,
      leastProducts,
      paymentFunnel
    });
  } catch (error) {
    console.error('Error generando resumen de dashboard admin', error);
    res.status(500).json({ message: 'Error interno' });
  }
});

function handleZodError(err: ZodError, res: any) {
  const first = err.issues?.[0];
  res.status(400).json({
    message: first?.message || 'Datos invalidos',
    issues: err.issues?.map(issue => ({
      path: issue.path,
      message: issue.message
    }))
  });
}

const inventoryCreateSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  itemType: z.string().min(1),
  color: z.string().min(1),
  provider: z.string().min(1),
  quantity: z.coerce.number().int().min(0).default(0),
  priceWeb: z.coerce.number().int().min(0).default(0),
  priceStore: z.coerce.number().int().min(0).default(0),
  priceWsp: z.coerce.number().int().min(0).default(0),
  umbralBajoStock: z.coerce.number().int().min(0).default(0),
  qrRaw: z.string().optional(),
  imageUrl: z.string().min(1).optional()
});

const inventoryUpdateSchema = inventoryCreateSchema.partial();

const offerCreateSchema = z.object({
  titulo: z.string().min(1),
  descripcion: z.string().optional(),
  imageUrl: z.string().url().optional(),
  link: z.string().url().optional(),
  activo: z.coerce.boolean().optional(),
  prioridad: z.coerce.number().int().min(0).optional(),
  itemId: z.coerce.number().int().optional(),
  startAt: z.coerce.date().optional(),
  endAt: z.coerce.date().optional(),
  precioOferta: z.coerce.number().int().min(0).optional()
});

const offerUpdateSchema = offerCreateSchema.partial();

function normalizeKey(key: string) {
  return key
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function parseQrPayload(qrRaw?: string) {
  if (!qrRaw) return {};
  const data: any = {};
  const lines = qrRaw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  for (const line of lines) {
    const [rawKey, ...rest] = line.split(':');
    if (!rawKey || !rest.length) continue;
    const key = normalizeKey(rawKey);
    const value = rest.join(':').trim();
    if (!value) continue;
    if (key.startsWith('codigo')) data.code = value;
    else if (key.startsWith('nombre')) data.name = value;
    else if (key.startsWith('tipo')) data.itemType = value;
    else if (key.startsWith('color')) data.color = value;
    else if (key.startsWith('proveedor')) data.provider = value;
  }
  if (data.code) {
    const parts = String(data.code).split('_');
    if (!data.name && parts.length > 0) data.name = parts[0];
    if (!data.itemType && parts.length > 1) data.itemType = parts[1];
    if (!data.color && parts.length > 2) data.color = parts[2];
    if (!data.provider && parts.length > 3) data.provider = parts[parts.length - 1];
  }
  return data;
}

// Usuario: crear
router.post('/users', async (req, res) => {
  try {
    const dto = validate('register', req.body);
    const user = await registerUser(dto, { allowRoleOverride: true, defaultRole: 'user' });
    res.status(201).json(user);
  } catch (err: any) {
    if (err instanceof ZodError) {
      return handleZodError(err, res);
    }
    if (err?.message === 'EMAIL_IN_USE') {
      return res.status(409).json({ message: 'Email ya registrado' });
    }
    res.status(500).json({ message: 'Error interno' });
  }
});

// Usuario: listar
router.get('/users', async (req, res) => {
  const q = (req.query.q as string | undefined)?.trim() || '';
  const role = (req.query.role as string | undefined)?.trim();
  const where: any = {};
  if (q) {
    where.OR = [
      { email: { contains: q } },
      { fullName: { contains: q } }
    ];
  }
  if (role) where.role = role;
  const users = await prisma.user.findMany({
    where,
    orderBy: { id: 'asc' },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      createdAt: true,
      cliente: {
        select: {
          rut: true,
          nombre_contacto: true,
          telefono: true,
          direccion: true,
          comuna: true,
          ciudad: true
        }
      }
    }
  });
  res.json(users);
});

// Usuario: detalle
router.get('/users/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID invalido' });
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      cliente: {
        select: {
          rut: true,
          nombre_contacto: true,
          telefono: true,
          direccion: true,
          comuna: true,
          ciudad: true
        }
      }
    }
  });
  if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
  res.json(user);
});

// Usuario: actualizar
router.patch('/users/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID invalido' });
  const { role, fullName, perfil } = req.body || {};
  try {
    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(fullName ? { fullName } : {}),
        ...(role ? { role } : {})
      },
      select: { id: true, email: true, fullName: true, role: true }
    });
    if (perfil) {
      await (prisma as any).cliente.upsert({
        where: { id_usuario: id },
        create: {
          id_usuario: id,
          email: user.email,
          ...perfil
        },
        update: { ...perfil }
      });
    }
    res.json(user);
  } catch (e) {
    res.status(404).json({ message: 'Usuario no encontrado' });
  }
});

// Usuario: eliminar (batch)
router.delete('/users', async (req, res) => {
  const ids = (req.body?.ids as number[] | undefined) || [];
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ message: 'ids requerido' });
  }
  await prisma.$transaction([
    (prisma as any).cliente.deleteMany({ where: { id_usuario: { in: ids } } }),
    prisma.user.deleteMany({ where: { id: { in: ids } } })
  ]);
  res.json({ ok: true });
});

// Inventario: listar
router.get('/inventory', async (_req, res) => {
  const items = await prisma.inventoryItem.findMany({
    orderBy: { name: 'asc' }
  });
  res.json(items);
});

// Inventario: detalle
router.get('/inventory/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID invalido' });
  const item = await prisma.inventoryItem.findUnique({ where: { id } });
  if (!item) return res.status(404).json({ message: 'Item no encontrado' });
  res.json(item);
});

// Inventario: crear
router.post('/inventory', async (req, res) => {
  try {
    const payload: any = { ...req.body };
    if (payload.qr && !payload.qrRaw) payload.qrRaw = payload.qr;
    if ((!payload.code || !payload.name) && payload.qrRaw) {
      Object.assign(payload, parseQrPayload(payload.qrRaw));
    }
    const dto = inventoryCreateSchema.parse(payload);
    const existing = await prisma.inventoryItem.findUnique({ where: { code: dto.code } });
    if (existing) {
      const updated = await prisma.inventoryItem.update({
        where: { id: existing.id },
        data: {
          name: dto.name,
          itemType: dto.itemType,
          color: dto.color,
          provider: dto.provider,
          priceWeb: dto.priceWeb ?? existing.priceWeb,
          priceStore: dto.priceStore ?? existing.priceStore,
          priceWsp: dto.priceWsp ?? existing.priceWsp,
          qrRaw: dto.qrRaw ?? existing.qrRaw,
          umbralBajoStock: dto.umbralBajoStock ?? existing.umbralBajoStock,
          imageUrl: dto.imageUrl !== undefined ? dto.imageUrl || null : existing.imageUrl,
          quantity: existing.quantity + (dto.quantity ?? 0),
          updatedAt: new Date()
        }
      });
      return res.status(200).json(updated);
    }
    const item = await prisma.inventoryItem.create({
      data: {
        code: dto.code,
        name: dto.name,
        itemType: dto.itemType,
        color: dto.color,
        provider: dto.provider,
        quantity: dto.quantity ?? 0,
        priceWeb: dto.priceWeb ?? 0,
        priceStore: dto.priceStore ?? 0,
        priceWsp: dto.priceWsp ?? 0,
        umbralBajoStock: dto.umbralBajoStock ?? 0,
        qrRaw: dto.qrRaw ?? null,
        imageUrl: dto.imageUrl ?? null
      }
    });
    res.status(201).json(item);
  } catch (err: any) {
    if (err instanceof ZodError) {
      return handleZodError(err, res);
    }
    if (err?.code === 'P2002') {
      return res.status(409).json({ message: 'Codigo ya registrado' });
    }
    res.status(500).json({ message: 'Error interno' });
  }
});

// Inventario: actualizar
router.patch('/inventory/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID invalido' });
  try {
    const payload: any = { ...req.body };
    if (payload.qr && !payload.qrRaw) payload.qrRaw = payload.qr;
    if (!payload.code && payload.qrRaw) {
      Object.assign(payload, parseQrPayload(payload.qrRaw));
    }
    const dto = inventoryUpdateSchema.parse(payload);
    if (!Object.keys(dto).length) {
      return res.status(400).json({ message: 'Datos vacios' });
    }
    const item = await prisma.inventoryItem.update({
      where: { id },
      data: {
        ...(dto.code !== undefined ? { code: dto.code } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.itemType !== undefined ? { itemType: dto.itemType } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
        ...(dto.provider !== undefined ? { provider: dto.provider } : {}),
        ...(dto.quantity !== undefined ? { quantity: dto.quantity } : {}),
        ...(dto.priceWeb !== undefined ? { priceWeb: dto.priceWeb } : {}),
        ...(dto.priceStore !== undefined ? { priceStore: dto.priceStore } : {}),
        ...(dto.priceWsp !== undefined ? { priceWsp: dto.priceWsp } : {}),
        ...(dto.qrRaw !== undefined ? { qrRaw: dto.qrRaw } : {}),
        ...(dto.umbralBajoStock !== undefined ? { umbralBajoStock: dto.umbralBajoStock } : {}),
        ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl } : {})
      }
    });
    res.json(item);
  } catch (err: any) {
    if (err instanceof ZodError) {
      return handleZodError(err, res);
    }
    if (err?.code === 'P2025') {
      return res.status(404).json({ message: 'Item no encontrado' });
    }
    res.status(500).json({ message: 'Error interno' });
  }
});

// Inventario: eliminar
router.delete('/inventory/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID invalido' });
  try {
    await prisma.inventoryItem.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err: any) {
    if (err?.code === 'P2025') {
      return res.status(404).json({ message: 'Item no encontrado' });
    }
    res.status(500).json({ message: 'Error interno' });
  }
});

// Ofertas: listar (admin)
router.get('/offers', async (req, res) => {
  const includeInactive = req.query.all === '1';
  const offers = await prisma.oferta.findMany({
    where: includeInactive ? {} : { activo: true },
    include: { inventario: { select: { id: true, code: true, name: true } } },
    orderBy: [
      { prioridad: 'desc' },
      { createdAt: 'desc' }
    ]
  });
  res.json(offers);
});

// Ofertas: crear
router.post('/offers', async (req, res) => {
  try {
    const dto = offerCreateSchema.parse(req.body);
    if (dto.startAt && dto.endAt && dto.startAt > dto.endAt) {
      return res.status(400).json({ message: 'La fecha de inicio debe ser anterior a la fecha de término' });
    }
    const offer = await prisma.oferta.create({
      data: {
        titulo: dto.titulo,
        descripcion: dto.descripcion ?? null,
        imageUrl: dto.imageUrl ?? null,
        link: dto.link ?? null,
        activo: dto.activo ?? true,
        prioridad: dto.prioridad ?? 0,
        itemId: dto.itemId ?? null,
        startAt: dto.startAt ?? null,
        endAt: dto.endAt ?? null,
        precioOferta: dto.precioOferta ?? 0
      },
      include: {
        inventario: { select: { id: true, code: true, name: true } }
      }
    });
    res.status(201).json(offer);
  } catch (err) {
    if (err instanceof ZodError) return handleZodError(err, res);
    res.status(500).json({ message: 'Error interno' });
  }
});

// Ofertas: actualizar
router.patch('/offers/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID invalido' });
  try {
    const dto = offerUpdateSchema.parse(req.body);
    if (!Object.keys(dto).length) return res.status(400).json({ message: 'Datos vacios' });
    if (dto.startAt && dto.endAt && dto.startAt > dto.endAt) {
      return res.status(400).json({ message: 'La fecha de inicio debe ser anterior a la fecha de término' });
    }
    const offer = await prisma.oferta.update({
      where: { id },
      data: {
        ...(dto.titulo !== undefined ? { titulo: dto.titulo } : {}),
        ...(dto.descripcion !== undefined ? { descripcion: dto.descripcion ?? null } : {}),
        ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl ?? null } : {}),
        ...(dto.link !== undefined ? { link: dto.link ?? null } : {}),
        ...(dto.activo !== undefined ? { activo: dto.activo } : {}),
        ...(dto.prioridad !== undefined ? { prioridad: dto.prioridad } : {}),
        ...(dto.itemId !== undefined ? { itemId: dto.itemId ?? null } : {}),
        ...(dto.startAt !== undefined ? { startAt: dto.startAt ?? null } : {}),
        ...(dto.endAt !== undefined ? { endAt: dto.endAt ?? null } : {}),
        ...(dto.precioOferta !== undefined ? { precioOferta: dto.precioOferta } : {})
      },
      include: {
        inventario: { select: { id: true, code: true, name: true } }
      }
    });
    res.json(offer);
  } catch (err: any) {
    if (err instanceof ZodError) return handleZodError(err, res);
    if (err?.code === 'P2025') return res.status(404).json({ message: 'Oferta no encontrada' });
    res.status(500).json({ message: 'Error interno' });
  }
});

// Ofertas: eliminar
router.delete('/offers/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID invalido' });
  try {
    await prisma.oferta.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err: any) {
    if (err?.code === 'P2025') return res.status(404).json({ message: 'Oferta no encontrada' });
    res.status(500).json({ message: 'Error interno' });
  }
});

export default router;

