import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

// GET /admin/users?q=...&role=admin|user
router.get('/users', async (req, res) => {
  const q = (req.query.q as string | undefined)?.trim() || '';
  const role = (req.query.role as string | undefined)?.trim();
  const where: any = {};
  if (q) where.OR = [
    { email: { contains: q } },
    { fullName: { contains: q } },
  ];
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
          rut: true, nombre_contacto: true, telefono: true, direccion: true, comuna: true, ciudad: true
        }
      }
    }
  });
  res.json(users);
});

// GET /admin/users/:id  -> user + cliente
router.get('/users/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, email: true, fullName: true, role: true,
      cliente: { select: { rut:true, nombre_contacto:true, telefono:true, direccion:true, comuna:true, ciudad:true } }
    }
  });
  if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
  res.json(user);
});

// PATCH /admin/users/:id  { role?, fullName?, perfil? }
router.patch('/users/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const { role, fullName, perfil } = req.body || {};
  try {
    const user = await prisma.user.update({ where: { id }, data: { ...(fullName?{ fullName }:{}), ...(role?{ role }:{}) }, select: { id: true, email: true, fullName: true, role: true } });
    if (perfil) {
      await (prisma as any).cliente.upsert({
        where: { id_usuario: id },
        create: { id_usuario: id, email: user.email, ...perfil },
        update: { ...perfil }
      });
    }
    res.json(user);
  } catch (e) {
    res.status(404).json({ message: 'Usuario no encontrado' });
  }
});

// DELETE /admin/users  { ids: number[] }
router.delete('/users', async (req, res) => {
  const ids = (req.body?.ids as number[] | undefined) || [];
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: 'ids requerido' });
  await prisma.$transaction([
    (prisma as any).cliente.deleteMany({ where: { id_usuario: { in: ids } } }),
    prisma.user.deleteMany({ where: { id: { in: ids } } })
  ]);
  res.json({ ok: true });
});

export default router;
