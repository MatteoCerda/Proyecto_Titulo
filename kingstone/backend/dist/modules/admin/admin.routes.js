"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_service_1 = require("../auth/auth.service");
const auth_validation_1 = require("../auth/auth.validation");
const zod_1 = require("zod");
const prisma_1 = require("../../lib/prisma");
const router = (0, express_1.Router)();
function handleZodError(err, res) {
    const first = err.issues?.[0];
    res.status(400).json({
        message: first?.message || 'Datos invalidos',
        issues: err.issues?.map(issue => ({
            path: issue.path,
            message: issue.message
        }))
    });
}
const inventoryCreateSchema = zod_1.z.object({
    code: zod_1.z.string().min(1),
    name: zod_1.z.string().min(1),
    itemType: zod_1.z.string().min(1),
    color: zod_1.z.string().min(1),
    provider: zod_1.z.string().min(1),
    quantity: zod_1.z.coerce.number().int().min(0).default(0),
    priceWeb: zod_1.z.coerce.number().int().min(0).default(0),
    priceStore: zod_1.z.coerce.number().int().min(0).default(0),
    priceWsp: zod_1.z.coerce.number().int().min(0).default(0),
    umbralBajoStock: zod_1.z.coerce.number().int().min(0).default(0),
    qrRaw: zod_1.z.string().optional(),
    imageUrl: zod_1.z.string().min(1).optional()
});
const inventoryUpdateSchema = inventoryCreateSchema.partial();
const offerCreateSchema = zod_1.z.object({
    titulo: zod_1.z.string().min(1),
    descripcion: zod_1.z.string().optional(),
    imageUrl: zod_1.z.string().url().optional(),
    link: zod_1.z.string().url().optional(),
    activo: zod_1.z.coerce.boolean().optional(),
    prioridad: zod_1.z.coerce.number().int().min(0).optional(),
    itemId: zod_1.z.coerce.number().int().optional(),
    startAt: zod_1.z.coerce.date().optional(),
    endAt: zod_1.z.coerce.date().optional()
});
const offerUpdateSchema = offerCreateSchema.partial();
function normalizeKey(key) {
    return key
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}
function parseQrPayload(qrRaw) {
    if (!qrRaw)
        return {};
    const data = {};
    const lines = qrRaw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    for (const line of lines) {
        const [rawKey, ...rest] = line.split(':');
        if (!rawKey || !rest.length)
            continue;
        const key = normalizeKey(rawKey);
        const value = rest.join(':').trim();
        if (!value)
            continue;
        if (key.startsWith('codigo'))
            data.code = value;
        else if (key.startsWith('nombre'))
            data.name = value;
        else if (key.startsWith('tipo'))
            data.itemType = value;
        else if (key.startsWith('color'))
            data.color = value;
        else if (key.startsWith('proveedor'))
            data.provider = value;
    }
    if (data.code) {
        const parts = String(data.code).split('_');
        if (!data.name && parts.length > 0)
            data.name = parts[0];
        if (!data.itemType && parts.length > 1)
            data.itemType = parts[1];
        if (!data.color && parts.length > 2)
            data.color = parts[2];
        if (!data.provider && parts.length > 3)
            data.provider = parts[parts.length - 1];
    }
    return data;
}
// Usuario: crear
router.post('/users', async (req, res) => {
    try {
        const dto = (0, auth_validation_1.validate)('register', req.body);
        const user = await (0, auth_service_1.register)(dto, { allowRoleOverride: true, defaultRole: 'user' });
        res.status(201).json(user);
    }
    catch (err) {
        if (err instanceof zod_1.ZodError) {
            return handleZodError(err, res);
        }
        if (err?.message === 'EMAIL_IN_USE') {
            return res.status(409).json({ message: 'Email ya registrado' });
        }
        res.status(500).json({ message: 'Error interno' });
    }
});
// Usuario: listar
router.get('/users', async (req, res) => {
    const q = req.query.q?.trim() || '';
    const role = req.query.role?.trim();
    const where = {};
    if (q) {
        where.OR = [
            { email: { contains: q } },
            { fullName: { contains: q } }
        ];
    }
    if (role)
        where.role = role;
    const users = await prisma_1.prisma.user.findMany({
        where,
        orderBy: { id: 'asc' },
        select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            createdAt: true,
            cliente: {
                select: {
                    rut: true,
                    nombre_contacto: true,
                    telefono: true,
                    direccion: true,
                    comuna: true,
                    ciudad: true
                }
            }
        }
    });
    res.json(users);
});
// Usuario: detalle
router.get('/users/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!id)
        return res.status(400).json({ message: 'ID invalido' });
    const user = await prisma_1.prisma.user.findUnique({
        where: { id },
        select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            cliente: {
                select: {
                    rut: true,
                    nombre_contacto: true,
                    telefono: true,
                    direccion: true,
                    comuna: true,
                    ciudad: true
                }
            }
        }
    });
    if (!user)
        return res.status(404).json({ message: 'Usuario no encontrado' });
    res.json(user);
});
// Usuario: actualizar
router.patch('/users/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!id)
        return res.status(400).json({ message: 'ID invalido' });
    const { role, fullName, perfil } = req.body || {};
    try {
        const user = await prisma_1.prisma.user.update({
            where: { id },
            data: {
                ...(fullName ? { fullName } : {}),
                ...(role ? { role } : {})
            },
            select: { id: true, email: true, fullName: true, role: true }
        });
        if (perfil) {
            await prisma_1.prisma.cliente.upsert({
                where: { id_usuario: id },
                create: {
                    id_usuario: id,
                    email: user.email,
                    ...perfil
                },
                update: { ...perfil }
            });
        }
        res.json(user);
    }
    catch (e) {
        res.status(404).json({ message: 'Usuario no encontrado' });
    }
});
// Usuario: eliminar (batch)
router.delete('/users', async (req, res) => {
    const ids = req.body?.ids || [];
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: 'ids requerido' });
    }
    await prisma_1.prisma.$transaction([
        prisma_1.prisma.cliente.deleteMany({ where: { id_usuario: { in: ids } } }),
        prisma_1.prisma.user.deleteMany({ where: { id: { in: ids } } })
    ]);
    res.json({ ok: true });
});
// Inventario: listar
router.get('/inventory', async (_req, res) => {
    const items = await prisma_1.prisma.inventoryItem.findMany({
        orderBy: { name: 'asc' }
    });
    res.json(items);
});
// Inventario: detalle
router.get('/inventory/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!id)
        return res.status(400).json({ message: 'ID invalido' });
    const item = await prisma_1.prisma.inventoryItem.findUnique({ where: { id } });
    if (!item)
        return res.status(404).json({ message: 'Item no encontrado' });
    res.json(item);
});
// Inventario: crear
router.post('/inventory', async (req, res) => {
    try {
        const payload = { ...req.body };
        if (payload.qr && !payload.qrRaw)
            payload.qrRaw = payload.qr;
        if ((!payload.code || !payload.name) && payload.qrRaw) {
            Object.assign(payload, parseQrPayload(payload.qrRaw));
        }
        const dto = inventoryCreateSchema.parse(payload);
        const existing = await prisma_1.prisma.inventoryItem.findUnique({ where: { code: dto.code } });
        if (existing) {
            const updated = await prisma_1.prisma.inventoryItem.update({
                where: { id: existing.id },
                data: {
                    name: dto.name,
                    itemType: dto.itemType,
                    color: dto.color,
                    provider: dto.provider,
                    priceWeb: dto.priceWeb ?? existing.priceWeb,
                    priceStore: dto.priceStore ?? existing.priceStore,
                    priceWsp: dto.priceWsp ?? existing.priceWsp,
                    qrRaw: dto.qrRaw ?? existing.qrRaw,
                    umbralBajoStock: dto.umbralBajoStock ?? existing.umbralBajoStock,
                    imageUrl: dto.imageUrl !== undefined ? dto.imageUrl || null : existing.imageUrl,
                    quantity: existing.quantity + (dto.quantity ?? 0),
                    updatedAt: new Date()
                }
            });
            return res.status(200).json(updated);
        }
        const item = await prisma_1.prisma.inventoryItem.create({
            data: {
                code: dto.code,
                name: dto.name,
                itemType: dto.itemType,
                color: dto.color,
                provider: dto.provider,
                quantity: dto.quantity ?? 0,
                priceWeb: dto.priceWeb ?? 0,
                priceStore: dto.priceStore ?? 0,
                priceWsp: dto.priceWsp ?? 0,
                umbralBajoStock: dto.umbralBajoStock ?? 0,
                qrRaw: dto.qrRaw ?? null,
                imageUrl: dto.imageUrl ?? null
            }
        });
        res.status(201).json(item);
    }
    catch (err) {
        if (err instanceof zod_1.ZodError) {
            return handleZodError(err, res);
        }
        if (err?.code === 'P2002') {
            return res.status(409).json({ message: 'Codigo ya registrado' });
        }
        res.status(500).json({ message: 'Error interno' });
    }
});
// Inventario: actualizar
router.patch('/inventory/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!id)
        return res.status(400).json({ message: 'ID invalido' });
    try {
        const payload = { ...req.body };
        if (payload.qr && !payload.qrRaw)
            payload.qrRaw = payload.qr;
        if (!payload.code && payload.qrRaw) {
            Object.assign(payload, parseQrPayload(payload.qrRaw));
        }
        const dto = inventoryUpdateSchema.parse(payload);
        if (!Object.keys(dto).length) {
            return res.status(400).json({ message: 'Datos vacios' });
        }
        const item = await prisma_1.prisma.inventoryItem.update({
            where: { id },
            data: {
                ...(dto.code !== undefined ? { code: dto.code } : {}),
                ...(dto.name !== undefined ? { name: dto.name } : {}),
                ...(dto.itemType !== undefined ? { itemType: dto.itemType } : {}),
                ...(dto.color !== undefined ? { color: dto.color } : {}),
                ...(dto.provider !== undefined ? { provider: dto.provider } : {}),
                ...(dto.quantity !== undefined ? { quantity: dto.quantity } : {}),
                ...(dto.priceWeb !== undefined ? { priceWeb: dto.priceWeb } : {}),
                ...(dto.priceStore !== undefined ? { priceStore: dto.priceStore } : {}),
                ...(dto.priceWsp !== undefined ? { priceWsp: dto.priceWsp } : {}),
                ...(dto.qrRaw !== undefined ? { qrRaw: dto.qrRaw } : {}),
                ...(dto.umbralBajoStock !== undefined ? { umbralBajoStock: dto.umbralBajoStock } : {}),
                ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl } : {})
            }
        });
        res.json(item);
    }
    catch (err) {
        if (err instanceof zod_1.ZodError) {
            return handleZodError(err, res);
        }
        if (err?.code === 'P2025') {
            return res.status(404).json({ message: 'Item no encontrado' });
        }
        res.status(500).json({ message: 'Error interno' });
    }
});
// Inventario: eliminar
router.delete('/inventory/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!id)
        return res.status(400).json({ message: 'ID invalido' });
    try {
        await prisma_1.prisma.inventoryItem.delete({ where: { id } });
        res.json({ ok: true });
    }
    catch (err) {
        if (err?.code === 'P2025') {
            return res.status(404).json({ message: 'Item no encontrado' });
        }
        res.status(500).json({ message: 'Error interno' });
    }
});
// Ofertas: listar (admin)
router.get('/offers', async (req, res) => {
    const includeInactive = req.query.all === '1';
    const offers = await prisma_1.prisma.oferta.findMany({
        where: includeInactive ? {} : { activo: true },
        include: { inventario: { select: { id: true, code: true, name: true } } },
        orderBy: [
            { prioridad: 'desc' },
            { createdAt: 'desc' }
        ]
    });
    res.json(offers);
});
// Ofertas: crear
router.post('/offers', async (req, res) => {
    try {
        const dto = offerCreateSchema.parse(req.body);
        if (dto.startAt && dto.endAt && dto.startAt > dto.endAt) {
            return res.status(400).json({ message: 'La fecha de inicio debe ser anterior a la fecha de término' });
        }
        const offer = await prisma_1.prisma.oferta.create({
            data: {
                titulo: dto.titulo,
                descripcion: dto.descripcion ?? null,
                imageUrl: dto.imageUrl ?? null,
                link: dto.link ?? null,
                activo: dto.activo ?? true,
                prioridad: dto.prioridad ?? 0,
                itemId: dto.itemId ?? null,
                startAt: dto.startAt ?? null,
                endAt: dto.endAt ?? null
            },
            include: {
                inventario: { select: { id: true, code: true, name: true } }
            }
        });
        res.status(201).json(offer);
    }
    catch (err) {
        if (err instanceof zod_1.ZodError)
            return handleZodError(err, res);
        res.status(500).json({ message: 'Error interno' });
    }
});
// Ofertas: actualizar
router.patch('/offers/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!id)
        return res.status(400).json({ message: 'ID invalido' });
    try {
        const dto = offerUpdateSchema.parse(req.body);
        if (!Object.keys(dto).length)
            return res.status(400).json({ message: 'Datos vacios' });
        if (dto.startAt && dto.endAt && dto.startAt > dto.endAt) {
            return res.status(400).json({ message: 'La fecha de inicio debe ser anterior a la fecha de término' });
        }
        const offer = await prisma_1.prisma.oferta.update({
            where: { id },
            data: {
                ...(dto.titulo !== undefined ? { titulo: dto.titulo } : {}),
                ...(dto.descripcion !== undefined ? { descripcion: dto.descripcion ?? null } : {}),
                ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl ?? null } : {}),
                ...(dto.link !== undefined ? { link: dto.link ?? null } : {}),
                ...(dto.activo !== undefined ? { activo: dto.activo } : {}),
                ...(dto.prioridad !== undefined ? { prioridad: dto.prioridad } : {}),
                ...(dto.itemId !== undefined ? { itemId: dto.itemId ?? null } : {}),
                ...(dto.startAt !== undefined ? { startAt: dto.startAt ?? null } : {}),
                ...(dto.endAt !== undefined ? { endAt: dto.endAt ?? null } : {})
            },
            include: {
                inventario: { select: { id: true, code: true, name: true } }
            }
        });
        res.json(offer);
    }
    catch (err) {
        if (err instanceof zod_1.ZodError)
            return handleZodError(err, res);
        if (err?.code === 'P2025')
            return res.status(404).json({ message: 'Oferta no encontrada' });
        res.status(500).json({ message: 'Error interno' });
    }
});
// Ofertas: eliminar
router.delete('/offers/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!id)
        return res.status(400).json({ message: 'ID invalido' });
    try {
        await prisma_1.prisma.oferta.delete({ where: { id } });
        res.json({ ok: true });
    }
    catch (err) {
        if (err?.code === 'P2025')
            return res.status(404).json({ message: 'Oferta no encontrada' });
        res.status(500).json({ message: 'Error interno' });
    }
});
exports.default = router;
