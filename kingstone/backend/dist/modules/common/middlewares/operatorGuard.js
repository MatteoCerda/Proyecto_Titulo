"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.operatorGuard = operatorGuard;
function operatorGuard(req, res, next) {
    const role = req.user?.role;
    if (!role) {
        return res.status(403).json({ message: 'Requiere rol operador' });
    }
    const normalized = role.toString().toUpperCase();
    if (normalized !== 'OPERATOR' && normalized !== 'ADMIN') {
        return res.status(403).json({ message: 'Requiere rol operador' });
    }
    next();
}
