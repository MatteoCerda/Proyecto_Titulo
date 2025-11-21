import type { Prisma, PrismaClient } from '@prisma/client';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import fs from 'fs';
import { prisma } from '../../lib/prisma';

type DbClient = Prisma.TransactionClient | PrismaClient;

const BRAND_KEYWORDS: Array<{ keyword: string; label: string }> = [
  { keyword: 'nike', label: 'Nike' },
  { keyword: 'adidas', label: 'Adidas' },
  { keyword: 'puma', label: 'Puma' },
  { keyword: 'gucci', label: 'Gucci' },
  { keyword: 'north face', label: 'The North Face' },
  { keyword: 'the north face', label: 'The North Face' }
];

let cachedVisionClient: ImageAnnotatorClient | null | false = null;

function getVisionClient(): ImageAnnotatorClient | null {
  if (cachedVisionClient === false) {
    return null;
  }
  if (cachedVisionClient) {
    return cachedVisionClient;
  }
  try {
    if (process.env.GOOGLE_VISION_CREDENTIALS) {
      const credentials = JSON.parse(process.env.GOOGLE_VISION_CREDENTIALS);
      cachedVisionClient = new ImageAnnotatorClient({ credentials });
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      if (fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
        cachedVisionClient = new ImageAnnotatorClient();
      } else {
        console.warn('[copyright] GOOGLE_APPLICATION_CREDENTIALS no encontrado en el sistema de archivos.');
        cachedVisionClient = null;
      }
    } else {
      cachedVisionClient = null;
    }
  } catch (error) {
    console.warn('[copyright] No se pudo inicializar Google Vision:', error);
    cachedVisionClient = false;
    return null;
  }
  return cachedVisionClient || null;
}

function extractBrandsFromText(text: string | undefined | null): string[] {
  if (!text) return [];
  const lowered = text.toLowerCase();
  const matches = new Set<string>();
  for (const { keyword, label } of BRAND_KEYWORDS) {
    if (lowered.includes(keyword)) {
      matches.add(label);
    }
  }
  return Array.from(matches);
}

function parsePayloadObject(payload: unknown): Record<string, any> {
  if (!payload) return {};
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload) || {};
    } catch {
      return {};
    }
  }
  if (typeof payload === 'object') {
    return { ...(payload as Record<string, any>) };
  }
  return {};
}

export async function detectBrandsFromFile(params: {
  filePath: string;
  originalName?: string | null;
}): Promise<string[]> {
  const matches = new Set<string>();
  extractBrandsFromText(params.originalName).forEach(match => matches.add(match));

  const client = getVisionClient();
  if (client) {
    try {
      const [result] = await client.logoDetection(params.filePath);
      const annotations = result.logoAnnotations ?? [];
      console.log('[copyright] logos detectados', {
        file: params.originalName ?? params.filePath,
        brands: annotations.map(a => a.description)
      });
      for (const annotation of annotations) {
        const normalized = annotation.description?.trim();
        if (!normalized) continue;
        const textMatches = extractBrandsFromText(normalized);
        if (textMatches.length) {
          textMatches.forEach(match => matches.add(match));
        } else {
          matches.add(normalized);
        }
      }
    } catch (error) {
      console.warn('[copyright] Vision fallo detectando marcas:', error);
    }
  }

  return Array.from(matches);
}

export async function appendCopyrightBrandsToPedido(
  pedidoId: number,
  brands: string[],
  client: DbClient = prisma
) {
  if (!pedidoId || !brands.length) return;
  const pedido = await client.pedido.findUnique({
    where: { id: pedidoId },
    select: { payload: true }
  });
  if (!pedido) return;

  const payloadObj = parsePayloadObject(pedido.payload);
  const existing = Array.isArray(payloadObj?.copyright?.brands)
    ? new Set<string>(payloadObj.copyright.brands)
    : new Set<string>();

  for (const brand of brands) {
    existing.add(brand);
  }
  if (!existing.size) {
    return;
  }

  payloadObj.copyright = {
    ...(payloadObj.copyright ?? {}),
    hasFlag: true,
    brands: Array.from(existing),
    updatedAt: new Date().toISOString()
  };

  await client.pedido.update({
    where: { id: pedidoId },
    data: {
      payload: payloadObj
    }
  });
}

export function detectBrandsLocallyFromName(filename: string | undefined | null): string | null {
  const matches = extractBrandsFromText(filename);
  return matches.length ? matches[0] : null;
}
