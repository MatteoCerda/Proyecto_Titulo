import { prisma } from '../../lib/prisma';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import type { RegisterDTO, LoginDTO, JwtPayload } from './auth.types';
import crypto from 'crypto';

const allowedRoles = ['user', 'admin', 'operator'] as const;
type Role = (typeof allowedRoles)[number];

function normalizeRole(role?: string | null): Role | null {
  if (!role) return null;
  const normalized = role.toLowerCase();
  return allowedRoles.find(r => r === normalized) ?? null;
}

type RegisterOptions = {
  allowRoleOverride?: boolean;
  defaultRole?: Role;
};

type LoginOptions = {
  allowedRoles?: Role[];
};

export async function register(dto: RegisterDTO, options?: RegisterOptions) {
  const exists = await prisma.user.findUnique({ where: { email: dto.email } });
  if (exists) throw new Error('EMAIL_IN_USE');
  const passwordHash = await bcrypt.hash(dto.password, 10);
  const role = options?.defaultRole ?? 'user';
  const user = await prisma.user.create({
    data: { email: dto.email, passwordHash, fullName: dto.fullName, role }
  });
  // Si vienen datos de perfil, creamos registro en tabla cliente
  const hasProfile = dto.rut || dto.nombre_contacto || dto.telefono || dto.direccion || dto.comuna || dto.ciudad;
  if (hasProfile) {
    try {
      await (prisma as any).cliente.create({
        data: {
          id_usuario: user.id,
          rut: dto.rut || null,
          nombre_contacto: dto.nombre_contacto || dto.fullName || null,
          email: dto.email,
          telefono: dto.telefono || null,
          direccion: dto.direccion || null,
          comuna: dto.comuna || null,
          ciudad: dto.ciudad || null,
        }
      });
    } catch (e) {
      // No interrumpimos el registro si falla el perfil
      console.warn('No se pudo crear perfil cliente:', e);
    }
  }
  return { id: user.id, email: user.email, fullName: user.fullName, role: user.role };
}

export async function login(dto: LoginDTO, options?: LoginOptions) {
  const user = await prisma.user.findUnique({ where: { email: dto.email } });
  if (!user) throw new Error('INVALID_CREDENTIALS');
  const ok = await bcrypt.compare(dto.password, user.passwordHash);
  if (!ok) throw new Error('INVALID_CREDENTIALS');

  if (options?.allowedRoles && options.allowedRoles.length) {
    const currentRole = normalizeRole(user.role) ?? 'user';
    const allowed = options.allowedRoles.map(r => normalizeRole(r)).filter(Boolean) as Role[];
    if (!allowed.includes(currentRole)) {
      throw Object.assign(new Error('ROLE_NOT_ALLOWED'), {
        code: 'ROLE_NOT_ALLOWED',
        role: user.role
      });
    }
  }

  const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
  const opts: SignOptions = { expiresIn: (process.env.JWT_EXPIRES_IN as any) || '1d' };
  const secret = process.env.JWT_SECRET as string;
  const token = jwt.sign(payload, secret, opts);
  return { token, user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role } };
}

export async function forgotPassword(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  // Siempre respondemos ok para no filtrar emails
  if (!user) return { ok: true };

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 1000 * 60 * 30); // 30 min

  await prisma.passwordReset.create({ data: { userId: user.id, tokenHash, expiresAt } });
  // Enviar email: aquí integrar proveedor. Por ahora devolvemos ok.
  // Para facilitar pruebas, devolvemos el token en dev solamente
  const isDev = process.env.NODE_ENV !== 'production';
  return isDev ? { ok: true, token } : { ok: true };
}

export async function resetPassword(token: string, newPassword: string) {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const rec = await prisma.passwordReset.findFirst({ where: { tokenHash, usedAt: null }, include: { user: true } });
  if (!rec) throw new Error('TOKEN_INVALID');
  if (rec.expiresAt.getTime() < Date.now()) throw new Error('TOKEN_EXPIRED');

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.$transaction([
    prisma.user.update({ where: { id: rec.userId }, data: { passwordHash } }),
    prisma.passwordReset.update({ where: { id: rec.id }, data: { usedAt: new Date() } })
  ]);

  return { ok: true };
}
