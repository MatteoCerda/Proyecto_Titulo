import { Request, Response } from 'express';
import * as svc from './auth.service';

export async function postRegister(req: Request, res: Response) {
  try {
    const user = await svc.register(req.body);
    res.status(201).json(user);
  } catch (err: any) {
    if (err.message === 'EMAIL_IN_USE') return res.status(409).json({ message: 'Email ya registrado' });
    res.status(500).json({ message: 'Error interno' });
  }
}

export async function postLogin(req: Request, res: Response) {
  try {
    const result = await svc.login(req.body);
    res.json(result);
  } catch (err: any) {
    if (err.message === 'INVALID_CREDENTIALS') return res.status(401).json({ message: 'Credenciales inválidas' });
    res.status(500).json({ message: 'Error interno' });
  }
}
