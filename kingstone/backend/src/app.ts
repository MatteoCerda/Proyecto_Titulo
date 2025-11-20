import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './modules/auth/auth.routes';
import { authGuard } from './modules/common/middlewares/authGuard';
import adminRoutes from './modules/admin/admin.routes';
import { adminGuard } from './modules/common/middlewares/adminGuard';
import pedidosRoutes from './modules/pedidos/pedidos.routes';


import cotizacionesRoutes from './modules/cotizaciones/cotizaciones.routes';
import meRoutes from './modules/me/me.routes';
import operatorRoutes from './modules/operator/operator.routes';
import catalogoRoutes from './modules/catalogo/catalogo.routes';
import offersRoutes from './modules/offers/offers.routes';
import { operatorGuard } from './modules/common/middlewares/operatorGuard';
import paymentsRoutes from './modules/payments/payments.routes';
import { webpayReturnBridge } from './modules/payments/webpay.controller';


const app = express();
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true, limit: '8mb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/', (_req, res) => { res.json({ ok: true, service: 'kingstone-api' }); });

// Auth (register/login)
app.use('/auth', authRoutes);

app.use(['/me', '/api/me'], meRoutes);

app.use(['/catalogo', '/api/catalogo'], catalogoRoutes);
app.use(['/offers', '/api/offers'], offersRoutes);


// Pedidos (clientes y operadores)
app.post('/api/payments/webpay/return', webpayReturnBridge);
app.get('/api/payments/webpay/return', webpayReturnBridge);

app.use('/api/pedidos', authGuard, pedidosRoutes);
app.use('/api/cotizaciones', cotizacionesRoutes);
app.use('/api/operator', authGuard, operatorGuard, operatorRoutes);
app.use('/api/payments', authGuard, paymentsRoutes);
// Admin endpoints
app.use('/api/admin', authGuard, adminGuard, adminRoutes);
app.use('/admin', authGuard, adminGuard, adminRoutes);

export default app;

