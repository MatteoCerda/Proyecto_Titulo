"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeRut = normalizeRut;
exports.formatRut = formatRut;
exports.validateRut = validateRut;
function normalizeRut(raw) {
    if (!raw || typeof raw !== 'string') {
        return null;
    }
    const cleaned = raw.replace(/[^0-9kK]/g, '').toUpperCase();
    if (!/^\d{2,8}[0-9K]$/.test(cleaned)) {
        return null;
    }
    const body = cleaned.slice(0, -1);
    const dv = cleaned.slice(-1);
    if (!validateRut(body, dv)) {
        return null;
    }
    return {
        body,
        dv,
        normalized: formatRut(body, dv),
        compact: `${body}${dv}`
    };
}
function formatRut(body, dv) {
    const reversed = body.split('').reverse();
    const groups = [];
    for (let i = 0; i < reversed.length; i += 3) {
        groups.push(reversed.slice(i, i + 3).reverse().join(''));
    }
    const formattedBody = groups.reverse().join('.');
    return `${formattedBody}-${dv}`;
}
function validateRut(body, dv) {
    if (!body || !dv) {
        return false;
    }
    let sum = 0;
    let multiplier = 2;
    for (let i = body.length - 1; i >= 0; i--) {
        sum += parseInt(body[i], 10) * multiplier;
        multiplier = multiplier === 7 ? 2 : multiplier + 1;
    }
    const expected = 11 - (sum % 11);
    let dvCalc;
    if (expected === 11)
        dvCalc = '0';
    else if (expected === 10)
        dvCalc = 'K';
    else
        dvCalc = expected.toString();
    return dvCalc === dv.toUpperCase();
}
