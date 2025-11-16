import { Request, Response } from 'express';
import { z, ZodError } from 'zod';
import * as webpayService from './webpay.service';
import type { JwtUser } from '../pedidos/pedidos.service';

const numericTransformer = (value: unknown) => {
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? value : parsed;
  }
  return value;
};

const createTransactionSchema = z.object({
  pedidoId: z.preprocess(numericTransformer, z.number().int().positive('pedidoId requerido')),
  amount: z
    .preprocess(numericTransformer, z.number().positive('amount debe ser mayor a 0'))
    .optional(),
});

const tokenSchema = z
  .object({
    token: z.string().optional(),
    token_ws: z.string().optional(),
    TBK_TOKEN: z.string().optional(),
  })
  .refine(data => data.token || data.token_ws || data.TBK_TOKEN, {
    message: 'token requerido',
  });

function pickToken(payload: z.infer<typeof tokenSchema>) {
  return payload.token || payload.token_ws || payload.TBK_TOKEN;
}

export async function createTransaction(req: Request, res: Response) {
  try {
    const payload = createTransactionSchema.parse(req.body);
    const user = (req as any).user as JwtUser | undefined;

    const response = await webpayService.createTransactionForPedido({
      pedidoId: payload.pedidoId,
      amountOverride: payload.amount ?? null,
      user,
    });

    return res.json(response);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ message: 'Datos invalidos', errors: error.flatten() });
    }
    if ((error as any)?.code === 'PEDIDO_NOT_FOUND') {
      return res.status(404).json({ message: 'Pedido no encontrado' });
    }
    if ((error as any)?.code === 'NOT_ALLOWED') {
      return res.status(403).json({ message: 'No tienes permiso para este pedido' });
    }
    if ((error as any)?.code === 'PEDIDO_SIN_MONTO') {
      return res.status(422).json({ message: 'El pedido no tiene monto para cobrar' });
    }
    console.error('[webpay] error creando transaccion', error);
    return res.status(502).json({ message: 'Error creando transaccion con Webpay' });
  }
}

export async function commitTransaction(req: Request, res: Response) {
  try {
    const payload = tokenSchema.parse(req.body ?? {});
    const token = pickToken(payload) as string;
    const user = (req as any).user as JwtUser | undefined;
    const result = await webpayService.commitTransactionForToken({ token, user });
    return res.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ message: 'Datos invalidos', errors: error.flatten() });
    }
    if ((error as any)?.code === 'TRANSACTION_NOT_FOUND') {
      return res.status(404).json({ message: 'Transaccion no encontrada' });
    }
    if ((error as any)?.code === 'NOT_ALLOWED') {
      return res.status(403).json({ message: 'No tienes permiso para esta transaccion' });
    }
    console.error('[webpay] error confirmando transaccion', error);
    return res.status(502).json({ message: 'Error confirmando transaccion con Webpay' });
  }
}

export async function getTransactionStatus(req: Request, res: Response) {
  try {
    const payload = tokenSchema.parse(req.body ?? {});
    const token = pickToken(payload) as string;
    const user = (req as any).user as JwtUser | undefined;
    const result = await webpayService.getTransactionStatusForToken({ token, user });
    return res.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ message: 'Datos invalidos', errors: error.flatten() });
    }
    if ((error as any)?.code === 'TRANSACTION_NOT_FOUND') {
      return res.status(404).json({ message: 'Transaccion no encontrada' });
    }
    if ((error as any)?.code === 'NOT_ALLOWED') {
      return res.status(403).json({ message: 'No tienes permiso para esta transaccion' });
    }
    console.error('[webpay] error obteniendo estado de transaccion', error);
    return res.status(502).json({ message: 'Error consultando estado con Webpay' });
  }
}

const FRONT_RETURN_URL =
  process.env.WEBPAY_FRONT_RETURN_URL ||
  process.env.WEBPAY_RETURN_URL ||
  (process.env.PANEL_BASE_URL ? `${process.env.PANEL_BASE_URL.replace(/\/$/, '')}/pagos/webpay/retorno` : 'http://localhost:8100/pagos/webpay/retorno');

export function webpayReturnBridge(req: Request, res: Response) {
  const tokenWs = req.body?.token_ws || req.query?.token_ws || req.body?.token || req.query?.token;
  const tbkToken = req.body?.TBK_TOKEN || req.query?.TBK_TOKEN || req.body?.tbk_token;

  if (!tokenWs && !tbkToken) {
    return res.status(400).send('token_ws no recibido');
  }

  try {
    const target = new URL(FRONT_RETURN_URL);
    if (tokenWs) target.searchParams.set('token_ws', tokenWs);
    if (tbkToken) target.searchParams.set('TBK_TOKEN', tbkToken);
    return res.redirect(target.toString());
  } catch (error) {
    console.error('[webpay] error redirigiendo a front', error);
    return res.status(500).send('No pudimos redirigir el pago');
  }
}
