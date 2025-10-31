"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const prisma_1 = require("../lib/prisma");
const pedidos_routes_1 = require("../modules/pedidos/pedidos.routes");
const POLL_INTERVAL_MS = Number(process.env.FILE_JOB_POLL_INTERVAL_MS ?? 3000);
const MAX_BATCH = Number(process.env.FILE_JOB_BATCH_SIZE ?? 1);
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
async function takePendingJobs(limit) {
    const jobs = await prisma_1.prisma.fileProcessingJob.findMany({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        take: limit
    });
    const claimed = [];
    for (const job of jobs) {
        const updated = await prisma_1.prisma.fileProcessingJob.updateMany({
            where: { id: job.id, status: 'PENDING' },
            data: { status: 'PROCESSING', startedAt: new Date() }
        });
        if (updated.count) {
            claimed.push(job);
        }
    }
    return claimed;
}
function parseJobPayload(payload) {
    if (!payload || typeof payload !== 'object') {
        throw new Error('Payload invalido');
    }
    const value = payload;
    if (!Array.isArray(value.files) || !value.files.length) {
        throw new Error('Payload sin archivos');
    }
    return value;
}
async function processJob(jobId) {
    const job = await prisma_1.prisma.fileProcessingJob.findUnique({
        where: { id: jobId }
    });
    if (!job) {
        return;
    }
    const payload = parseJobPayload(job.payload);
    const pedido = await prisma_1.prisma.pedido.findUnique({
        where: { id: job.pedidoId },
        select: {
            id: true,
            materialId: true,
            materialLabel: true,
            payload: true
        }
    });
    if (!pedido) {
        throw new Error(`Pedido ${job.pedidoId} no encontrado`);
    }
    const effectiveMaterialId = (0, pedidos_routes_1.extractMaterialIdFromPedido)(pedido) ?? payload.materialId ?? null;
    const effectiveFallbackWidth = (0, pedidos_routes_1.extractMaterialWidthFromPedido)(pedido) ?? payload.fallbackWidth ?? null;
    const prepared = [];
    for (const file of payload.files) {
        if (!file.path) {
            throw new Error(`Archivo sin ruta en payload (${file.originalName})`);
        }
        const buffer = await fs_1.promises.readFile(file.path);
        const metrics = await (0, pedidos_routes_1.calculateAttachmentMetrics)({
            buffer,
            originalName: file.originalName,
            mimeType: file.mimeType
        }, effectiveMaterialId, effectiveFallbackWidth);
        prepared.push({ file, buffer, metrics });
    }
    await prisma_1.prisma.$transaction(async (tx) => {
        for (const entry of prepared) {
            await tx.pedidoAdjunto.create({
                data: {
                    pedidoId: job.pedidoId,
                    filename: entry.file.originalName,
                    mimeType: entry.file.mimeType,
                    sizeBytes: entry.file.sizeBytes,
                    widthCm: entry.metrics.widthCm,
                    heightCm: entry.metrics.heightCm,
                    areaCm2: entry.metrics.areaCm2,
                    lengthCm: entry.metrics.lengthCm,
                    data: (0, pedidos_routes_1.bufferToUint8Array)(entry.buffer)
                }
            });
        }
        await (0, pedidos_routes_1.recomputePedidoAggregates)(job.pedidoId, tx);
    });
    for (const entry of prepared) {
        await fs_1.promises.unlink(entry.file.path).catch(() => undefined);
    }
    await prisma_1.prisma.fileProcessingJob.update({
        where: { id: jobId },
        data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            lastError: null
        }
    });
}
async function handleJob(jobId) {
    try {
        await processJob(jobId);
        console.log(`[file-worker] Job ${jobId} completado`);
    }
    catch (error) {
        console.error(`[file-worker] Error procesando job ${jobId}`, error);
        await prisma_1.prisma.fileProcessingJob.update({
            where: { id: jobId },
            data: {
                status: 'FAILED',
                retryCount: { increment: 1 },
                lastError: error?.message?.slice(0, 500) ?? 'Error desconocido'
            }
        }).catch(err => {
            console.error(`[file-worker] Error guardando estado FAILED para job ${jobId}`, err);
        });
    }
}
async function mainLoop() {
    console.log('[file-worker] Iniciando worker de procesamiento de archivos...');
    while (true) {
        try {
            const jobs = await takePendingJobs(MAX_BATCH);
            if (!jobs.length) {
                await sleep(POLL_INTERVAL_MS);
                continue;
            }
            for (const job of jobs) {
                await handleJob(job.id);
            }
        }
        catch (error) {
            console.error('[file-worker] Error en loop principal', error);
            await sleep(POLL_INTERVAL_MS);
        }
    }
}
mainLoop().catch(error => {
    console.error('[file-worker] Worker finalizo con error', error);
    process.exit(1);
});
