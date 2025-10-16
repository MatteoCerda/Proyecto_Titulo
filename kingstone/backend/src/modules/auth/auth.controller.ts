import { Request, Response } from 'express';
import { ZodError } from 'zod';
import * as svc from './auth.service';
import { validate } from './auth.validation';

function respondValidationError(err: ZodError, res: Response) {
  const firstIssue = err.issues?.[0];
  const message = firstIssue?.message || 'Datos invalidos';
  res.status(400).json({
    message,
    issues: err.issues?.map(issue => ({
      path: issue.path,
      message: issue.message
    }))
  });
}

function tryHandleValidationError(err: unknown, res: Response): boolean {
  if (err instanceof ZodError) {
    respondValidationError(err, res);
    return true;
  }
  return false;
}

export async function postRegister(req: Request, res: Response) {
  try {
    const dto = validate('register', req.body);
    const user = await svc.register(dto);
    res.status(201).json(user);
  } catch (err: any) {
    if (tryHandleValidationError(err, res)) return;
    if (err?.message === 'EMAIL_IN_USE') {
      return res.status(409).json({ message: 'Email ya registrado' });
    }
    res.status(500).json({ message: 'Error interno' });
  }
}

export async function postLogin(req: Request, res: Response) {
  try {
    const dto = validate('login', req.body);
    const result = await svc.login(dto);
    res.json(result);
  } catch (err: any) {
    if (tryHandleValidationError(err, res)) return;
    if (err?.message === 'INVALID_CREDENTIALS') {
      return res.status(401).json({ message: 'Credenciales invalidas' });
    }
    res.status(500).json({ message: 'Error interno' });
  }
}

export async function postForgotPassword(req: Request, res: Response) {
  try {
    const dto = validate('forgot', req.body);
    const info = await svc.forgotPassword(dto.email);
    res.json(info);
  } catch (err: any) {
    if (tryHandleValidationError(err, res)) return;
    res.status(500).json({ message: 'Error interno' });
  }
}

export async function postResetPassword(req: Request, res: Response) {
  try {
    const dto = validate('reset', req.body);
    await svc.resetPassword(dto.token, dto.password);
    res.json({ ok: true });
  } catch (err: any) {
    if (tryHandleValidationError(err, res)) return;
    const map: Record<string, number> = { TOKEN_INVALID: 400, TOKEN_EXPIRED: 400 };
    const code = map[err?.message] || 500;
    res.status(code).json({ message: err?.message || 'Error interno' });
  }
}
