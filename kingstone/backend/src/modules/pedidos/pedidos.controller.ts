
import { Request, Response } from 'express';
import * as pedidosService from './pedidos.service';
import { createCartSchema, createDesignerSchema } from './pedidos.types';
import { JwtUser } from './pedidos.service';

export const createPedido = async (req: Request, res: Response) => {
  try {
    const isCartSource = typeof req.body?.source === 'string' && req.body.source === 'cart';
    const parsed = isCartSource ? createCartSchema.safeParse(req.body) : createDesignerSchema.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues?.[0];
      return res.status(400).json({
        message: issue?.message || 'Solicitud invalida',
        issues: parsed.error.issues
      });
    }
    const dto = parsed.data;
    const user = (req as any).user as JwtUser | undefined;

    let pedidoId: number;
    if (isCartSource) {
      pedidoId = await pedidosService.handleCartOrder(dto as any, user);
    } else {
      pedidoId = await pedidosService.handleDesignerOrder(dto as any, user);
    }
    
    res.status(201).json({ id: pedidoId });

  } catch (error: any) {
    if (error?.code === 'INSUFFICIENT_STOCK') {
      return res.status(409).json({
        message: 'No hay stock suficiente para completar el pedido.',
        detalles: error?.details || null
      });
    }
    console.error('Error creando pedido', error);
    res.status(500).json({ message: 'Error interno' });
  }
};

export const getPedidos = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as JwtUser | undefined;
    const isOp = pedidosService.isOperator(user?.role);
    let pedidos;
    if (isOp) {
      const statusRaw = (req.query.status as string | undefined)?.trim();
      const status = statusRaw && statusRaw.length ? statusRaw.toUpperCase() : 'PENDIENTE';
      pedidos = await pedidosService.getPedidosByStatus(status);
    } else {
      const userId = user?.sub ? Number(user.sub) : null;
      const email = user?.email ?? null;
      const statusRaw = (req.query.status as string | undefined)?.trim();
      const status = statusRaw && statusRaw.length ? statusRaw.toUpperCase() : undefined;
      pedidos = await pedidosService.getPedidosByClient(userId, email, status);
    }
    res.json(pedidos);
  } catch (error) {
    console.error('Error listando pedidos', error);
    res.status(500).json({ message: 'Error interno' });
  }
};
