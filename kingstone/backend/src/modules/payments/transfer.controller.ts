import type { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { JwtUser, canAccessPedido } from '../pedidos/pedidos.service';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';

export const TRANSFER_UPLOAD_DIR =
  process.env.TRANSFER_UPLOAD_DIR || path.join(process.cwd(), 'uploads', 'transferencias');

type TransferPayload = {
  status: 'pending' | 'approved' | 'rejected';
  amount: number;
  currency: string;
  submittedAt: string;
  submittedBy: { id: number | null; email: string | null };
  transferDate?: string | null;
  operationNumber?: string | null;
  notes?: string | null;
  receipt?: {
    storedName: string;
    originalName: string;
    mimeType: string;
    size: number;
  } | null;
  operator?: {
    id: number | null;
    email: string | null;
    decidedAt: string;
    note?: string | null;
    action: 'approved' | 'rejected';
  };
};

const transferNotificationSchema = z.object({
  pedidoId: z.number().int().positive(),
  amount: z.preprocess(value => Number(value), z.number().int().positive()),
  operationNumber: z
    .string()
    .trim()
    .min(3, 'Ingresa el numero de operacion')
    .max(80, 'El numero de operacion es muy largo')
    .optional(),
  notes: z
    .string()
    .trim()
    .max(400, 'El mensaje es muy largo')
    .optional(),
  transferDate: z
    .string()
    .datetime()
    .optional()
});

const transferDecisionSchema = z.object({
  note: z
    .string()
    .trim()
    .max(400, 'El mensaje es muy largo')
    .optional()
});

function parsePayload(payload: any): any {
  if (!payload) return {};
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload);
    } catch {
      return {};
    }
  }
  if (typeof payload === 'object') {
    return { ...payload };
  }
  return {};
}

function cleanupFile(file?: Express.Multer.File | null) {
  if (!file) return;
  fs.promises.unlink(file.path).catch(() => undefined);
}

const bankInfo = {
  bankName: process.env.TRANSFER_BANK_NAME || 'Banco Falabella',
  accountName: process.env.TRANSFER_ACCOUNT_NAME || '',
  accountRut: process.env.TRANSFER_ACCOUNT_RUT || '',
  accountNumber: process.env.TRANSFER_ACCOUNT_NUMBER || '',
  accountType: process.env.TRANSFER_ACCOUNT_TYPE || 'Cuenta corriente'
};

export function getTransferInfo(_req: Request, res: Response) {
  res.json({
    ...bankInfo,
    instructions:
      process.env.TRANSFER_EXTRA_INSTRUCTIONS ||
      'Envía el comprobante para acelerar la validación.'
  });
}

export async function notifyTransfer(req: Request, res: Response) {
  const user = (req as any).user as JwtUser | undefined;
  if (!user) {
    cleanupFile(req.file);
    return res.status(401).json({ message: 'No autenticado' });
  }
  const payload = {
    pedidoId: Number((req.body?.pedidoId as any) ?? 0),
    amount: Number(req.body?.amount ?? 0),
    operationNumber: typeof req.body?.operationNumber === 'string' ? req.body.operationNumber : undefined,
    notes: typeof req.body?.notes === 'string' ? req.body.notes : undefined,
    transferDate: typeof req.body?.transferDate === 'string' && req.body.transferDate.length
      ? req.body.transferDate
      : undefined
  };
  const parsed = transferNotificationSchema.safeParse(payload);
  if (!parsed.success) {
    cleanupFile(req.file);
    return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Datos inválidos' });
  }
  try {
    const pedido = await prisma.pedido.findUnique({
      where: { id: parsed.data.pedidoId },
      select: { id: true, userId: true, clienteEmail: true, estado: true, payload: true }
    });
    if (!pedido) {
      cleanupFile(req.file);
      return res.status(404).json({ message: 'Pedido no encontrado' });
    }
    if (!canAccessPedido(user, { userId: pedido.userId, clienteEmail: pedido.clienteEmail })) {
      cleanupFile(req.file);
      return res.status(403).json({ message: 'No puedes reportar pagos para este pedido' });
    }
    const now = new Date().toISOString();
    const currentPayload = parsePayload(pedido.payload);
    const transferPayload: TransferPayload = {
      status: 'pending',
      amount: parsed.data.amount,
      currency: 'CLP',
      submittedAt: now,
      submittedBy: { id: user.sub ?? null, email: user.email ?? null },
      transferDate: parsed.data.transferDate ?? null,
      operationNumber: parsed.data.operationNumber ?? null,
      notes: parsed.data.notes ?? null,
      receipt: req.file
        ? {
            storedName: path.basename(req.file.path),
            originalName: req.file.originalname || 'comprobante',
            mimeType: req.file.mimetype,
            size: req.file.size
          }
        : null,
      operator: undefined
    };
    currentPayload.transferPayment = transferPayload;

    const updated = await prisma.pedido.update({
      where: { id: pedido.id },
      data: {
        payload: currentPayload as any,
        estado: pedido.estado === 'PENDIENTE' ? 'POR_PAGAR' : pedido.estado,
        notificado: true
      },
      select: { id: true, estado: true, payload: true }
    });
    res.json(updated);
  } catch (error) {
    console.error('[transfer] error notificando transferencia', error);
    cleanupFile(req.file);
    res.status(500).json({ message: 'No pudimos registrar tu comprobante. Intenta nuevamente.' });
  }
}

export async function listTransferRequests(req: Request, res: Response) {
  const user = (req as any).user as JwtUser | undefined;
  if (!user || !user.role || user.role.toUpperCase() === 'CLIENT') {
    return res.status(403).json({ message: 'Requiere rol operador' });
  }
  try {
    const pedidos = await prisma.pedido.findMany({
      where: {
        estado: { in: ['PENDIENTE', 'EN_REVISION', 'POR_PAGAR'] }
      },
      select: {
        id: true,
        clienteNombre: true,
        clienteEmail: true,
        estado: true,
        createdAt: true,
        total: true,
        payload: true
      },
      orderBy: { updatedAt: 'desc' },
      take: 150
    });
    const filtered = pedidos.filter(p => {
      const payload = parsePayload(p.payload);
      return payload?.transferPayment?.status === 'pending';
    });
    res.json(filtered);
  } catch (error) {
    console.error('[transfer] error listando solicitudes', error);
    res.status(500).json({ message: 'No pudimos listar las transferencias pendientes.' });
  }
}

export async function downloadTransferReceipt(req: Request, res: Response) {
  try {
    const pedidoId = Number(req.params.pedidoId);
    if (!pedidoId) {
      return res.status(400).json({ message: 'Pedido inválido' });
    }
    const user = (req as any).user as JwtUser | undefined;
    if (!user) {
      return res.status(401).json({ message: 'No autenticado' });
    }
    const pedido = await prisma.pedido.findUnique({
      where: { id: pedidoId },
      select: { id: true, userId: true, clienteEmail: true, payload: true }
    });
    if (!pedido) {
      return res.status(404).json({ message: 'Pedido no encontrado' });
    }
    if (!canAccessPedido(user, { userId: pedido.userId, clienteEmail: pedido.clienteEmail })) {
      return res.status(403).json({ message: 'No autorizado' });
    }
    const payload = parsePayload(pedido.payload);
    const receipt = payload?.transferPayment?.receipt;
    if (!receipt?.storedName) {
      return res.status(404).json({ message: 'No hay comprobante disponible' });
    }
    const absolutePath = path.join(TRANSFER_UPLOAD_DIR, receipt.storedName);
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ message: 'Archivo no encontrado' });
    }
    res.setHeader('Content-Type', receipt.mimeType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(receipt.originalName)}"`
    );
    fs.createReadStream(absolutePath).pipe(res);
  } catch (error) {
    console.error('[transfer] error descargando comprobante', error);
    res.status(500).json({ message: 'No pudimos descargar el comprobante' });
  }
}

async function updateTransferStatus(
  req: Request,
  res: Response,
  status: 'approved' | 'rejected'
) {
  const user = (req as any).user as JwtUser | undefined;
  if (!user || !user.role || user.role.toUpperCase() === 'CLIENT') {
    return res.status(403).json({ message: 'Requiere rol operador' });
  }
  const pedidoId = Number(req.params.pedidoId);
  if (!pedidoId) {
    return res.status(400).json({ message: 'Pedido inválido' });
  }
  const parsed = transferDecisionSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Motivo inválido' });
  }
  try {
    const pedido = await prisma.pedido.findUnique({
      where: { id: pedidoId },
      select: { id: true, estado: true, payload: true }
    });
    if (!pedido) {
      return res.status(404).json({ message: 'Pedido no encontrado' });
    }
    const payload = parsePayload(pedido.payload);
    const transferPayment: TransferPayload | undefined = payload?.transferPayment;
    if (!transferPayment) {
      return res
        .status(400)
        .json({ message: 'No hay registros de transferencia para este pedido.' });
    }
    if (transferPayment.status === 'approved' && status === 'approved') {
      return res.status(400).json({ message: 'El pago ya fue aprobado.' });
    }
    if (transferPayment.status === 'rejected' && status === 'rejected') {
      return res.status(400).json({ message: 'El pago ya fue rechazado.' });
    }
    transferPayment.status = status;
    transferPayment.operator = {
      id: user.sub ?? null,
      email: user.email ?? null,
      decidedAt: new Date().toISOString(),
      note: parsed.data.note ?? null,
      action: status
    };
    payload.transferPayment = transferPayment;
    const updateData: any = {
      payload: payload as any,
      notificado: true
    };
    if (status === 'approved' && pedido.estado === 'POR_PAGAR') {
      updateData.estado = 'EN_PRODUCCION';
    }
    const updated = await prisma.pedido.update({
      where: { id: pedido.id },
      data: updateData,
      select: { id: true, estado: true, payload: true }
    });
    res.json(updated);
  } catch (error) {
    console.error('[transfer] error actualizando estado', error);
    res.status(500).json({ message: 'No pudimos actualizar la transferencia.' });
  }
}

export function approveTransfer(req: Request, res: Response) {
  return updateTransferStatus(req, res, 'approved');
}

export function rejectTransfer(req: Request, res: Response) {
  return updateTransferStatus(req, res, 'rejected');
}
