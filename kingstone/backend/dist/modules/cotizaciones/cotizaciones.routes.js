"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const authGuard_1 = require("../common/middlewares/authGuard");
const prisma = new client_1.PrismaClient();
const router = (0, express_1.Router)();
const allowedQuoteStates = ['NUEVA', 'EN_REVISION', 'ENVIADA', 'ACEPTADA', 'RECHAZADA'];
const openAssignmentStates = ['PENDIENTE', 'EN_PROGRESO', 'RE_ASIGNADA'];
const itemSchema = zod_1.z.object({
    producto: zod_1.z.string().min(1),
    variantes: zod_1.z.record(zod_1.z.any()).optional(),
    cantidad: zod_1.z.number().int().positive(),
    notas: zod_1.z.string().max(1000).optional(),
    archivos: zod_1.z.array(zod_1.z.any()).optional(),
});
const clienteSchema = zod_1.z.object({
    id: zod_1.z.number().int().positive().optional(),
    nombre: zod_1.z.string().min(1).optional(),
    email: zod_1.z.string().email().optional(),
    telefono: zod_1.z.string().min(3).optional(),
    preferenciaCanal: zod_1.z.enum(['whatsapp', 'email', 'webpush']).optional(),
}).partial();
const createSchema = zod_1.z.object({
    canal: zod_1.z.enum(['web', 'whatsapp', 'tienda']),
    totalEstimado: zod_1.z.number().nonnegative().max(9_999_999).optional(),
    notas: zod_1.z.string().max(2000).optional(),
    slaMinutos: zod_1.z.number().int().positive().max(720).optional(),
    cliente: clienteSchema.optional(),
    items: zod_1.z.array(itemSchema).min(1),
    operadorId: zod_1.z.number().int().positive().optional(),
});
const resolveSchema = zod_1.z.object({
    estadoCotizacion: zod_1.z.enum(['enviada', 'aceptada', 'rechazada']).optional(),
    totalFinal: zod_1.z.number().nonnegative().optional(),
    notas: zod_1.z.string().max(2000).optional(),
});
function isOperator(role) {
    if (!role)
        return false;
    const normalized = role.toUpperCase();
    return normalized === 'OPERATOR' || normalized === 'ADMIN';
}
function toDecimal(value) {
    if (typeof value !== 'number')
        return undefined;
    return new client_1.Prisma.Decimal(value.toFixed(2));
}
async function pickOperator(preferredId) {
    if (preferredId) {
        const preferred = await prisma.user.findFirst({
            where: {
                id: preferredId,
                role: { in: ['operator', 'admin'] },
            },
            select: { id: true, email: true, fullName: true },
        });
        if (preferred)
            return preferred;
    }
    const operators = await prisma.user.findMany({
        where: { role: { in: ['operator', 'admin'] } },
        select: { id: true, email: true, fullName: true },
    });
    if (!operators.length)
        return null;
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
function buildMetadata(payload, requester) {
    return {
        notas: payload.notas ?? null,
        cliente: payload.cliente ?? null,
        enviadoPor: requester?.sub
            ? { userId: requester.sub, email: requester.email ?? null }
            : null,
    };
}
function normalizeMetadata(metadata) {
    if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
        return { ...metadata };
    }
    return {};
}
async function triggerWebhook(args) {
    const url = process.env.N8N_WEBHOOK_URL;
    if (!url)
        return { skipped: true };
    const panelBase = process.env.PANEL_BASE_URL || 'https://app.kingston.local';
    const payload = {
        cotizacionId: args.cotizacionId,
        asignacionId: args.asignacionId,
        operadorId: args.operadorId ?? null,
        operadorEmail: args.operadorEmail ?? null,
        operadorNombre: args.operadorNombre ?? null,
        enlace: `${panelBase.replace(/\/$/, '')}/operacion/cotizaciones/${args.cotizacionId}`,
    };
    const fetchFn = globalThis.fetch;
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
        const payloadUser = req.user;
        const clienteId = dto.cliente?.id ??
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
        const result = await prisma.$transaction(async (tx) => {
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
        }
        catch (webhookError) {
            console.error('Error enviando webhook n8n', webhookError);
            await prisma.cotizacionNotificacion.update({
                where: { id: result.notificacion.id },
                data: {
                    estado: 'ERROR',
                    payload: {
                        ...result.notificacion.payload,
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
    }
    catch (error) {
        console.error('Error creando cotizacion', error);
        res.status(500).json({ message: 'Error interno' });
    }
});
router.get('/queue', authGuard_1.authGuard, async (req, res) => {
    try {
        const user = req.user;
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
        const where = {
            estado: { in: openAssignmentStates },
        };
        if (view === 'unassigned') {
            where.operadorId = null;
        }
        else if (view === 'overdue') {
            where.vencimiento = { lt: now };
        }
        else if (view === 'due_soon') {
            const inTen = new Date(now.getTime() + 10 * 60 * 1000);
            where.vencimiento = { gte: now, lte: inTen };
            where.operadorId = userId;
        }
        else {
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
            creadoEn: asignacion.creadoEn,
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
    }
    catch (error) {
        console.error('Error listando cotizaciones', error);
        res.status(500).json({ message: 'Error interno' });
    }
});
router.post('/:id/accept', authGuard_1.authGuard, async (req, res) => {
    try {
        const user = req.user;
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
            orderBy: { creadoEn: 'desc' },
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
    }
    catch (error) {
        console.error('Error aceptando asignacion', error);
        res.status(500).json({ message: 'Error interno' });
    }
});
router.post('/:id/resolve', authGuard_1.authGuard, async (req, res) => {
    try {
        const user = req.user;
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
            orderBy: { creadoEn: 'desc' },
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
        if (estadoCotizacion && !allowedQuoteStates.includes(estadoCotizacion)) {
            return res.status(400).json({ message: 'Estado de cotizacion invalido' });
        }
        const metadataBase = normalizeMetadata(asignacion.cotizacion.metadata);
        if (dto.notas) {
            metadataBase.resultadoNotas = dto.notas;
        }
        const cotizacionUpdateData = {
            estado: estadoCotizacion ?? 'ENVIADA',
        };
        if (dto.totalFinal !== undefined) {
            cotizacionUpdateData.totalEstimado = toDecimal(dto.totalFinal) ?? null;
        }
        if (dto.notas) {
            cotizacionUpdateData.metadata = metadataBase;
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
    }
    catch (error) {
        console.error('Error resolviendo asignacion', error);
        res.status(500).json({ message: 'Error interno' });
    }
});
exports.default = router;
