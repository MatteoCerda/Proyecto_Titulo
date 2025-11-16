"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const authGuard_1 = require("../common/middlewares/authGuard");
const prisma_1 = require("../../lib/prisma");
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
class HttpError extends Error {
    status;
    payload;
    constructor(status, payload) {
        super(typeof payload?.message === 'string' ? payload.message : 'HTTP_ERROR');
        this.status = status;
        this.payload = payload;
        this.name = 'HttpError';
    }
}
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
        const preferred = await prisma_1.prisma.user.findFirst({
            where: {
                id: preferredId,
                role: { in: ['operator', 'admin'] },
            },
            select: { id: true, email: true, fullName: true },
        });
        if (preferred)
            return preferred;
    }
    const operators = await prisma_1.prisma.user.findMany({
        where: { role: { in: ['operator', 'admin'] } },
        select: { id: true, email: true, fullName: true },
    });
    if (!operators.length)
        return null;
    const workloads = await prisma_1.prisma.asignacion.groupBy({
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
const MATERIAL_WIDTH_MAP = {
    dtf: 57,
    dtf57: 57,
    dtf57cm: 57,
    dtftextil: 57,
    vinilodecorativo: 56,
    vinilodecorativo56: 56,
    vinilodecorativo56cm: 56,
    vinilotextil: 47,
    vinilotextil47: 47,
    vinilotextil47cm: 47,
    comprinter: 47,
    comprinterpvc: 47,
    comprinterpvc47: 47,
    comprinterpvc47cm: 47,
    comprinterpu: 47,
    comprinterpu47: 47,
    comprinterpu47cm: 47,
    sticker70: 70,
    sticker70cm: 70,
};
const INVENTORY_ID_KEYS = [
    'inventoryItemId',
    'inventoryId',
    'itemId',
    'inventarioId',
    'inventory_id',
    'item_id',
    'inventario_id',
    'idInventario',
    'id_inventory',
    'idItem',
];
const INVENTORY_CODE_KEYS = [
    'materialId',
    'material_id',
    'material',
    'materialCode',
    'material_code',
    'inventoryCode',
    'inventory_code',
    'codigoInventario',
    'codigo',
    'code',
    'sku',
];
const INVENTORY_NAME_KEYS = [
    'materialLabel',
    'materialNombre',
    'nombreMaterial',
    'label',
    'name',
    'displayName',
    'producto',
    'productName',
    'productLabel',
];
const INVENTORY_QUANTITY_KEYS = [
    'inventoryQuantity',
    'cantidadInventario',
    'inventarioCantidad',
    'cantidadMaterial',
    'materialCantidad',
    'consumo',
    'consumoCantidad',
    'usedUnits',
    'units',
    'unitCount',
    'stockConsumir',
];
const WIDTH_KEYS = [
    'width',
    'widthCm',
    'width_cm',
    'ancho',
    'anchoCm',
    'ancho_cm',
    'rollWidth',
    'rollWidthCm',
    'roll_width_cm',
    'materialWidth',
    'materialWidthCm',
];
function isJsonObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function normalizeMatchKey(value) {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]/g, '')
        .toLowerCase();
}
function parseNumberLike(value) {
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    if (typeof value === 'string') {
        const normalized = value.replace(/,/g, '.').match(/-?\d+(?:\.\d+)?/);
        if (!normalized)
            return null;
        const parsed = Number(normalized[0]);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}
function collectCandidatesFromKeys(target, source, keys) {
    for (const key of keys) {
        const value = source[key];
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed) {
                target.add(trimmed);
            }
        }
    }
}
function extractInventoryIdCandidate(source) {
    for (const key of INVENTORY_ID_KEYS) {
        const candidate = parseNumberLike(source[key]);
        if (candidate !== null) {
            const intCandidate = Math.trunc(candidate);
            if (intCandidate > 0)
                return intCandidate;
        }
    }
    const nestedKeys = ['inventory', 'inventario', 'material', 'materialInfo'];
    for (const nestedKey of nestedKeys) {
        const nested = source[nestedKey];
        if (isJsonObject(nested)) {
            const nestedCandidate = extractInventoryIdCandidate(nested);
            if (nestedCandidate)
                return nestedCandidate;
        }
    }
    return null;
}
function extractQuantityOverride(source) {
    for (const key of INVENTORY_QUANTITY_KEYS) {
        const value = parseNumberLike(source[key]);
        if (value !== null)
            return value;
    }
    const nestedKeys = ['inventory', 'inventario', 'material', 'materialInfo'];
    for (const nestedKey of nestedKeys) {
        const nested = source[nestedKey];
        if (isJsonObject(nested)) {
            const nestedValue = extractQuantityOverride(nested);
            if (nestedValue !== null)
                return nestedValue;
        }
    }
    return null;
}
function parseWidthFromText(text) {
    if (typeof text !== 'string')
        return null;
    const match = text.match(/(\d+(?:[.,]\d+)?)\s*(?:cm|centimetros|centímetros)/i);
    if (!match)
        return null;
    const value = Number(match[1].replace(',', '.'));
    return Number.isFinite(value) ? value : null;
}
function inferWidthFromMaterial(materialId) {
    if (!materialId)
        return null;
    const normalized = normalizeMatchKey(materialId);
    for (const [key, width] of Object.entries(MATERIAL_WIDTH_MAP)) {
        if (normalized.includes(key)) {
            return width;
        }
    }
    return null;
}
function extractWidthFromVariant(variant, fallbackTexts, materialId) {
    for (const key of WIDTH_KEYS) {
        const value = parseNumberLike(variant[key]);
        if (value !== null)
            return value;
    }
    const nestedKeys = ['material', 'inventory', 'materialInfo'];
    for (const nestedKey of nestedKeys) {
        const nested = variant[nestedKey];
        if (isJsonObject(nested)) {
            for (const key of WIDTH_KEYS) {
                const value = parseNumberLike(nested[key]);
                if (value !== null)
                    return value;
            }
        }
    }
    for (const text of fallbackTexts) {
        const width = parseWidthFromText(text);
        if (width !== null)
            return width;
    }
    return inferWidthFromMaterial(materialId);
}
function buildMaterialInfo(item) {
    const variant = isJsonObject(item.variantes) ? item.variantes : {};
    const codeSet = new Set();
    const nameSet = new Set();
    collectCandidatesFromKeys(codeSet, variant, INVENTORY_CODE_KEYS);
    collectCandidatesFromKeys(nameSet, variant, INVENTORY_NAME_KEYS);
    const nestedMaterial = variant.material;
    if (isJsonObject(nestedMaterial)) {
        collectCandidatesFromKeys(codeSet, nestedMaterial, ['id', 'code', 'codigo']);
        collectCandidatesFromKeys(nameSet, nestedMaterial, ['label', 'nombre', 'name', 'displayName']);
    }
    const nestedInventory = variant.inventory;
    if (isJsonObject(nestedInventory)) {
        collectCandidatesFromKeys(codeSet, nestedInventory, ['id', 'code', 'codigo']);
        collectCandidatesFromKeys(nameSet, nestedInventory, ['label', 'nombre', 'name', 'displayName']);
    }
    nameSet.add(item.producto);
    const codeCandidates = Array.from(codeSet);
    const nameCandidates = Array.from(nameSet);
    let inventoryItemId = extractInventoryIdCandidate(variant);
    if (!inventoryItemId && isJsonObject(nestedMaterial)) {
        inventoryItemId = extractInventoryIdCandidate(nestedMaterial) ?? inventoryItemId;
    }
    if (!inventoryItemId && isJsonObject(nestedInventory)) {
        inventoryItemId = extractInventoryIdCandidate(nestedInventory) ?? inventoryItemId;
    }
    const materialId = codeCandidates.length ? codeCandidates[0] : null;
    const quantityOverride = extractQuantityOverride(variant);
    let quantity = item.cantidad;
    if (quantityOverride !== null) {
        if (quantityOverride <= 0) {
            quantity = 0;
        }
        else {
            quantity = Math.max(1, Math.round(quantityOverride));
        }
    }
    const fallbackTexts = Array.from(new Set([...nameCandidates, ...codeCandidates]));
    const width = extractWidthFromVariant(variant, fallbackTexts, materialId);
    return {
        itemId: item.id,
        producto: item.producto,
        quantity,
        widthCm: width ?? null,
        materialId,
        inventoryItemId: inventoryItemId ?? null,
        codeCandidates,
        nameCandidates,
    };
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
        clienteEmail: args.clienteEmail ?? null,
        clienteNombre: args.clienteNombre ?? null,
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
router.post('/', authGuard_1.authGuard, async (req, res) => {
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
        const requesterId = payloadUser?.sub ? Number(payloadUser.sub) : null;
        const requestedClienteId = typeof dto.cliente?.id === 'number' ? dto.cliente.id : null;
        const isRequesterOperator = isOperator(payloadUser?.role);
        if (!isRequesterOperator && requestedClienteId && requesterId !== requestedClienteId) {
            return res
                .status(403)
                .json({ message: 'No puedes crear cotizaciones para otro usuario.' });
        }
        const clienteId = isRequesterOperator
            ? requestedClienteId ?? requesterId
            : requesterId;
        const operator = await pickOperator(dto.operadorId);
        if (!operator) {
            return res
                .status(409)
                .json({ message: 'No hay operadores disponibles para asignar' });
        }
        const slaMinutos = dto.slaMinutos ?? 10;
        const vencimiento = new Date(Date.now() + slaMinutos * 60 * 1000);
        const metadata = buildMetadata(dto, payloadUser);
        let clienteEmail = typeof dto.cliente?.email === 'string' ? dto.cliente.email : null;
        let clienteNombre = typeof dto.cliente?.nombre === 'string' ? dto.cliente.nombre : null;
        if (requestedClienteId && (!clienteEmail || !clienteNombre)) {
            const clienteRecord = await prisma_1.prisma.cliente.findUnique({
                where: { id_cliente: requestedClienteId },
                select: { email: true, nombre_contacto: true },
            });
            if (clienteRecord) {
                if (!clienteEmail && clienteRecord.email) {
                    clienteEmail = clienteRecord.email;
                }
                if (!clienteNombre && clienteRecord.nombre_contacto) {
                    clienteNombre = clienteRecord.nombre_contacto;
                }
            }
        }
        if (!clienteEmail && !isRequesterOperator && payloadUser?.email) {
            clienteEmail = payloadUser.email;
        }
        const result = await prisma_1.prisma.$transaction(async (tx) => {
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
                clienteEmail,
                clienteNombre,
            });
            await prisma_1.prisma.cotizacionNotificacion.update({
                where: { id: result.notificacion.id },
                data: {
                    estado: 'ENVIADO',
                    enviadoEn: new Date(),
                },
            });
        }
        catch (webhookError) {
            console.error('Error enviando webhook n8n', webhookError);
            await prisma_1.prisma.cotizacionNotificacion.update({
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
        const asignaciones = await prisma_1.prisma.asignacion.findMany({
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
        const asignacion = await prisma_1.prisma.asignacion.findFirst({
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
        const [updatedAsignacion] = await prisma_1.prisma.$transaction([
            prisma_1.prisma.asignacion.update({
                where: { id: asignacion.id },
                data: {
                    operadorId: userId,
                    estado: 'EN_PROGRESO',
                    aceptadoEn: new Date(),
                },
            }),
            prisma_1.prisma.cotizacion.update({
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
        const asignacion = await prisma_1.prisma.asignacion.findFirst({
            where: {
                cotizacionId: id,
                estado: { in: ['PENDIENTE', 'EN_PROGRESO'] },
            },
            orderBy: { createdAt: 'desc' },
            include: {
                cotizacion: {
                    include: {
                        items: true,
                    },
                },
            },
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
        const cotizacionItems = asignacion.cotizacion.items ?? [];
        const materialInfos = cotizacionItems.map(item => buildMaterialInfo({
            id: item.id,
            producto: item.producto,
            cantidad: item.cantidad,
            variantes: item.variantes,
        }));
        if (!materialInfos.length) {
            throw new HttpError(400, {
                message: 'La cotizacion no contiene materiales para descontar del inventario.',
            });
        }
        const idCandidates = new Set();
        const codeCandidates = new Set();
        const nameCandidates = new Set();
        for (const info of materialInfos) {
            if (info.inventoryItemId) {
                idCandidates.add(info.inventoryItemId);
            }
            info.codeCandidates.forEach(candidate => codeCandidates.add(candidate));
            info.nameCandidates.forEach(candidate => nameCandidates.add(candidate));
        }
        const inventoryConditions = [];
        if (idCandidates.size) {
            inventoryConditions.push({ id: { in: Array.from(idCandidates) } });
        }
        if (codeCandidates.size) {
            inventoryConditions.push({ code: { in: Array.from(codeCandidates) } });
        }
        if (nameCandidates.size) {
            inventoryConditions.push({ name: { in: Array.from(nameCandidates) } });
        }
        let inventoryRecords = [];
        if (inventoryConditions.length) {
            inventoryRecords = await prisma_1.prisma.inventoryItem.findMany({
                where: { OR: inventoryConditions },
                select: { id: true, code: true, name: true, quantity: true },
            });
        }
        const inventoryById = new Map();
        const inventoryByCode = new Map();
        const inventoryByName = new Map();
        for (const record of inventoryRecords) {
            inventoryById.set(record.id, record);
            if (record.code) {
                inventoryByCode.set(normalizeMatchKey(record.code), record);
            }
            if (record.name) {
                inventoryByName.set(normalizeMatchKey(record.name), record);
            }
        }
        for (const info of materialInfos) {
            let record;
            if (info.inventoryItemId) {
                record = inventoryById.get(info.inventoryItemId);
            }
            if (!record) {
                for (const code of info.codeCandidates) {
                    record = inventoryByCode.get(normalizeMatchKey(code));
                    if (record)
                        break;
                }
            }
            if (!record) {
                for (const nameCandidate of info.nameCandidates) {
                    record = inventoryByName.get(normalizeMatchKey(nameCandidate));
                    if (record)
                        break;
                }
            }
            if (!record) {
                const normalizedProducto = normalizeMatchKey(info.producto);
                record =
                    inventoryByName.get(normalizedProducto) ?? inventoryByCode.get(normalizedProducto);
            }
            if (record) {
                info.inventoryItemId = record.id;
                info.inventory = record;
            }
        }
        const missingInventory = materialInfos.filter(info => info.quantity > 0 && !info.inventory);
        if (missingInventory.length) {
            throw new HttpError(400, {
                message: 'Hay materiales de la cotizacion sin vinculo de inventario.',
                detalles: missingInventory.map(info => ({
                    itemId: info.itemId,
                    producto: info.producto,
                    referenciaMaterial: info.materialId ?? null,
                })),
            });
        }
        const adjustments = new Map();
        for (const info of materialInfos) {
            if (!info.inventory || info.quantity <= 0)
                continue;
            const existing = adjustments.get(info.inventory.id);
            if (existing) {
                existing.quantity += info.quantity;
            }
            else {
                adjustments.set(info.inventory.id, {
                    record: { ...info.inventory },
                    quantity: info.quantity,
                });
            }
        }
        if (!adjustments.size) {
            throw new HttpError(400, {
                message: 'No se pudo determinar la cantidad a descontar del inventario.',
            });
        }
        const insufficient = Array.from(adjustments.values()).filter(adj => adj.record.quantity < adj.quantity);
        if (insufficient.length) {
            throw new HttpError(409, {
                message: 'No hay stock suficiente para los materiales seleccionados.',
                detalles: insufficient.map(adj => ({
                    inventarioId: adj.record.id,
                    inventarioNombre: adj.record.name,
                    disponible: adj.record.quantity,
                    requerido: adj.quantity,
                })),
            });
        }
        const stockDespues = new Map();
        adjustments.forEach(adj => {
            stockDespues.set(adj.record.id, adj.record.quantity - adj.quantity);
        });
        const materialSummary = materialInfos.map(info => {
            const inventoryId = info.inventory?.id ?? null;
            const aggregated = inventoryId ? adjustments.get(inventoryId) : undefined;
            const stockAntes = aggregated?.record.quantity ?? info.inventory?.quantity ?? null;
            const stockRestante = inventoryId
                ? stockDespues.get(inventoryId) ?? null
                : null;
            return {
                itemId: info.itemId,
                producto: info.producto,
                cantidad: info.quantity,
                anchoCm: info.widthCm,
                materialId: info.materialId ?? null,
                inventarioId: inventoryId,
                inventarioCodigo: info.inventory?.code ?? null,
                inventarioNombre: info.inventory?.name ?? null,
                stockAntes,
                stockDespues: stockRestante,
            };
        });
        const metadataBase = normalizeMetadata(asignacion.cotizacion.metadata);
        if (dto.notas) {
            metadataBase.resultadoNotas = dto.notas;
        }
        metadataBase.materiales = materialSummary;
        const cotizacionUpdateData = {
            estado: estadoCotizacion ?? 'ENVIADA',
            metadata: metadataBase,
        };
        if (dto.totalFinal !== undefined) {
            cotizacionUpdateData.totalEstimado = toDecimal(dto.totalFinal) ?? null;
        }
        await prisma_1.prisma.$transaction(async (tx) => {
            for (const adjustment of adjustments.values()) {
                const result = await tx.inventoryItem.updateMany({
                    where: {
                        id: adjustment.record.id,
                        quantity: { gte: adjustment.quantity },
                    },
                    data: { quantity: { decrement: adjustment.quantity } },
                });
                if (!result.count) {
                    throw new HttpError(409, {
                        message: 'El stock disponible cambio mientras enviabas la cotizacion. Revisa el inventario e intentalo nuevamente.',
                        inventarioId: adjustment.record.id,
                    });
                }
            }
            await tx.asignacion.update({
                where: { id: asignacion.id },
                data: {
                    estado: 'RESUELTA',
                    resueltoEn: new Date(),
                },
            });
            await tx.cotizacion.update({
                where: { id },
                data: cotizacionUpdateData,
            });
        });
        return res.json({ ok: true, materiales: materialSummary });
    }
    catch (error) {
        if (error instanceof HttpError) {
            return res.status(error.status).json(error.payload);
        }
        console.error('Error resolviendo asignacion', error);
        res.status(500).json({ message: 'Error interno' });
    }
});
exports.default = router;
