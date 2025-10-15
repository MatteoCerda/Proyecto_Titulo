import { Request, Response, NextFunction } from 'express';

export function adminGuard(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user as { role?: string } | undefined;
  if (!user || (user.role !== 'admin' && user.role !== 'ADMIN')) {
    return res.status(403).json({ message: 'Requiere rol administrador' });
  }
  next();
}

