"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CURRENCY = exports.TAX_RATE = void 0;
exports.calculateTaxBreakdown = calculateTaxBreakdown;
const DEFAULT_RATE = Number.isFinite(Number(process.env.IVA_RATE))
    ? Number(process.env.IVA_RATE)
    : 0.19;
exports.TAX_RATE = DEFAULT_RATE;
exports.DEFAULT_CURRENCY = (process.env.CURRENCY_CODE || 'CLP').toUpperCase();
function calculateTaxBreakdown(total, rate = exports.TAX_RATE) {
    const safeTotal = Math.round(total || 0);
    const safeRate = typeof rate === 'number' && rate > 0 ? rate : 0;
    if (safeTotal <= 0 || safeRate <= 0) {
        return {
            subtotal: safeTotal,
            tax: 0,
            total: safeTotal
        };
    }
    const subtotal = Math.round(safeTotal / (1 + safeRate));
    const tax = safeTotal - subtotal;
    return {
        subtotal,
        tax,
        total: safeTotal
    };
}
