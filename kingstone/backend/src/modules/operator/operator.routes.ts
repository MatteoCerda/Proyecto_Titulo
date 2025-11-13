import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { normalizeRut } from '../common/rut';
import { generateClaimCode, hashClaimCode } from '../common/claim';
import { calculateTaxBreakdown, DEFAULT_CURRENCY, TAX_RATE } from '../common/pricing';

const router = Router();

const clienteQuerySchema = z.object({
  rut: z.string().min(4)
});

const clientePayloadSchema = z
  .object({
    rut: z.string().max(20).optional(),
    nombre: z.string().max(150).optional(),
    email: z.string().email().optional(),
    telefono: z.string().max(30).optional()
  })
  .refine(
    data => !!(data.rut || data.nombre || data.email || data.telefono),
    { message: 'Debes proporcionar al menos rut, nombre o un medio de contacto.' }
  );

const agendaSchema = z.object({
  fecha: z.string(),
  hora: z.string().optional(),
  tecnica: z.string().max(60).optional(),
  maquina: z.string().max(80).optional(),
  notas: z.string().max(400).optional()
});

const resumenItemSchema = z.object({
  itemId: z.number().int().positive(),
  name: z.string().min(1).max(200),
  quantity: z.number().int().positive(),
  itemType: z.string().max(120).optional(),
  provider: z.string().max(120).optional(),
  pricePresencial: z.number().nonnegative().nullable().optional(),
  priceWsp: z.number().nonnegative().nullable().optional(),
  selectedUnitPrice: z.number().nonnegative().nullable().optional()
});

const saleSchema = z.object({
  canal: z.enum(['presencial', 'wsp']),
  cliente: clientePayloadSchema,
  resumen: z.object({
    materialId: z.string().min(1).optional(),
    materialLabel: z.string().min(1).optional(),
    total: z.number().nonnegative(),
    itemsCount: z.number().int().nonnegative().optional(),
    note: z.string().max(600).optional(),
    dtfMetros: z.number().nonnegative().optional(),
    dtfCentimetros: z.number().nonnegative().optional(),
    dtfCategoria: z.enum(['dtf', 'textil', 'uv', 'tela', 'pvc', 'sticker', 'comprinter']).optional(),
    comprinterMaterial: z.enum(['pvc', 'pu']).optional(),
    adjuntoRequerido: z.boolean().optional(),
    items: z.array(resumenItemSchema).max(100).optional()
  }),
  agenda: agendaSchema.optional()
});

function combineDateTime(fecha: string, hora?: string | null): Date | null {
  if (!fecha) return null;
  const safeHora = hora && /^\d{2}:\d{2}$/.test(hora) ? hora : '00:00';
  const iso = `${fecha}T${safeHora}`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

router.get('/clientes/search', async (req, res) => {
  try {
    const parsed = clienteQuerySchema.safeParse({ rut: req.query.rut });
    if (!parsed.success) {
      return res.status(400).json({ message: 'RUT invalido' });
    }
    const info = normalizeRut(parsed.data.rut);
    if (!info) {
      return res.status(400).json({ message: 'RUT invalido' });
    }
    const record = await (prisma as any).cliente.findFirst({
      where: { rutNormalizado: info.compact },
      select: {
        id_cliente: true,
        rut: true,
        rutNormalizado: true,
        nombre_contacto: true,
        email: true,
        telefono: true,
        estado: true,
        claimExpiresAt: true,
        claimIssuedAt: true,
        id_usuario: true,
        tipoRegistro: true,
        pedidos: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { total: true, itemsCount: true }
        }
      }
    });
    if (!record) {
      return res.json({ found: false });
    }
    res.json({
      found: true,
      cliente: {
        id: record.id_cliente,
        rut: record.rut,
        estado: record.estado,
        nombre: record.nombre_contacto,
        email: record.email,
        telefono: record.telefono,
        claimExpiresAt: record.claimExpiresAt,
        claimIssuedAt: record.claimIssuedAt,
        hasAccount: !!record.id_usuario,
        tipoRegistro: record.tipoRegistro
      },
      resumen: record.pedidos?.[0]
        ? {
            total: record.pedidos[0].total,
            itemsCount: record.pedidos[0].itemsCount
          }
        : null
    });
  } catch (error) {
    console.error('[operator] search cliente error', error);
    res.status(500).json({ message: 'Error interno' });
  }
});

router.post('/ventas', async (req, res) => {
  try {
    const operator = (req as any).user;
    if (!operator?.sub) {
      return res.status(401).json({ message: 'No autorizado' });
    }
    const parsed = saleSchema.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues?.[0];
      return res.status(400).json({ message: issue?.message || 'Solicitud invalida', issues: parsed.error.issues });
    }
    const dto = parsed.data;
    const now = new Date();

    const rutInfo = dto.cliente.rut ? normalizeRut(dto.cliente.rut) : null;
    const normalizedRutDisplay = rutInfo?.normalized ?? dto.cliente.rut ?? null;
    const rutCompact = rutInfo?.compact ?? null;

    let clienteRecord =
      (rutCompact
        ? await (prisma as any).cliente.findFirst({ where: { rutNormalizado: rutCompact } })
        : null) ??
      (dto.cliente.email
        ? await (prisma as any).cliente.findFirst({ where: { email: dto.cliente.email } })
        : null) ??
      (dto.cliente.telefono
        ? await (prisma as any).cliente.findFirst({ where: { telefono: dto.cliente.telefono } })
        : null);

    let claimCode: string | null = null;
    let claimExpiresAt: Date | null = null;

    if (clienteRecord) {
      const updates: Record<string, any> = {};
      if (normalizedRutDisplay && (!clienteRecord.rut || clienteRecord.rut !== normalizedRutDisplay)) {
        updates['rut'] = normalizedRutDisplay;
        updates['rutNormalizado'] = rutCompact;
      }
      if (dto.cliente.nombre) updates['nombre_contacto'] = dto.cliente.nombre;
      if (dto.cliente.email) updates['email'] = dto.cliente.email;
      if (dto.cliente.telefono) updates['telefono'] = dto.cliente.telefono;
      updates['tipoRegistro'] = dto.canal;
      if (clienteRecord.estado === 'pending_claim') {
        claimCode = generateClaimCode();
        claimExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        updates['claimCodeHash'] = hashClaimCode(claimCode);
        updates['claimExpiresAt'] = claimExpiresAt;
        updates['claimIssuedAt'] = now;
      }
      if (Object.keys(updates).length) {
        clienteRecord = await (prisma as any).cliente.update({
          where: { id_cliente: clienteRecord.id_cliente },
          data: updates
        });
      }
    } else {
      claimCode = generateClaimCode();
      claimExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      clienteRecord = await (prisma as any).cliente.create({
        data: {
          rut: normalizedRutDisplay,
          rutNormalizado: rutCompact,
          nombre_contacto: dto.cliente.nombre || 'Cliente presencial',
          email: dto.cliente.email || null,
          telefono: dto.cliente.telefono || null,
          estado: 'pending_claim',
          tipoRegistro: dto.canal,
          claimCodeHash: hashClaimCode(claimCode),
          claimExpiresAt: claimExpiresAt,
          claimIssuedAt: now
        }
      });
    }

    const clienteId = Number(clienteRecord.id_cliente);
    const clienteNombre = dto.cliente.nombre || clienteRecord.nombre_contacto || 'Cliente presencial';
    const clienteEmail = dto.cliente.email || clienteRecord.email || null;
    const pedidoUserId = clienteRecord.id_usuario ? Number(clienteRecord.id_usuario) : null;
    const totalVenta = Math.round(dto.resumen.total);
    const breakdown = calculateTaxBreakdown(totalVenta, TAX_RATE);

    const pedido = await prisma.pedido.create({
      data: {
        userId: pedidoUserId,
        clienteId,
        clienteEmail,
        clienteNombre,
        estado: 'PENDIENTE',
        notificado: false,
        total: totalVenta,
        subtotal: breakdown.subtotal,
        taxTotal: breakdown.tax,
        moneda: DEFAULT_CURRENCY,
        itemsCount: dto.resumen.itemsCount ?? null,
        materialId: dto.resumen.materialId ?? null,
        materialLabel: dto.resumen.materialLabel ?? null,
        payload: {
          source: 'operator-sale',
          canal: dto.canal,
          createdAt: now.toISOString(),
          operador: {
            id: operator.sub,
            email: operator.email ?? null
          },
          cliente: {
            id: clienteId,
            rut: normalizedRutDisplay,
            nombre: clienteNombre,
            email: clienteEmail,
            telefono: dto.cliente.telefono ?? clienteRecord.telefono ?? null,
            estado: clienteRecord.estado
          },
          resumen: dto.resumen,
          pricing: {
            total: totalVenta,
            subtotal: breakdown.subtotal,
            taxTotal: breakdown.tax,
            taxRate: TAX_RATE,
            currency: DEFAULT_CURRENCY
          },
          claim: {
            pending: clienteRecord.estado === 'pending_claim',
            expiresAt: claimExpiresAt ? claimExpiresAt.toISOString() : clienteRecord.claimExpiresAt,
            issuedAt: clienteRecord.claimIssuedAt
          }
        }
      },
      select: { id: true }
    });

    let workOrder: any = null;
    if (dto.agenda) {
      const scheduled = combineDateTime(dto.agenda.fecha, dto.agenda.hora);
      workOrder = await prisma.ordenTrabajo.create({
        data: {
          pedidoId: pedido.id,
          tecnica: dto.agenda.tecnica || 'venta-presencial',
          maquina: dto.agenda.maquina || null,
          programadoPara: scheduled,
          notas: dto.agenda.notas || null,
          estado: 'cola'
        },
        select: {
          id: true,
          tecnica: true,
          maquina: true,
          estado: true,
          programadoPara: true,
          notas: true,
          createdAt: true,
          updatedAt: true
        }
      });
    }

    res.status(201).json({
      id: pedido.id,
      cliente: {
        id: clienteId,
        estado: clienteRecord.estado,
        hasAccount: !!clienteRecord.id_usuario
      },
      claimCode,
      claimExpiresAt,
      workOrder
    });
  } catch (error) {
    console.error('[operator] crear venta error', error);
    res.status(500).json({ message: 'Error interno' });
  }
});

export default router;
