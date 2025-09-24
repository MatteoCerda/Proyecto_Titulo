import { INestApplication, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    // Reintentos para dar tiempo a MySQL
    for (let i = 0; i < 20; i++) {
      try { await this.$connect(); return; }
      catch { await new Promise(r => setTimeout(r, 1000)); }
    }
    await this.$connect();
  }

  async enableShutdownHooks(app: INestApplication) {
    process.on('beforeExit', async () => { await app.close(); });
  }
}
