"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const auth_routes_1 = __importDefault(require("./modules/auth/auth.routes"));
const authGuard_1 = require("./modules/common/middlewares/authGuard");
const admin_routes_1 = __importDefault(require("./modules/admin/admin.routes"));
const adminGuard_1 = require("./modules/common/middlewares/adminGuard");
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const app = (0, express_1.default)();
const prisma = new client_1.PrismaClient();
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({ origin: true, credentials: true }));
app.use(express_1.default.json({ limit: '8mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '8mb' }));
app.get('/health', (_req, res) => res.json({ ok: true }));
// Auth (register/login)
app.use('/auth', auth_routes_1.default);
// Perfil del usuario autenticado
app.get('/me', authGuard_1.authGuard, async (req, res) => {
    try {
        const id = Number(req.user?.sub);
        if (!id)
            return res.status(401).json({ message: 'No autorizado' });
        const user = await prisma.user.findUnique({
            where: { id },
            select: { id: true, email: true, fullName: true, role: true }
        });
        if (!user)
            return res.status(404).json({ message: 'Usuario no encontrado' });
        res.json({ user });
    }
    catch (e) {
        res.status(500).json({ message: 'Error interno' });
    }
});
app.put('/me', authGuard_1.authGuard, async (req, res) => {
    try {
        const id = Number(req.user?.sub);
        const { fullName } = req.body || {};
        if (!id)
            return res.status(401).json({ message: 'No autorizado' });
        if (!fullName || typeof fullName !== 'string' || !fullName.trim()) {
            return res.status(400).json({ message: 'Nombre inválido' });
        }
        const user = await prisma.user.update({
            where: { id },
            data: { fullName: fullName.trim() },
            select: { id: true, email: true, fullName: true, role: true }
        });
        res.json({ user });
    }
    catch (e) {
        if (e?.code === 'P2025')
            return res.status(404).json({ message: 'Usuario no encontrado' });
        res.status(500).json({ message: 'Error interno' });
    }
});
// Actualizar contraseña del usuario autenticado
app.put('/me/password', authGuard_1.authGuard, async (req, res) => {
    try {
        const id = Number(req.user?.sub);
        const { currentPassword, newPassword } = req.body || {};
        if (!id)
            return res.status(401).json({ message: 'No autorizado' });
        if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
            return res.status(400).json({ message: 'Contraseña inválida (mínimo 6 caracteres)' });
        }
        const user = await prisma.user.findUnique({ where: { id } });
        if (!user)
            return res.status(404).json({ message: 'Usuario no encontrado' });
        const ok = await bcryptjs_1.default.compare(currentPassword || '', user.passwordHash);
        if (!ok)
            return res.status(400).json({ message: 'Contraseña actual incorrecta' });
        const passwordHash = await bcryptjs_1.default.hash(newPassword, 10);
        await prisma.user.update({ where: { id }, data: { passwordHash } });
        res.json({ ok: true });
    }
    catch (e) {
        res.status(500).json({ message: 'Error interno' });
    }
});
// Perfil de cliente: obtener
app.get('/me/profile', authGuard_1.authGuard, async (req, res) => {
    try {
        const id = Number(req.user?.sub);
        if (!id)
            return res.status(401).json({ message: 'No autorizado' });
        const profile = await prisma.cliente.findUnique({
            where: { id_usuario: id },
            select: { id_cliente: true, rut: true, nombre_contacto: true, email: true, telefono: true, direccion: true, comuna: true, ciudad: true, id_usuario: true, creado_en: true }
        });
        res.json({ profile });
    }
    catch (e) {
        res.status(500).json({ message: 'Error interno' });
    }
});
// Perfil de cliente: crear/actualizar
app.put('/me/profile', authGuard_1.authGuard, async (req, res) => {
    try {
        const id = Number(req.user?.sub);
        if (!id)
            return res.status(401).json({ message: 'No autorizado' });
        const { rut, nombre_contacto, telefono, direccion, comuna, ciudad } = req.body || {};
        const user = await prisma.user.findUnique({ where: { id } });
        if (!user)
            return res.status(404).json({ message: 'Usuario no encontrado' });
        const profile = await prisma.cliente.upsert({
            where: { id_usuario: id },
            create: { id_usuario: id, email: user.email, rut: rut || null, nombre_contacto: nombre_contacto || user.fullName || null, telefono: telefono || null, direccion: direccion || null, comuna: comuna || null, ciudad: ciudad || null },
            update: { rut: rut || null, nombre_contacto: (nombre_contacto ?? undefined), telefono: telefono ?? null, direccion: direccion ?? null, comuna: comuna ?? null, ciudad: ciudad ?? null },
            select: { id_cliente: true, rut: true, nombre_contacto: true, email: true, telefono: true, direccion: true, comuna: true, ciudad: true, id_usuario: true, creado_en: true }
        });
        res.json({ profile });
    }
    catch (e) {
        res.status(500).json({ message: 'Error interno' });
    }
});
exports.default = app;
// Admin endpoints
app.use('/admin', authGuard_1.authGuard, adminGuard_1.adminGuard, admin_routes_1.default);
