"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOffers = exports.getCatalogItem = exports.getCatalog = void 0;
const prisma_1 = require("../../lib/prisma");
function resolveInventoryUnitPrice(record) {
    if (!record)
        return null;
    const candidates = [
        record.priceWeb,
        record.priceStore,
        record.priceWsp
    ];
    for (const candidate of candidates) {
        const value = typeof candidate === 'number' ? candidate : Number(candidate);
        if (!Number.isNaN(value) && value > 0) {
            return value;
        }
    }
    for (const candidate of candidates) {
        const value = typeof candidate === 'number' ? candidate : Number(candidate);
        if (!Number.isNaN(value)) {
            return value;
        }
    }
    return null;
}
const getCatalog = async (search, tipo) => {
    const where = { quantity: { gt: 0 } };
    if (search) {
        where.OR = [
            { name: { contains: search } },
            { itemType: { contains: search } },
            { color: { contains: search } },
            { provider: { contains: search } },
        ];
    }
    if (tipo) {
        where.itemType = { contains: tipo };
    }
    const items = await prisma_1.prisma.inventoryItem.findMany({
        where,
        orderBy: [
            { itemType: 'asc' },
            { name: 'asc' },
        ],
        select: {
            id: true,
            name: true,
            itemType: true,
            color: true,
            provider: true,
            quantity: true,
            priceWeb: true,
            priceStore: true,
            priceWsp: true,
            imageUrl: true,
        },
    });
    const catalogo = items.map(item => ({
        id: item.id,
        name: item.name,
        itemType: item.itemType,
        color: item.color,
        provider: item.provider,
        quantity: item.quantity,
        price: item.priceWeb,
        priceWeb: item.priceWeb,
        priceStore: item.priceStore,
        priceWsp: item.priceWsp,
        imageUrl: item.imageUrl ?? null,
    }));
    return catalogo;
};
exports.getCatalog = getCatalog;
const getCatalogItem = async (id) => {
    const item = await prisma_1.prisma.inventoryItem.findUnique({
        where: { id },
        select: {
            id: true,
            name: true,
            itemType: true,
            color: true,
            provider: true,
            quantity: true,
            priceWeb: true,
            priceStore: true,
            priceWsp: true,
            imageUrl: true,
            qrRaw: true,
        },
    });
    if (!item)
        throw new Error('Producto no encontrado');
    return {
        id: item.id,
        name: item.name,
        itemType: item.itemType,
        color: item.color,
        provider: item.provider,
        quantity: item.quantity,
        price: item.priceWeb,
        priceWeb: item.priceWeb,
        priceStore: item.priceStore,
        priceWsp: item.priceWsp,
        imageUrl: item.imageUrl ?? null,
        descripcion: item.qrRaw ?? null,
    };
};
exports.getCatalogItem = getCatalogItem;
const getOffers = async () => {
    const now = new Date();
    const offers = await prisma_1.prisma.oferta.findMany({
        where: {
            activo: true,
            OR: [
                { startAt: null },
                { startAt: { lte: now } },
            ],
            AND: [
                {
                    OR: [
                        { endAt: null },
                        { endAt: { gte: now } },
                    ],
                },
            ],
        },
        orderBy: [
            { prioridad: 'desc' },
            { createdAt: 'desc' },
        ],
        select: {
            id: true,
            titulo: true,
            descripcion: true,
            imageUrl: true,
            link: true,
            prioridad: true,
            startAt: true,
            endAt: true,
            itemId: true,
            precioOferta: true,
            inventario: {
                select: {
                    id: true,
                    code: true,
                    name: true,
                    priceWeb: true,
                    priceStore: true,
                    priceWsp: true,
                },
            },
        },
    });
    const normalized = offers.map(offer => {
        const basePrice = resolveInventoryUnitPrice(offer.inventario) ?? null;
        const offerPrice = offer.precioOferta && offer.precioOferta > 0 ? offer.precioOferta : null;
        const discountAmount = basePrice !== null && offerPrice !== null && basePrice > offerPrice
            ? basePrice - offerPrice
            : null;
        const discountPercent = discountAmount !== null && basePrice
            ? Math.round((discountAmount / basePrice) * 100)
            : null;
        return {
            id: offer.id,
            titulo: offer.titulo,
            descripcion: offer.descripcion,
            imageUrl: offer.imageUrl,
            link: offer.link,
            prioridad: offer.prioridad,
            startAt: offer.startAt,
            endAt: offer.endAt,
            itemId: offer.itemId ?? null,
            basePrice,
            offerPrice,
            precioOferta: offerPrice,
            discountAmount,
            discountPercent,
            inventario: offer.inventario
                ? {
                    id: offer.inventario.id,
                    code: offer.inventario.code,
                    name: offer.inventario.name,
                }
                : null,
        };
    });
    return normalized;
};
exports.getOffers = getOffers;
