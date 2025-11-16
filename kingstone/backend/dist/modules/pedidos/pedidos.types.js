"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCartSchema = exports.cartQuoteSchema = exports.cartQuoteItemSchema = exports.cartProductSchema = exports.createDesignerSchema = void 0;
const zod_1 = require("zod");
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
exports.createDesignerSchema = zod_1.z.object({
    materialId: zod_1.z.string().min(1),
    materialLabel: zod_1.z.string().min(1),
    materialWidthCm: zod_1.z.number().nonnegative(),
    usedHeight: zod_1.z.number().nonnegative(),
    totalPrice: zod_1.z.number().nonnegative(),
    note: zod_1.z.string().max(600).optional(),
    items: zod_1.z.array(itemSchema).min(1),
    placements: zod_1.z.array(placementSchema).optional()
});
exports.cartProductSchema = zod_1.z.object({
    id: zod_1.z.number().int().positive(),
    name: zod_1.z.string().min(1),
    price: zod_1.z.number().nonnegative(),
    quantity: zod_1.z.number().int().positive(),
    itemType: zod_1.z.string().max(120).optional(),
    color: zod_1.z.string().max(120).optional(),
    provider: zod_1.z.string().max(120).optional(),
    imageUrl: zod_1.z.string().url().optional().or(zod_1.z.literal('')).or(zod_1.z.null())
}).transform(item => ({
    ...item,
    imageUrl: item.imageUrl === '' ? null : item.imageUrl
}));
exports.cartQuoteItemSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    quantity: zod_1.z.number().int().positive(),
    widthCm: zod_1.z.number().nonnegative(),
    heightCm: zod_1.z.number().nonnegative()
});
exports.cartQuoteSchema = zod_1.z.object({
    materialId: zod_1.z.string().min(1),
    materialLabel: zod_1.z.string().min(1),
    totalPrice: zod_1.z.number().nonnegative(),
    usedHeight: zod_1.z.number().nonnegative(),
    note: zod_1.z.string().max(600).optional(),
    items: zod_1.z.array(exports.cartQuoteItemSchema).default([]),
    createdAt: zod_1.z.string().optional()
});
exports.createCartSchema = zod_1.z.object({
    source: zod_1.z.literal('cart'),
    products: zod_1.z.array(exports.cartProductSchema).default([]),
    quote: exports.cartQuoteSchema.optional().nullable(),
    note: zod_1.z.string().max(600).optional()
}).superRefine((data, ctx) => {
    const productsCount = data.products?.length ?? 0;
    const quoteItems = data.quote?.items?.length ?? 0;
    if (!productsCount && !quoteItems) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: 'Debes incluir al menos un producto o una cotizacion.'
        });
    }
});
