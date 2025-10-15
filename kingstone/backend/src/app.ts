import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './modules/auth/auth.routes';
import { authGuard } from './modules/common/middlewares/authGuard';
import adminRoutes from './modules/admin/admin.routes';
import { adminGuard } from './modules/common/middlewares/adminGuard';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const app = express();
const prisma = new PrismaClient();
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

// Auth (register/login)
app.use('/auth', authRoutes);

// Perfil del usuario autenticado
app.get('/me', authGuard, async (req, res) => {
  try {
    const id = Number((req as any).user?.sub);
    if (!id) return res.status(401).json({ message: 'No autorizado' });
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, fullName: true, role: true }
    });
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
    res.json({ user });
  } catch (e) {
    res.status(500).json({ message: 'Error interno' });
  }
});

app.put('/me', authGuard, async (req, res) => {
  try {
    const id = Number((req as any).user?.sub);
    const { fullName } = req.body || {};
    if (!id) return res.status(401).json({ message: 'No autorizado' });
    if (!fullName || typeof fullName !== 'string' || !fullName.trim()) {
      return res.status(400).json({ message: 'Nombre inválido' });
    }
    const user = await prisma.user.update({
      where: { id },
      data: { fullName: fullName.trim() },
      select: { id: true, email: true, fullName: true, role: true }
    });
    res.json({ user });
  } catch (e: any) {
    if (e?.code === 'P2025') return res.status(404).json({ message: 'Usuario no encontrado' });
    res.status(500).json({ message: 'Error interno' });
  }
});

// Actualizar contraseña del usuario autenticado
app.put('/me/password', authGuard, async (req, res) => {
  try {
    const id = Number((req as any).user?.sub);
    const { currentPassword, newPassword } = req.body || {};
    if (!id) return res.status(401).json({ message: 'No autorizado' });
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({ message: 'Contraseña inválida (mínimo 6 caracteres)' });
    }
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
    const ok = await bcrypt.compare(currentPassword || '', user.passwordHash);
    if (!ok) return res.status(400).json({ message: 'Contraseña actual incorrecta' });
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id }, data: { passwordHash } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: 'Error interno' });
  }
});

// Perfil de cliente: obtener
app.get('/me/profile', authGuard, async (req, res) => {
  try {
    const id = Number((req as any).user?.sub);
    if (!id) return res.status(401).json({ message: 'No autorizado' });
    const profile = await (prisma as any).cliente.findUnique({
      where: { id_usuario: id },
      select: { id_cliente: true, rut: true, nombre_contacto: true, email: true, telefono: true, direccion: true, comuna: true, ciudad: true, id_usuario: true, creado_en: true }
    });
    res.json({ profile });
  } catch (e) {
    res.status(500).json({ message: 'Error interno' });
  }
});

// Perfil de cliente: crear/actualizar
app.put('/me/profile', authGuard, async (req, res) => {
  try {
    const id = Number((req as any).user?.sub);
    if (!id) return res.status(401).json({ message: 'No autorizado' });
    const { rut, nombre_contacto, telefono, direccion, comuna, ciudad } = req.body || {};
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
    const profile = await (prisma as any).cliente.upsert({
      where: { id_usuario: id },
      create: { id_usuario: id, email: user.email, rut: rut || null, nombre_contacto: nombre_contacto || user.fullName || null, telefono: telefono || null, direccion: direccion || null, comuna: comuna || null, ciudad: ciudad || null },
      update: { rut: rut || null, nombre_contacto: (nombre_contacto ?? undefined), telefono: telefono ?? null, direccion: direccion ?? null, comuna: comuna ?? null, ciudad: ciudad ?? null },
      select: { id_cliente: true, rut: true, nombre_contacto: true, email: true, telefono: true, direccion: true, comuna: true, ciudad: true, id_usuario: true, creado_en: true }
    });
    res.json({ profile });
  } catch (e) {
    res.status(500).json({ message: 'Error interno' });
  }
});

export default app;
// Admin endpoints
app.use('/admin', authGuard, adminGuard, adminRoutes);
