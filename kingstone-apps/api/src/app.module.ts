import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './health.controller';
import { PrismaService } from './prisma.service';
import { UsuariosController } from './usuarios.controller';
import { UsuariosService } from './usuarios.service';

@Module({
  imports: [],
  controllers: [AppController, HealthController, UsuariosController],
  providers: [AppService, PrismaService, UsuariosService],
})
export class AppModule {}
