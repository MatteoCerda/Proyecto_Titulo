import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { RegisterDTO, LoginDTO, JwtPayload } from './auth.types';

const prisma = new PrismaClient();

export async function register(dto: RegisterDTO) {
  const exists = await prisma.user.findUnique({ where: { email: dto.email } });
  if (exists) throw new Error('EMAIL_IN_USE');
  const passwordHash = await bcrypt.hash(dto.password, 10);
  const user = await prisma.user.create({ data: { email: dto.email, passwordHash, fullName: dto.fullName } });
  return { id: user.id, email: user.email, fullName: user.fullName, role: user.role };
}

export async function login(dto: LoginDTO) {
  const user = await prisma.user.findUnique({ where: { email: dto.email } });
  if (!user) throw new Error('INVALID_CREDENTIALS');
  const ok = await bcrypt.compare(dto.password, user.passwordHash);
  if (!ok) throw new Error('INVALID_CREDENTIALS');

  const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
  const token = jwt.sign(payload, process.env.JWT_SECRET as string, { expiresIn: process.env.JWT_EXPIRES_IN || '1d' });
  return { token, user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role } };
}
