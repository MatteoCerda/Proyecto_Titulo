import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsuariosService {
  constructor(private prisma: PrismaService) {}

  async create(email: string, nombre: string, password: string) {
    const exists = await this.prisma.usuario.findUnique({ where: { email } });
    if (exists) throw new BadRequestException('Email ya registrado');

    const hash = await bcrypt.hash(password, 10);
    return this.prisma.usuario.create({
      data: { email, nombre, hash },
      select: { id: true, email: true, nombre: true, createdAt: true },
    });
  }

  findAll() {
    return this.prisma.usuario.findMany({
      select: { id: true, email: true, nombre: true, createdAt: true },
      orderBy: { id: 'desc' },
    });
  }
}
