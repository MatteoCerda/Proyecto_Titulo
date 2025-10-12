import { Request, Response } from 'express';
import * as svc from './auth.service';
import { validate } from './auth.validation';

export async function postRegister(req: Request, res: Response) {
  try {
    const dto = validate('register', req.body);
    const user = await svc.register(dto);
    res.status(201).json(user);
  } catch (err: any) {
    if (err.message === 'EMAIL_IN_USE') return res.status(409).json({ message: 'Email ya registrado' });
    res.status(500).json({ message: 'Error interno' });
  }
}

export async function postLogin(req: Request, res: Response) {
  try {
    const dto = validate('login', req.body);
    const result = await svc.login(dto);
    res.json(result);
  } catch (err: any) {
    if (err.message === 'INVALID_CREDENTIALS') return res.status(401).json({ message: 'Credenciales inválidas' });
    res.status(500).json({ message: 'Error interno' });
  }
}

export async function postForgotPassword(req: Request, res: Response) {
  try {
    const dto = validate('forgot', req.body);
    const info = await svc.forgotPassword(dto.email);
    res.json(info);
  } catch (err: any) {
    res.status(500).json({ message: 'Error interno' });
  }
}

export async function postResetPassword(req: Request, res: Response) {
  try {
    const dto = validate('reset', req.body);
    await svc.resetPassword(dto.token, dto.password);
    res.json({ ok: true });
  } catch (err: any) {
    const map: Record<string, number> = { 'TOKEN_INVALID': 400, 'TOKEN_EXPIRED': 400 };
    const code = map[err?.message] || 500;
    res.status(code).json({ message: err?.message || 'Error interno' });
  }
}
