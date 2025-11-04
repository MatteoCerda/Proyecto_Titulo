"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.register = register;
exports.login = login;
exports.forgotPassword = forgotPassword;
exports.resetPassword = resetPassword;
const prisma_1 = require("../../lib/prisma");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const rut_1 = require("../common/rut");
const claim_1 = require("../common/claim");
const allowedRoles = ['user', 'admin', 'operator'];
function normalizeRole(role) {
    if (!role)
        return null;
    const normalized = role.toLowerCase();
    return allowedRoles.find(r => r === normalized) ?? null;
}
async function register(dto, options) {
    const exists = await prisma_1.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists)
        throw new Error('EMAIL_IN_USE');
    const passwordHash = await bcryptjs_1.default.hash(dto.password, 10);
    const role = options?.defaultRole ?? 'user';
    const rutInfo = (0, rut_1.normalizeRut)(dto.rut);
    const normalizedRutDisplay = rutInfo?.normalized ?? dto.rut ?? null;
    const rutCompact = rutInfo?.compact ?? null;
    const user = await prisma_1.prisma.user.create({
        data: { email: dto.email, passwordHash, fullName: dto.fullName, role }
    });
    // Si vienen datos de perfil o RUT, sincronizamos con tabla cliente
    const hasProfile = normalizedRutDisplay ||
        dto.nombre_contacto ||
        dto.telefono ||
        dto.direccion ||
        dto.comuna ||
        dto.ciudad;
    if (hasProfile) {
        try {
            const existingCliente = rutCompact
                ? await prisma_1.prisma.cliente.findFirst({
                    where: { rutNormalizado: rutCompact }
                })
                : null;
            if (existingCliente) {
                if (existingCliente.id_usuario && existingCliente.id_usuario !== user.id) {
                    throw Object.assign(new Error('CLIENT_ALREADY_LINKED'), { code: 'CLIENT_ALREADY_LINKED' });
                }
                if (existingCliente.estado === 'pending_claim') {
                    if (!dto.claimCode) {
                        throw Object.assign(new Error('CLAIM_CODE_REQUIRED'), { code: 'CLAIM_CODE_REQUIRED' });
                    }
                    const notExpired = !existingCliente.claimExpiresAt ||
                        new Date(existingCliente.claimExpiresAt).getTime() >= Date.now();
                    const validCode = notExpired && (0, claim_1.verifyClaimCode)(dto.claimCode, existingCliente.claimCodeHash);
                    if (!validCode) {
                        throw Object.assign(new Error('CLAIM_CODE_INVALID'), { code: 'CLAIM_CODE_INVALID' });
                    }
                }
                await prisma_1.prisma.cliente.update({
                    where: { id_cliente: existingCliente.id_cliente },
                    data: {
                        id_usuario: user.id,
                        estado: 'active',
                        claimCodeHash: null,
                        claimExpiresAt: null,
                        claimIssuedAt: null,
                        rut: normalizedRutDisplay,
                        rutNormalizado: rutCompact,
                        nombre_contacto: dto.nombre_contacto || dto.fullName || existingCliente.nombre_contacto,
                        email: dto.email,
                        telefono: dto.telefono || existingCliente.telefono,
                        direccion: dto.direccion || existingCliente.direccion,
                        comuna: dto.comuna || existingCliente.comuna,
                        ciudad: dto.ciudad || existingCliente.ciudad
                    }
                });
                await prisma_1.prisma.pedido.updateMany({
                    where: { clienteId: existingCliente.id_cliente },
                    data: { userId: user.id, clienteEmail: dto.email, clienteNombre: dto.fullName }
                });
            }
            else {
                await prisma_1.prisma.cliente.create({
                    data: {
                        id_usuario: user.id,
                        rut: normalizedRutDisplay,
                        rutNormalizado: rutCompact,
                        nombre_contacto: dto.nombre_contacto || dto.fullName || null,
                        email: dto.email,
                        telefono: dto.telefono || null,
                        direccion: dto.direccion || null,
                        comuna: dto.comuna || null,
                        ciudad: dto.ciudad || null,
                        estado: 'active',
                        tipoRegistro: dto.canalRegistro || 'web'
                    }
                });
            }
        }
        catch (e) {
            if (e && typeof e === 'object' && e.code === 'CLAIM_CODE_REQUIRED') {
                throw e;
            }
            if (e && typeof e === 'object' && e.code === 'CLAIM_CODE_INVALID') {
                throw e;
            }
            if (e && typeof e === 'object' && e.code === 'CLIENT_ALREADY_LINKED') {
                throw e;
            }
            // No interrumpimos el registro si falla el perfil
            console.warn('No se pudo crear/actualizar perfil cliente:', e);
        }
    }
    return { id: user.id, email: user.email, fullName: user.fullName, role: user.role };
}
async function login(dto, options) {
    const user = await prisma_1.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user)
        throw new Error('INVALID_CREDENTIALS');
    const ok = await bcryptjs_1.default.compare(dto.password, user.passwordHash);
    if (!ok)
        throw new Error('INVALID_CREDENTIALS');
    if (options?.allowedRoles && options.allowedRoles.length) {
        const currentRole = normalizeRole(user.role) ?? 'user';
        const allowed = options.allowedRoles.map(r => normalizeRole(r)).filter(Boolean);
        if (!allowed.includes(currentRole)) {
            throw Object.assign(new Error('ROLE_NOT_ALLOWED'), {
                code: 'ROLE_NOT_ALLOWED',
                role: user.role
            });
        }
    }
    const payload = { sub: user.id, email: user.email, role: user.role };
    const opts = { expiresIn: process.env.JWT_EXPIRES_IN || '1d' };
    const secret = process.env.JWT_SECRET;
    const token = jsonwebtoken_1.default.sign(payload, secret, opts);
    return { token, user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role } };
}
async function forgotPassword(email) {
    const user = await prisma_1.prisma.user.findUnique({ where: { email } });
    // Siempre respondemos ok para no filtrar emails
    if (!user)
        return { ok: true };
    const token = crypto_1.default.randomBytes(32).toString('hex');
    const tokenHash = crypto_1.default.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30); // 30 min
    await prisma_1.prisma.passwordReset.create({ data: { userId: user.id, tokenHash, expiresAt } });
    // Enviar email: aquí integrar proveedor. Por ahora devolvemos ok.
    // Para facilitar pruebas, devolvemos el token en dev solamente
    const isDev = process.env.NODE_ENV !== 'production';
    return isDev ? { ok: true, token } : { ok: true };
}
async function resetPassword(token, newPassword) {
    const tokenHash = crypto_1.default.createHash('sha256').update(token).digest('hex');
    const rec = await prisma_1.prisma.passwordReset.findFirst({ where: { tokenHash, usedAt: null }, include: { user: true } });
    if (!rec)
        throw new Error('TOKEN_INVALID');
    if (rec.expiresAt.getTime() < Date.now())
        throw new Error('TOKEN_EXPIRED');
    const passwordHash = await bcryptjs_1.default.hash(newPassword, 10);
    await prisma_1.prisma.$transaction([
        prisma_1.prisma.user.update({ where: { id: rec.userId }, data: { passwordHash } }),
        prisma_1.prisma.passwordReset.update({ where: { id: rec.id }, data: { usedAt: new Date() } })
    ]);
    return { ok: true };
}
