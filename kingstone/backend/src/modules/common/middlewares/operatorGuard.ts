import { NextFunction, Request, Response } from 'express';

export function operatorGuard(req: Request, res: Response, next: NextFunction) {
  const role = (req as any).user?.role;
  if (!role) {
    return res.status(403).json({ message: 'Requiere rol operador' });
  }
  const normalized = role.toString().toUpperCase();
  if (normalized !== 'OPERATOR' && normalized !== 'ADMIN') {
    return res.status(403).json({ message: 'Requiere rol operador' });
  }
  next();
}
