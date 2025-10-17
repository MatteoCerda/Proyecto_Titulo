"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminGuard = adminGuard;
function adminGuard(req, res, next) {
    const user = req.user;
    if (!user || (user.role !== 'admin' && user.role !== 'ADMIN')) {
        return res.status(403).json({ message: 'Requiere rol administrador' });
    }
    next();
}
