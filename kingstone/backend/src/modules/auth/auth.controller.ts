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
    const user = await svc.register(dto, { allowRoleOverride: false, defaultRole: 'user' });
    res.status(201).json(user);
  } catch (err: any) {
    if (tryHandleValidationError(err, res)) return;
    if (err?.message === 'EMAIL_IN_USE') {
      return res.status(409).json({ message: 'Email ya registrado' });
    }
    if (err?.code === 'CLAIM_CODE_REQUIRED') {
      return res.status(400).json({ message: 'Se requiere codigo de reclamacion para vincular este RUT.' });
    }
    if (err?.code === 'CLAIM_CODE_INVALID') {
      return res.status(400).json({ message: 'El codigo de reclamacion es invalido o expiro.' });
    }
    if (err?.code === 'CLIENT_ALREADY_LINKED') {
      return res.status(409).json({ message: 'El cliente ya se encuentra vinculado a otra cuenta.' });
    }
    res.status(500).json({ message: 'Error interno' });
  }
}

function handleLoginErrors(err: any, res: Response) {
  if (tryHandleValidationError(err, res)) return true;
  if (err?.message === 'INVALID_CREDENTIALS') {
    res.status(401).json({ message: 'Credenciales invalidas' });
    return true;
  }
  if (err?.message === 'ROLE_NOT_ALLOWED') {
    res.status(403).json({ message: 'Rol no autorizado para este acceso' });
    return true;
  }
  if (err?.message === 'JWT_SECRET_MISSING') {
    res.status(500).json({ message: 'Configuracion del servidor incompleta (JWT)' });
    return true;
  }
  return false;
}

export async function postClientLogin(req: Request, res: Response) {
  try {
    const dto = validate('login', req.body);
    const result = await svc.login(dto, { allowedRoles: ['user'] });
    res.json(result);
  } catch (err: any) {
    if (handleLoginErrors(err, res)) return;
    res.status(500).json({ message: 'Error interno' });
  }
}

export async function postAdminLogin(req: Request, res: Response) {
  try {
    const dto = validate('login', req.body);
    const result = await svc.login(dto, { allowedRoles: ['admin'] });
    res.json(result);
  } catch (err: any) {
    if (handleLoginErrors(err, res)) return;
    res.status(500).json({ message: 'Error interno' });
  }
}

export async function postOperatorLogin(req: Request, res: Response) {
  try {
    const dto = validate('login', req.body);
    const result = await svc.login(dto, { allowedRoles: ['operator', 'admin'] });
    res.json(result);
  } catch (err: any) {
    if (handleLoginErrors(err, res)) return;
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
