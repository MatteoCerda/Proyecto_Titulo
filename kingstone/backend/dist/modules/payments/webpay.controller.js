"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTransaction = createTransaction;
exports.commitTransaction = commitTransaction;
exports.getTransactionStatus = getTransactionStatus;
exports.webpayReturnBridge = webpayReturnBridge;
const zod_1 = require("zod");
const webpayService = __importStar(require("./webpay.service"));
const numericTransformer = (value) => {
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        return Number.isNaN(parsed) ? value : parsed;
    }
    return value;
};
const createTransactionSchema = zod_1.z.object({
    pedidoId: zod_1.z.preprocess(numericTransformer, zod_1.z.number().int().positive('pedidoId requerido')),
    amount: zod_1.z
        .preprocess(numericTransformer, zod_1.z.number().positive('amount debe ser mayor a 0'))
        .optional(),
});
const tokenSchema = zod_1.z
    .object({
    token: zod_1.z.string().optional(),
    token_ws: zod_1.z.string().optional(),
    TBK_TOKEN: zod_1.z.string().optional(),
})
    .refine(data => data.token || data.token_ws || data.TBK_TOKEN, {
    message: 'token requerido',
});
function pickToken(payload) {
    return payload.token || payload.token_ws || payload.TBK_TOKEN;
}
async function createTransaction(req, res) {
    try {
        const payload = createTransactionSchema.parse(req.body);
        const user = req.user;
        const response = await webpayService.createTransactionForPedido({
            pedidoId: payload.pedidoId,
            amountOverride: payload.amount ?? null,
            user,
        });
        return res.json(response);
    }
    catch (error) {
        if (error instanceof zod_1.ZodError) {
            return res.status(400).json({ message: 'Datos invalidos', errors: error.flatten() });
        }
        if (error?.code === 'PEDIDO_NOT_FOUND') {
            return res.status(404).json({ message: 'Pedido no encontrado' });
        }
        if (error?.code === 'NOT_ALLOWED') {
            return res.status(403).json({ message: 'No tienes permiso para este pedido' });
        }
        if (error?.code === 'PEDIDO_SIN_MONTO') {
            return res.status(422).json({ message: 'El pedido no tiene monto para cobrar' });
        }
        console.error('[webpay] error creando transaccion', error);
        return res.status(502).json({ message: 'Error creando transaccion con Webpay' });
    }
}
async function commitTransaction(req, res) {
    try {
        const payload = tokenSchema.parse(req.body ?? {});
        const token = pickToken(payload);
        const user = req.user;
        const result = await webpayService.commitTransactionForToken({ token, user });
        return res.json(result);
    }
    catch (error) {
        if (error instanceof zod_1.ZodError) {
            return res.status(400).json({ message: 'Datos invalidos', errors: error.flatten() });
        }
        if (error?.code === 'TRANSACTION_NOT_FOUND') {
            return res.status(404).json({ message: 'Transaccion no encontrada' });
        }
        if (error?.code === 'NOT_ALLOWED') {
            return res.status(403).json({ message: 'No tienes permiso para esta transaccion' });
        }
        console.error('[webpay] error confirmando transaccion', error);
        return res.status(502).json({ message: 'Error confirmando transaccion con Webpay' });
    }
}
async function getTransactionStatus(req, res) {
    try {
        const payload = tokenSchema.parse(req.body ?? {});
        const token = pickToken(payload);
        const user = req.user;
        const result = await webpayService.getTransactionStatusForToken({ token, user });
        return res.json(result);
    }
    catch (error) {
        if (error instanceof zod_1.ZodError) {
            return res.status(400).json({ message: 'Datos invalidos', errors: error.flatten() });
        }
        if (error?.code === 'TRANSACTION_NOT_FOUND') {
            return res.status(404).json({ message: 'Transaccion no encontrada' });
        }
        if (error?.code === 'NOT_ALLOWED') {
            return res.status(403).json({ message: 'No tienes permiso para esta transaccion' });
        }
        console.error('[webpay] error obteniendo estado de transaccion', error);
        return res.status(502).json({ message: 'Error consultando estado con Webpay' });
    }
}
const FRONT_RETURN_URL = process.env.WEBPAY_FRONT_RETURN_URL ||
    process.env.WEBPAY_RETURN_URL ||
    (process.env.PANEL_BASE_URL ? `${process.env.PANEL_BASE_URL.replace(/\/$/, '')}/pagos/webpay/retorno` : 'http://localhost:8100/pagos/webpay/retorno');
function webpayReturnBridge(req, res) {
    const tokenWs = req.body?.token_ws || req.query?.token_ws || req.body?.token || req.query?.token;
    const tbkToken = req.body?.TBK_TOKEN || req.query?.TBK_TOKEN || req.body?.tbk_token;
    if (!tokenWs && !tbkToken) {
        return res.status(400).send('token_ws no recibido');
    }
    try {
        const target = new URL(FRONT_RETURN_URL);
        if (tokenWs)
            target.searchParams.set('token_ws', tokenWs);
        if (tbkToken)
            target.searchParams.set('TBK_TOKEN', tbkToken);
        return res.redirect(target.toString());
    }
    catch (error) {
        console.error('[webpay] error redirigiendo a front', error);
        return res.status(500).send('No pudimos redirigir el pago');
    }
}
