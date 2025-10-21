import { Router } from 'express';
import { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { authGuard } from '../common/middlewares/authGuard';

const prisma = new PrismaClient();
const router = Router();

const allowedQuoteStates = ['NUEVA', 'EN_REVISION', 'ENVIADA', 'ACEPTADA', 'RECHAZADA'] as const;
const openAssignmentStates = ['PENDIENTE', 'EN_PROGRESO', 'RE_ASIGNADA'];

const itemSchema = z.object({
  producto: z.string().min(1),
  variantes: z.record(z.any()).optional(),
  cantidad: z.number().int().positive(),
  notas: z.string().max(1000).optional(),
  archivos: z.array(z.any()).optional(),
});

const clienteSchema = z.object({
  id: z.number().int().positive().optional(),
  nombre: z.string().min(1).optional(),
  email: z.string().email().optional(),
  telefono: z.string().min(3).optional(),
  preferenciaCanal: z.enum(['whatsapp', 'email', 'webpush']).optional(),
}).partial();

const createSchema = z.object({
  canal: z.enum(['web', 'whatsapp', 'tienda']),
  totalEstimado: z.number().nonnegative().max(9_999_999).optional(),
  notas: z.string().max(2000).optional(),
  slaMinutos: z.number().int().positive().max(720).optional(),
  cliente: clienteSchema.optional(),
  items: z.array(itemSchema).min(1),
  operadorId: z.number().int().positive().optional(),
});

const resolveSchema = z.object({
  estadoCotizacion: z.enum(['enviada', 'aceptada', 'rechazada']).optional(),
  totalFinal: z.number().nonnegative().optional(),
  notas: z.string().max(2000).optional(),
});

type JwtUser = {
  sub?: number;
  email?: string;
  role?: string;
};

function isOperator(role?: string | null) {
  if (!role) return false;
  const normalized = role.toUpperCase();
  return normalized === 'OPERATOR' || normalized === 'ADMIN';
}

function toDecimal(value?: number | null) {
  if (typeof value !== 'number') return undefined;
  return new Prisma.Decimal(value.toFixed(2));
}

async function pickOperator(preferredId?: number) {
  if (preferredId) {
    const preferred = await prisma.user.findFirst({
      where: {
        id: preferredId,
        role: { in: ['operator', 'admin'] },
      },
      select: { id: true, email: true, fullName: true },
    });
    if (preferred) return preferred;
  }

  const operators = await prisma.user.findMany({
    where: { role: { in: ['operator', 'admin'] } },
    select: { id: true, email: true, fullName: true },
  });

  if (!operators.length) return null;

  const workloads = await prisma.asignacion.groupBy({
    by: ['operadorId'],
    where: {
      operadorId: { in: operators.map(o => o.id) },
      estado: { in: ['PENDIENTE', 'EN_PROGRESO'] },
    },
    _count: { _all: true },
  });

  let selected = operators[0];
  let lowest = workloads.find(w => w.operadorId === selected.id)?._count._all ?? 0;

  for (const operator of operators.slice(1)) {
    const count = workloads.find(w => w.operadorId === operator.id)?._count._all ?? 0;
    if (count < lowest) {
      lowest = count;
      selected = operator;
    }
  }

  return selected;
}

function buildMetadata(payload: z.infer<typeof createSchema>, requester?: JwtUser) {
  return {
    notas: payload.notas ?? null,
    cliente: payload.cliente ?? null,
    enviadoPor: requester?.sub
      ? { userId: requester.sub, email: requester.email ?? null }
      : null,
  };
}

function normalizeMetadata(metadata: unknown) {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    return { ...(metadata as Record<string, unknown>) };
  }
  return {};
}

async function triggerWebhook(args: {
  cotizacionId: number;
  asignacionId: number;
  operadorId?: number | null;
  operadorEmail?: string | null;
  operadorNombre?: string | null;
}) {
  const url = process.env.N8N_WEBHOOK_URL;
  if (!url) return { skipped: true };

  const panelBase = process.env.PANEL_BASE_URL || 'https://app.kingston.local';
  const payload = {
    cotizacionId: args.cotizacionId,
    asignacionId: args.asignacionId,
    operadorId: args.operadorId ?? null,
    operadorEmail: args.operadorEmail ?? null,
    operadorNombre: args.operadorNombre ?? null,
    enlace: `${panelBase.replace(/\/$/, '')}/operacion/cotizaciones/${args.cotizacionId}`,
  };

  const fetchFn = (globalThis as any).fetch as
    | ((input: string, init?: any) => Promise<any>)
    | undefined;

  if (!fetchFn) {
    throw new Error('Fetch API is not available in this runtime');
  }

  const response = await fetchFn(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    throw new Error(`Webhook responded with ${response.status}: ${bodyText}`);
  }

  return { skipped: false };
}

router.post('/', async (req, res) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return res.status(400).json({
        message: issue?.message || 'Solicitud invalida',
        issues: parsed.error.issues,
      });
    }

    const dto = parsed.data;
    const payloadUser = (req as any).user as JwtUser | undefined;
    const clienteId =
      dto.cliente?.id ??
      (payloadUser?.sub ? Number(payloadUser.sub) : undefined);

    const operator = await pickOperator(dto.operadorId);
    if (!operator) {
      return res
        .status(409)
        .json({ message: 'No hay operadores disponibles para asignar' });
    }

    const slaMinutos = dto.slaMinutos ?? 10;
    const vencimiento = new Date(Date.now() + slaMinutos * 60 * 1000);

    const metadata = buildMetadata(dto, payloadUser);

    const result = await prisma.$transaction(async tx => {
      const cotizacion = await tx.cotizacion.create({
        data: {
          clienteId: clienteId ?? null,
          canal: dto.canal.toUpperCase(),
          estado: 'NUEVA',
          totalEstimado: toDecimal(dto.totalEstimado),
          metadata,
          items: {
            create: dto.items.map(item => ({
              producto: item.producto,
              variantes: item.variantes ?? undefined,
              cantidad: item.cantidad,
              notas: item.notas ?? undefined,
              archivos: item.archivos ?? undefined,
            })),
          },
        },
        include: {
          items: true,
        },
      });

      const asignacion = await tx.asignacion.create({
        data: {
          cotizacionId: cotizacion.id,
          operadorId: operator.id,
          estado: 'PENDIENTE',
          slaMinutos,
          vencimiento,
        },
      });

      const notificacion = await tx.cotizacionNotificacion.create({
        data: {
          cotizacionId: cotizacion.id,
          canal: 'webhook',
          destino: operator.email ?? 'operador',
          estado: 'PENDIENTE',
          payload: {
            template: 'nueva_cotizacion',
            operadorId: operator.id,
          },
        },
      });

      return { cotizacion, asignacion, notificacion };
    });

    try {
      await triggerWebhook({
        cotizacionId: result.cotizacion.id,
        asignacionId: result.asignacion.id,
        operadorId: operator.id,
        operadorEmail: operator.email ?? null,
        operadorNombre: operator.fullName ?? null,
      });

      await prisma.cotizacionNotificacion.update({
        where: { id: result.notificacion.id },
        data: {
          estado: 'ENVIADO',
          enviadoEn: new Date(),
        },
      });
    } catch (webhookError) {
      console.error('Error enviando webhook n8n', webhookError);
      await prisma.cotizacionNotificacion.update({
        where: { id: result.notificacion.id },
        data: {
          estado: 'ERROR',
          payload: {
            ...(result.notificacion.payload as any),
            error: webhookError instanceof Error ? webhookError.message : 'error_desconocido',
          },
        },
      });
    }

    res.status(201).json({
      id: result.cotizacion.id,
      asignacionId: result.asignacion.id,
      operadorId: operator.id,
    });
  } catch (error) {
    console.error('Error creando cotizacion', error);
    res.status(500).json({ message: 'Error interno' });
  }
});

router.get(
  '/queue',
  authGuard,
  async (req, res) => {
    try {
      const user = (req as any).user as JwtUser | undefined;
      if (!user || !isOperator(user.role)) {
        return res.status(403).json({ message: 'Requiere rol operador' });
      }

      const userId = Number(user.sub);
      if (!userId) {
        return res.status(400).json({ message: 'Usuario invalido' });
      }

      const viewRaw = typeof req.query.view === 'string' ? req.query.view : 'mine';
      const view = viewRaw.toLowerCase();
      const now = new Date();

      const where: Prisma.AsignacionWhereInput = {
        estado: { in: openAssignmentStates },
      };

      if (view === 'unassigned') {
        where.operadorId = null;
      } else if (view === 'overdue') {
        where.vencimiento = { lt: now };
      } else if (view === 'due_soon') {
        const inTen = new Date(now.getTime() + 10 * 60 * 1000);
        where.vencimiento = { gte: now, lte: inTen };
        where.operadorId = userId;
      } else {
        where.operadorId = userId;
      }

      const asignaciones = await prisma.asignacion.findMany({
        where,
        orderBy: [
          { estado: 'asc' },
          { vencimiento: 'asc' },
        ],
        take: 50,
        include: {
          cotizacion: {
            include: {
              items: true,
            },
          },
        },
      });

      const respuesta = asignaciones.map(asignacion => ({
        id: asignacion.id,
        estado: asignacion.estado,
        slaMinutos: asignacion.slaMinutos,
        vencimiento: asignacion.vencimiento,
        creadoEn: asignacion.createdAt,
        cotizacion: {
          id: asignacion.cotizacion.id,
          canal: asignacion.cotizacion.canal,
          estado: asignacion.cotizacion.estado,
          totalEstimado: asignacion.cotizacion.totalEstimado,
          metadata: asignacion.cotizacion.metadata,
          items: asignacion.cotizacion.items,
        },
      }));

      res.json(respuesta);
    } catch (error) {
      console.error('Error listando cotizaciones', error);
      res.status(500).json({ message: 'Error interno' });
    }
  },
);

router.post(
  '/:id/accept',
  authGuard,
  async (req, res) => {
    try {
      const user = (req as any).user as JwtUser | undefined;
      if (!user || !isOperator(user.role)) {
        return res.status(403).json({ message: 'Requiere rol operador' });
      }

      const userId = Number(user.sub);
      if (!userId) {
        return res.status(400).json({ message: 'Usuario invalido' });
      }

      const id = Number(req.params.id);
      if (!id) {
        return res.status(400).json({ message: 'ID invalido' });
      }

      const asignacion = await prisma.asignacion.findFirst({
        where: {
          cotizacionId: id,
          estado: { in: ['PENDIENTE', 'RE_ASIGNADA'] },
        },
        orderBy: { createdAt: 'desc' },
        include: { cotizacion: true },
      });

      if (!asignacion) {
        return res.status(404).json({ message: 'Asignacion no encontrada' });
      }

      if (asignacion.operadorId && asignacion.operadorId !== userId) {
        return res.status(409).json({ message: 'Asignacion pertenece a otro operador' });
      }

      const [updatedAsignacion] = await prisma.$transaction([
        prisma.asignacion.update({
          where: { id: asignacion.id },
          data: {
            operadorId: userId,
            estado: 'EN_PROGRESO',
            aceptadoEn: new Date(),
          },
        }),
        prisma.cotizacion.update({
          where: { id: asignacion.cotizacionId },
          data: { estado: 'EN_REVISION' },
        }),
      ]);

      res.json(updatedAsignacion);
    } catch (error) {
      console.error('Error aceptando asignacion', error);
      res.status(500).json({ message: 'Error interno' });
    }
  },
);

router.post(
  '/:id/resolve',
  authGuard,
  async (req, res) => {
    try {
      const user = (req as any).user as JwtUser | undefined;
      if (!user || !isOperator(user.role)) {
        return res.status(403).json({ message: 'Requiere rol operador' });
      }

      const userId = Number(user.sub);
      if (!userId) {
        return res.status(400).json({ message: 'Usuario invalido' });
      }

      const id = Number(req.params.id);
      if (!id) {
        return res.status(400).json({ message: 'ID invalido' });
      }

      const validate = resolveSchema.safeParse(req.body ?? {});
      if (!validate.success) {
        const issue = validate.error.issues[0];
        return res.status(400).json({
          message: issue?.message || 'Solicitud invalida',
          issues: validate.error.issues,
        });
      }
      const dto = validate.data;

      const asignacion = await prisma.asignacion.findFirst({
        where: {
          cotizacionId: id,
          estado: { in: ['PENDIENTE', 'EN_PROGRESO'] },
        },
        orderBy: { createdAt: 'desc' },
        include: { cotizacion: true },
      });

      if (!asignacion) {
        return res.status(404).json({ message: 'Asignacion no encontrada' });
      }

      if (asignacion.operadorId && asignacion.operadorId !== userId) {
        return res.status(409).json({ message: 'Asignacion pertenece a otro operador' });
      }

      if (!asignacion.operadorId) {
        return res.status(409).json({ message: 'Asignacion aun no ha sido aceptada' });
      }

      const estadoCotizacion = dto.estadoCotizacion
        ? dto.estadoCotizacion.toUpperCase()
        : undefined;

      if (estadoCotizacion && !allowedQuoteStates.includes(estadoCotizacion as any)) {
        return res.status(400).json({ message: 'Estado de cotizacion invalido' });
      }

      const metadataBase = normalizeMetadata(asignacion.cotizacion.metadata);
      if (dto.notas) {
        metadataBase.resultadoNotas = dto.notas;
      }

      const cotizacionUpdateData: Prisma.CotizacionUpdateInput = {
        estado: estadoCotizacion ?? 'ENVIADA',
      };

      if (dto.totalFinal !== undefined) {
        cotizacionUpdateData.totalEstimado = toDecimal(dto.totalFinal) ?? null;
      }

      if (dto.notas) {
        cotizacionUpdateData.metadata = metadataBase as Prisma.InputJsonValue;
      }

      await prisma.$transaction([
        prisma.asignacion.update({
          where: { id: asignacion.id },
          data: {
            estado: 'RESUELTA',
            resueltoEn: new Date(),
          },
        }),
        prisma.cotizacion.update({
          where: { id },
          data: cotizacionUpdateData,
        }),
      ]);

      res.json({ ok: true });
    } catch (error) {
      console.error('Error resolviendo asignacion', error);
      res.status(500).json({ message: 'Error interno' });
    }
  },
);

export default router;

