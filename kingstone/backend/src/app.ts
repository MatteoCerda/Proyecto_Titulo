import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './modules/auth/auth.routes';
import { authGuard } from './modules/common/middlewares/authGuard';

const app = express();
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

// Auth (register/login)
app.use('/auth', authRoutes);

// Ruta protegida para verificar el token
app.get('/me', authGuard, (req, res) => {
  res.json({ user: (req as any).user });
});

export default app;
