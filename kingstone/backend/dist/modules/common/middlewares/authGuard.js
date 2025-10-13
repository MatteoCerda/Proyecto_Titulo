"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authGuard = authGuard;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
function authGuard(req, res, next) {
    const header = req.headers.authorization; // "Bearer <token>"
    if (!header)
        return res.status(401).json({ message: 'No autorizado' });
    const [, token] = header.split(' ');
    try {
        const payload = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
        req.user = payload;
        next();
    }
    catch {
        return res.status(401).json({ message: 'Token inválido/expirado' });
    }
}
