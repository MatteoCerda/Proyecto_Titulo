
import { prisma } from '../../lib/prisma';
import bcrypt from 'bcryptjs';
import { normalizeRut } from '../common/rut';

type ClientProfileInput = {
  rut?: string | null;
  nombre_contacto?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  comuna?: string | null;
  ciudad?: string | null;
};

export const getUserProfile = async (id: number) => {
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, fullName: true, role: true },
  });
  if (!user) throw new Error('Usuario no encontrado');
  return user;
};

export const updateUserProfile = async (id: number, fullName: string) => {
  if (!fullName || typeof fullName !== 'string' || !fullName.trim()) {
    throw new Error('Nombre inválido');
  }
  try {
    const user = await prisma.user.update({
      where: { id },
      data: { fullName: fullName.trim() },
      select: { id: true, email: true, fullName: true, role: true },
    });
    return user;
  } catch (e: any) {
    if (e?.code === 'P2025') throw new Error('Usuario no encontrado');
    throw e;
  }
};

export const updateUserPassword = async (id: number, currentPassword: string, newPassword: string) => {
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
    throw new Error('Contraseña inválida (mínimo 6 caracteres)');
  }
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new Error('Usuario no encontrado');
  const ok = await bcrypt.compare(currentPassword || '', user.passwordHash);
  if (!ok) throw new Error('Contraseña actual incorrecta');
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id }, data: { passwordHash } });
};

export const getClientProfile = async (id: number) => {
  const profile = await (prisma as any).cliente.findUnique({
    where: { id_usuario: id },
    select: { id_cliente: true, rut: true, nombre_contacto: true, email: true, telefono: true, direccion: true, comuna: true, ciudad: true, id_usuario: true, creado_en: true },
  });
  return profile;
};

export const upsertClientProfile = async (id: number, data: ClientProfileInput) => {
  const { rut, nombre_contacto, telefono, direccion, comuna, ciudad } = data;
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new Error('Usuario no encontrado');
  const rutInfo = rut ? normalizeRut(rut) : null;
  const formattedRut = rutInfo?.normalized ?? (rut ? rut.trim() : null);
  const rutCompact = rutInfo?.compact ?? null;
  const profile = await (prisma as any).cliente.upsert({
    where: { id_usuario: id },
    create: {
      id_usuario: id,
      email: user.email,
      rut: formattedRut,
      rutNormalizado: rutCompact,
      nombre_contacto: nombre_contacto || user.fullName || null,
      telefono: telefono || null,
      direccion: direccion || null,
      comuna: comuna || null,
      ciudad: ciudad || null,
      estado: 'active',
    },
    update: {
      rut: formattedRut,
      rutNormalizado: rutCompact,
      nombre_contacto: nombre_contacto ?? undefined,
      telefono: telefono ?? null,
      direccion: direccion ?? null,
      comuna: comuna ?? null,
      ciudad: ciudad ?? null,
      estado: 'active',
    },
    select: { id_cliente: true, rut: true, nombre_contacto: true, email: true, telefono: true, direccion: true, comuna: true, ciudad: true, id_usuario: true, creado_en: true },
  });
  return profile;
};
