"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTransactionForPedido = createTransactionForPedido;
exports.commitTransactionForToken = commitTransactionForToken;
exports.getTransactionStatusForToken = getTransactionStatusForToken;
const transbank_1 = require("../../lib/transbank");
const prisma_1 = require("../../lib/prisma");
const pedidos_service_1 = require("../pedidos/pedidos.service");
const WEBPAY_CURRENCY = process.env.WEBPAY_CURRENCY || 'CLP';
const FRONT_RETURN_URL = process.env.WEBPAY_FRONT_RETURN_URL ||
    process.env.WEBPAY_RETURN_URL ||
    (process.env.PANEL_BASE_URL ? `${process.env.PANEL_BASE_URL.replace(/\/$/, '')}/pagos/webpay/retorno` : 'http://localhost:8100/pagos/webpay/retorno');
const API_BASE_URL = process.env.API_BASE_URL ||
    process.env.API_PUBLIC_URL ||
    `http://localhost:${process.env.PORT ?? 3000}`;
const WEBPAY_CALLBACK_URL = process.env.WEBPAY_CALLBACK_URL ||
    FRONT_RETURN_URL ||
    `${API_BASE_URL.replace(/\/$/, '')}/pagos/webpay/retorno`;
function resolveSessionId(user) {
    if (user?.sub)
        return `user-${user.sub}`;
    if (user?.email)
        return `email-${user.email}`;
    return `session-${Date.now()}`;
}
async function createTransactionForPedido(input) {
    const pedido = await prisma_1.prisma.pedido.findUnique({
        where: { id: input.pedidoId },
        select: {
            id: true,
            total: true,
            subtotal: true,
            moneda: true,
            estado: true,
            userId: true,
            clienteEmail: true,
            notificado: true,
        },
    });
    if (!pedido) {
        throw Object.assign(new Error('PEDIDO_NOT_FOUND'), { code: 'PEDIDO_NOT_FOUND' });
    }
    const hasAccess = (0, pedidos_service_1.canAccessPedido)(input.user, {
        userId: pedido.userId ?? null,
        clienteEmail: pedido.clienteEmail ?? null,
    });
    if (!hasAccess) {
        throw Object.assign(new Error('NOT_ALLOWED'), { code: 'NOT_ALLOWED' });
    }
    const amountCandidates = [
        typeof input.amountOverride === 'number' ? input.amountOverride : null,
        typeof pedido.total === 'number' ? pedido.total : null,
        typeof pedido.subtotal === 'number' ? pedido.subtotal : null,
    ].filter((value) => typeof value === 'number' && value > 0);
    if (!amountCandidates.length) {
        throw Object.assign(new Error('PEDIDO_SIN_MONTO'), { code: 'PEDIDO_SIN_MONTO' });
    }
    const amount = amountCandidates[0];
    const buyOrder = `PED-${pedido.id}-${Date.now()}`;
    const sessionId = resolveSessionId(input.user);
    const record = await prisma_1.prisma.webpayTransaction.create({
        data: {
            pedidoId: pedido.id,
            buyOrder,
            amount,
            currency: pedido.moneda || WEBPAY_CURRENCY,
            status: 'created',
            returnUrl: FRONT_RETURN_URL,
            sessionId,
        },
    });
    const response = await transbank_1.webpayTransaction.create(buyOrder, sessionId, amount, WEBPAY_CALLBACK_URL || FRONT_RETURN_URL);
    const token = response?.token ?? response?.token_ws ?? null;
    const url = response?.url ?? response?.url_webpay ?? null;
    await prisma_1.prisma.webpayTransaction.update({
        where: { id: record.id },
        data: {
            token,
            status: 'pending',
            lastResponse: response,
        },
    });
    return {
        pedidoId: pedido.id,
        buyOrder,
        amount,
        currency: pedido.moneda || WEBPAY_CURRENCY,
        token,
        url,
        returnUrl: FRONT_RETURN_URL,
        response,
    };
}
function getNextEstadoAfterPago(current) {
    if (!current)
        return null;
    const normalized = current.toUpperCase();
    if (normalized === 'POR_PAGAR' || normalized === 'EN_REVISION') {
        return 'EN_PRODUCCION';
    }
    return current;
}
async function commitTransactionForToken(input) {
    const tx = await prisma_1.prisma.webpayTransaction.findFirst({
        where: { token: input.token },
        include: {
            pedido: {
                select: {
                    id: true,
                    estado: true,
                    userId: true,
                    clienteEmail: true,
                },
            },
        },
    });
    if (!tx) {
        throw Object.assign(new Error('TRANSACTION_NOT_FOUND'), { code: 'TRANSACTION_NOT_FOUND' });
    }
    const canRead = (0, pedidos_service_1.canAccessPedido)(input.user, {
        userId: tx.pedido?.userId ?? null,
        clienteEmail: tx.pedido?.clienteEmail ?? null,
    });
    if (!canRead && !(0, pedidos_service_1.isOperator)(input.user?.role)) {
        throw Object.assign(new Error('NOT_ALLOWED'), { code: 'NOT_ALLOWED' });
    }
    const response = await transbank_1.webpayTransaction.commit(input.token);
    const authorized = response?.status === 'AUTHORIZED' || Number(response?.response_code) === 0;
    const newEstado = authorized ? getNextEstadoAfterPago(tx.pedido?.estado) : null;
    await prisma_1.prisma.webpayTransaction.update({
        where: { id: tx.id },
        data: {
            status: authorized ? 'authorized' : 'failed',
            authorizationCode: response?.authorization_code ?? null,
            paymentTypeCode: response?.payment_type_code ?? null,
            installmentsNumber: typeof response?.installments_number === 'number'
                ? response.installments_number
                : null,
            installmentsAmount: typeof response?.installments_amount === 'number'
                ? Math.round(response.installments_amount)
                : null,
            cardNumber: response?.card_detail?.card_number ?? null,
            accountingDate: response?.accounting_date ?? null,
            transactionDate: response?.transaction_date
                ? new Date(response.transaction_date)
                : new Date(),
            balance: typeof response?.balance === 'number' ? Math.round(response.balance) : null,
            lastResponse: response ?? null,
        },
    });
    if (authorized && tx.pedido) {
        await prisma_1.prisma.pedido.update({
            where: { id: tx.pedidoId },
            data: {
                estado: newEstado ?? tx.pedido.estado,
                notificado: true,
            },
        });
    }
    return {
        authorized,
        response,
        pedidoId: tx.pedidoId,
    };
}
async function getTransactionStatusForToken(input) {
    const tx = await prisma_1.prisma.webpayTransaction.findFirst({
        where: { token: input.token },
        include: {
            pedido: {
                select: { id: true, userId: true, clienteEmail: true },
            },
        },
    });
    if (!tx) {
        throw Object.assign(new Error('TRANSACTION_NOT_FOUND'), { code: 'TRANSACTION_NOT_FOUND' });
    }
    const allowed = (0, pedidos_service_1.canAccessPedido)(input.user, {
        userId: tx.pedido?.userId ?? null,
        clienteEmail: tx.pedido?.clienteEmail ?? null,
    });
    if (!allowed && !(0, pedidos_service_1.isOperator)(input.user?.role)) {
        throw Object.assign(new Error('NOT_ALLOWED'), { code: 'NOT_ALLOWED' });
    }
    const response = await transbank_1.webpayTransaction.status(input.token);
    return { response, pedidoId: tx.pedidoId, status: response?.status ?? tx.status };
}
