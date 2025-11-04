"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateClaimCode = generateClaimCode;
exports.hashClaimCode = hashClaimCode;
exports.verifyClaimCode = verifyClaimCode;
const crypto_1 = __importDefault(require("crypto"));
function generateClaimCode(length = 6) {
    const digits = '0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        const idx = crypto_1.default.randomInt(0, digits.length);
        result += digits[idx];
    }
    return result;
}
function hashClaimCode(code) {
    return crypto_1.default.createHash('sha256').update(code).digest('hex');
}
function verifyClaimCode(code, hash) {
    if (!code || !hash) {
        return false;
    }
    return hashClaimCode(code) === hash;
}
