import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { register as registerUser } from '../auth/auth.service';
import { validate } from '../auth/auth.validation';
import { ZodError, z } from 'zod';

const prisma = new PrismaClient();
const router = Router();

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
  qrRaw: z.string().optional(),
  imageUrl: z.string().min(1).optional()
});

const inventoryUpdateSchema = inventoryCreateSchema.partial();

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
    const user = await registerUser(dto);
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
          qrRaw: dto.qrRaw ?? existing.qrRaw,
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
        ...(dto.qrRaw !== undefined ? { qrRaw: dto.qrRaw } : {}),
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

export default router;
