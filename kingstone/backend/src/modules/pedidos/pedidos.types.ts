import { z } from 'zod';

const itemSchema = z.object({
  displayName: z.string().min(1),
  quantity: z.number().int().min(1),
  widthCm: z.number().nonnegative(),
  heightCm: z.number().nonnegative(),
  sizeMode: z.string().optional(),
  previewUrl: z.string().optional().or(z.null()).optional(),
  coverageRatio: z.number().min(0).max(1).optional(),
  outlinePath: z.string().max(20000).optional().or(z.null()).optional(),
  pixelArea: z.number().nonnegative().optional(),
  trimmedWidthPx: z.number().nonnegative().optional(),
  trimmedHeightPx: z.number().nonnegative().optional()
});

const placementSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  previewUrl: z.string().optional().or(z.null()).optional(),
  clipPath: z.string().optional().or(z.null()).optional(),
  rotation: z.number().optional(),
  designWidth: z.number().nonnegative().optional(),
  designHeight: z.number().nonnegative().optional(),
  margin: z.number().nonnegative().optional(),
  itemId: z.number().int().optional(),
  copyIndex: z.number().int().optional()
});

export const createDesignerSchema = z.object({
  materialId: z.string().min(1),
  materialLabel: z.string().min(1),
  materialWidthCm: z.number().nonnegative(),
  usedHeight: z.number().nonnegative(),
  totalPrice: z.number().nonnegative(),
  note: z.string().max(600).optional(),
  items: z.array(itemSchema).min(1),
  placements: z.array(placementSchema).optional()
});

export const cartProductSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  price: z.number().nonnegative(),
  quantity: z.number().int().positive(),
  itemType: z.string().max(120).optional(),
  color: z.string().max(120).optional(),
  provider: z.string().max(120).optional(),
  imageUrl: z.string().url().optional().or(z.literal('')).or(z.null())
}).transform(item => ({
  ...item,
  imageUrl: item.imageUrl === '' ? null : item.imageUrl
}));

export const cartQuoteItemSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().int().positive(),
  widthCm: z.number().nonnegative(),
  heightCm: z.number().nonnegative()
});

export const cartQuoteSchema = z.object({
  materialId: z.string().min(1),
  materialLabel: z.string().min(1),
  totalPrice: z.number().nonnegative(),
  usedHeight: z.number().nonnegative(),
  note: z.string().max(600).optional(),
  items: z.array(cartQuoteItemSchema).default([]),
  createdAt: z.string().optional()
});

export const createCartSchema = z.object({
  source: z.literal('cart'),
  products: z.array(cartProductSchema).default([]),
  quote: cartQuoteSchema.optional().nullable(),
  note: z.string().max(600).optional()
}).superRefine((data, ctx) => {
  const productsCount = data.products?.length ?? 0;
  const quoteItems = data.quote?.items?.length ?? 0;
  if (!productsCount && !quoteItems) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Debes incluir al menos un producto o una cotizacion.'
    });
  }
});

export type DesignerCreate = z.infer<typeof createDesignerSchema>;
export type CartProduct = z.infer<typeof cartProductSchema>;
export type CartQuoteItem = z.infer<typeof cartQuoteItemSchema>;
export type CartQuote = z.infer<typeof cartQuoteSchema>;
export type CartCreate = z.infer<typeof createCartSchema>;

export type PedidoPayload = CartCreate | DesignerCreate;
