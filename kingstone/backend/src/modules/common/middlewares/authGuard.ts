import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export function authGuard(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization; // "Bearer <token>"
  if (!header) return res.status(401).json({ message: 'No autorizado' });
  const [, token] = header.split(' ');
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET as string);
    (req as any).user = payload;
    next();
  } catch {
    return res.status(401).json({ message: 'Token inválido/expirado' });
  }
}
