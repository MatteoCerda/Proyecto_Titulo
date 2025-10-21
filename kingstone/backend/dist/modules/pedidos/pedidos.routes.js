"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
const itemSchema = zod_1.z.object({
    displayName: zod_1.z.string().min(1),
    quantity: zod_1.z.number().int().min(1),
    widthCm: zod_1.z.number().nonnegative(),
    heightCm: zod_1.z.number().nonnegative(),
    sizeMode: zod_1.z.string().optional(),
    previewUrl: zod_1.z.string().optional().or(zod_1.z.null()).optional(),
    coverageRatio: zod_1.z.number().min(0).max(1).optional(),
    outlinePath: zod_1.z.string().max(20000).optional().or(zod_1.z.null()).optional(),
    pixelArea: zod_1.z.number().nonnegative().optional(),
    trimmedWidthPx: zod_1.z.number().nonnegative().optional(),
    trimmedHeightPx: zod_1.z.number().nonnegative().optional()
});
const placementSchema = zod_1.z.object({
    x: zod_1.z.number(),
    y: zod_1.z.number(),
    width: zod_1.z.number(),
    height: zod_1.z.number(),
    previewUrl: zod_1.z.string().optional().or(zod_1.z.null()).optional(),
    clipPath: zod_1.z.string().optional().or(zod_1.z.null()).optional(),
    rotation: zod_1.z.number().optional(),
    designWidth: zod_1.z.number().nonnegative().optional(),
    designHeight: zod_1.z.number().nonnegative().optional(),
    margin: zod_1.z.number().nonnegative().optional(),
    itemId: zod_1.z.number().int().optional(),
    copyIndex: zod_1.z.number().int().optional()
});
const createSchema = zod_1.z.object({
    materialId: zod_1.z.string().min(1),
    materialLabel: zod_1.z.string().min(1),
    materialWidthCm: zod_1.z.number().nonnegative(),
    usedHeight: zod_1.z.number().nonnegative(),
    totalPrice: zod_1.z.number().nonnegative(),
    note: zod_1.z.string().max(600).optional(),
    items: zod_1.z.array(itemSchema).min(1),
    placements: zod_1.z.array(placementSchema).optional()
});
function isOperator(role) {
    if (!role)
        return false;
    const normalized = role.toUpperCase();
    return normalized === 'OPERATOR' || normalized === 'ADMIN';
}
router.post('/', async (req, res) => {
    try {
        const parsed = createSchema.safeParse(req.body);
        if (!parsed.success) {
            const issue = parsed.error.issues?.[0];
            return res.status(400).json({
                message: issue?.message || 'Solicitud invalida',
                issues: parsed.error.issues
            });
        }
        const dto = parsed.data;
        const payloadUser = req.user;
        const userId = payloadUser?.sub ? Number(payloadUser.sub) : null;
        let email = payloadUser?.email ?? null;
        let nombre = null;
        if (userId) {
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { email: true, fullName: true }
            });
            if (user) {
                email = user.email;
                nombre = user.fullName;
            }
        }
        const itemsCount = dto.items.reduce((acc, item) => acc + item.quantity, 0);
        const total = Math.round(dto.totalPrice || 0);
        const pedido = await prisma.pedido.create({
            data: {
                userId,
                clienteEmail: email,
                clienteNombre: nombre,
                estado: 'PENDIENTE',
                notificado: true,
                total,
                itemsCount,
                materialId: dto.materialId,
                materialLabel: dto.materialLabel,
                payload: {
                    ...dto,
                    createdAt: new Date().toISOString(),
                    cliente: {
                        email,
                        nombre
                    }
                }
            },
            select: { id: true }
        });
        res.status(201).json({ id: pedido.id });
    }
    catch (error) {
        console.error('Error creando pedido', error);
        res.status(500).json({ message: 'Error interno' });
    }
});
router.get('/', async (req, res) => {
    try {
        const user = req.user;
        if (!user || !isOperator(user.role)) {
            return res.status(403).json({ message: 'Requiere rol operador' });
        }
        const statusRaw = req.query.status?.trim();
        const status = statusRaw && statusRaw.length ? statusRaw.toUpperCase() : 'PENDIENTE';
        const where = {};
        if (status !== 'TODOS') {
            where.estado = status;
        }
        const pedidos = await prisma.pedido.findMany({
            where,
            orderBy: { id: 'desc' },
            take: 100
        });
        const respuesta = pedidos.map(p => ({
            id: p.id,
            cliente: p.clienteNombre || p.clienteEmail || 'Cliente',
            email: p.clienteEmail || '',
            estado: p.estado,
            createdAt: p.createdAt,
            total: p.total || undefined,
            items: p.itemsCount || undefined,
            notificado: p.notificado,
            materialLabel: p.materialLabel || undefined,
            note: typeof p.payload === 'object' && p.payload !== null ? p.payload.note ?? undefined : undefined,
            payload: p.payload
        }));
        res.json(respuesta);
    }
    catch (error) {
        console.error('Error listando pedidos', error);
        res.status(500).json({ message: 'Error interno' });
    }
});
router.post('/:id/ack', async (req, res) => {
    try {
        const user = req.user;
        if (!user || !isOperator(user.role)) {
            return res.status(403).json({ message: 'Requiere rol operador' });
        }
        const id = Number(req.params.id);
        if (!id) {
            return res.status(400).json({ message: 'ID invalido' });
        }
        const pedido = await prisma.pedido.findUnique({ where: { id } });
        if (!pedido) {
            return res.status(404).json({ message: 'Pedido no encontrado' });
        }
        const estadoBody = typeof req.body?.estado === 'string' ? String(req.body.estado).trim().toUpperCase() : undefined;
        const nextEstado = estadoBody || (pedido.estado === 'PENDIENTE' ? 'EN_REVISION' : pedido.estado);
        const updated = await prisma.pedido.update({
            where: { id },
            data: {
                estado: nextEstado,
                notificado: false
            },
            select: {
                id: true,
                estado: true,
                notificado: true
            }
        });
        res.json(updated);
    }
    catch (error) {
        console.error('Error confirmando pedido', error);
        res.status(500).json({ message: 'Error interno' });
    }
});
exports.default = router;
