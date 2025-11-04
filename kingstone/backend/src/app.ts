import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './modules/auth/auth.routes';
import { authGuard } from './modules/common/middlewares/authGuard';
import adminRoutes from './modules/admin/admin.routes';
import { adminGuard } from './modules/common/middlewares/adminGuard';
import pedidosRoutes from './modules/pedidos/pedidos.routes';
import { prisma } from './lib/prisma';
import bcrypt from 'bcryptjs';
import cotizacionesRoutes from './modules/cotizaciones/cotizaciones.routes';
import operatorRoutes from './modules/operator/operator.routes';
import { operatorGuard } from './modules/common/middlewares/operatorGuard';
import { normalizeRut } from './modules/common/rut';

const app = express();
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true, limit: '8mb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));

// Auth (register/login)
app.use('/auth', authRoutes);

// Perfil del usuario autenticado
app.get(['/me', '/api/me'], authGuard, async (req, res) => {
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

app.put(['/me', '/api/me'], authGuard, async (req, res) => {
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
app.put(['/me/password', '/api/me/password'], authGuard, async (req, res) => {
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
app.get(['/me/profile', '/api/me/profile'], authGuard, async (req, res) => {
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
app.put(['/me/profile', '/api/me/profile'], authGuard, async (req, res) => {
  try {
    const id = Number((req as any).user?.sub);
    if (!id) return res.status(401).json({ message: 'No autorizado' });
    const { rut, nombre_contacto, telefono, direccion, comuna, ciudad } = req.body || {};
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
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
        estado: 'active'
      },
      update: {
        rut: formattedRut,
        rutNormalizado: rutCompact,
        nombre_contacto: nombre_contacto ?? undefined,
        telefono: telefono ?? null,
        direccion: direccion ?? null,
        comuna: comuna ?? null,
        ciudad: ciudad ?? null,
        estado: 'active'
      },
      select: { id_cliente: true, rut: true, nombre_contacto: true, email: true, telefono: true, direccion: true, comuna: true, ciudad: true, id_usuario: true, creado_en: true }
    });
    res.json({ profile });
  } catch (e) {
    res.status(500).json({ message: 'Error interno' });
  }
});

// Catálogo público para clientes
const catalogHandler = async (req: express.Request, res: express.Response) => {
  try {
    const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const tipo = typeof req.query.tipo === 'string' ? req.query.tipo.trim() : '';

    const where: any = { quantity: { gt: 0 } };
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { itemType: { contains: search } },
        { color: { contains: search } },
        { provider: { contains: search } }
      ];
    }
    if (tipo) {
      where.itemType = { contains: tipo };
    }

    const items = await prisma.inventoryItem.findMany({
      where,
      orderBy: [
        { itemType: 'asc' },
        { name: 'asc' }
      ],
      select: {
        id: true,
        name: true,
        itemType: true,
        color: true,
        provider: true,
        quantity: true,
        priceWeb: true,
        priceStore: true,
        priceWsp: true,
        imageUrl: true
      }
    });

    const catalogo = items.map(item => ({
      id: item.id,
      name: item.name,
      itemType: item.itemType,
      color: item.color,
      provider: item.provider,
      quantity: item.quantity,
      price: item.priceWeb,
      priceWeb: item.priceWeb,
      priceStore: item.priceStore,
      priceWsp: item.priceWsp,
      imageUrl: item.imageUrl ?? null
    }));

    res.json(catalogo);
  } catch (error) {
    console.error('Error obteniendo catálogo', error);
    res.status(500).json({ message: 'Error interno' });
  }
};

app.get(['/catalogo', '/api/catalogo'], catalogHandler);


app.get(['/catalogo/:id', '/api/catalogo/:id'], async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) {
      return res.status(400).json({ message: 'ID invalido' });
    }
    const item = await prisma.inventoryItem.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        itemType: true,
        color: true,
        provider: true,
        quantity: true,
        priceWeb: true,
        priceStore: true,
        priceWsp: true,
        imageUrl: true,
        qrRaw: true
      }
    });
    if (!item) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }
    res.json({
      id: item.id,
      name: item.name,
      itemType: item.itemType,
      color: item.color,
      provider: item.provider,
      quantity: item.quantity,
      price: item.priceWeb,
      priceWeb: item.priceWeb,
      priceStore: item.priceStore,
      priceWsp: item.priceWsp,
      imageUrl: item.imageUrl ?? null,
      descripcion: item.qrRaw ?? null
    });
  } catch (error) {
    console.error('Error obteniendo producto', error);
    res.status(500).json({ message: 'Error interno' });
  }
});

const offersHandler = async (_req: express.Request, res: express.Response) => {
  try {
    const now = new Date();
    const offers = await prisma.oferta.findMany({
      where: {
        activo: true,
        OR: [
          { startAt: null },
          { startAt: { lte: now } }
        ],
        AND: [
          {
            OR: [
              { endAt: null },
              { endAt: { gte: now } }
            ]
          }
        ]
      },
      orderBy: [
        { prioridad: 'desc' },
        { createdAt: 'desc' }
      ],
      select: {
        id: true,
        titulo: true,
        descripcion: true,
        imageUrl: true,
        link: true,
        prioridad: true,
        startAt: true,
        endAt: true,
        inventario: {
          select: { code: true, name: true }
        },
      },
    });
    res.json(offers);
  } catch (error) {
    console.error('Error obteniendo ofertas', error);
    res.status(500).json({ message: 'Error interno' });
  }
};

app.get(['/offers', '/api/offers'], offersHandler);


// Pedidos (clientes y operadores)
app.use('/api/pedidos', authGuard, pedidosRoutes);
app.use('/api/cotizaciones', cotizacionesRoutes);
app.use('/api/operator', authGuard, operatorGuard, operatorRoutes);
// Admin endpoints
app.use('/api/admin', authGuard, adminGuard, adminRoutes);
app.use('/admin', authGuard, adminGuard, adminRoutes);

export default app;

