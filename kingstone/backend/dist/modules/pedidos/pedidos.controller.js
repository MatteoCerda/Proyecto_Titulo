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
exports.getPedidos = exports.createPedido = void 0;
const pedidosService = __importStar(require("./pedidos.service"));
const pedidos_types_1 = require("./pedidos.types");
const createPedido = async (req, res) => {
    try {
        const isCartSource = typeof req.body?.source === 'string' && req.body.source === 'cart';
        const parsed = isCartSource ? pedidos_types_1.createCartSchema.safeParse(req.body) : pedidos_types_1.createDesignerSchema.safeParse(req.body);
        if (!parsed.success) {
            const issue = parsed.error.issues?.[0];
            return res.status(400).json({
                message: issue?.message || 'Solicitud invalida',
                issues: parsed.error.issues
            });
        }
        const dto = parsed.data;
        const user = req.user;
        let pedidoId;
        if (isCartSource) {
            pedidoId = await pedidosService.handleCartOrder(dto, user);
        }
        else {
            pedidoId = await pedidosService.handleDesignerOrder(dto, user);
        }
        res.status(201).json({ id: pedidoId });
    }
    catch (error) {
        if (error?.code === 'INSUFFICIENT_STOCK') {
            return res.status(409).json({
                message: 'No hay stock suficiente para completar el pedido.',
                detalles: error?.details || null
            });
        }
        console.error('Error creando pedido', error);
        res.status(500).json({ message: 'Error interno' });
    }
};
exports.createPedido = createPedido;
const getPedidos = async (req, res) => {
    try {
        const user = req.user;
        const isOp = pedidosService.isOperator(user?.role);
        let pedidos;
        if (isOp) {
            const statusRaw = req.query.status?.trim();
            const status = statusRaw && statusRaw.length ? statusRaw.toUpperCase() : 'PENDIENTE';
            pedidos = await pedidosService.getPedidosByStatus(status);
        }
        else {
            const userId = user?.sub ? Number(user.sub) : null;
            const email = user?.email ?? null;
            const statusRaw = req.query.status?.trim();
            const status = statusRaw && statusRaw.length ? statusRaw.toUpperCase() : undefined;
            pedidos = await pedidosService.getPedidosByClient(userId, email, status);
        }
        res.json(pedidos);
    }
    catch (error) {
        console.error('Error listando pedidos', error);
        res.status(500).json({ message: 'Error interno' });
    }
};
exports.getPedidos = getPedidos;
