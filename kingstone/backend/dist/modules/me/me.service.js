"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertClientProfile = exports.getClientProfile = exports.updateUserPassword = exports.updateUserProfile = exports.getUserProfile = void 0;
const prisma_1 = require("../../lib/prisma");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const rut_1 = require("../common/rut");
const getUserProfile = async (id) => {
    const user = await prisma_1.prisma.user.findUnique({
        where: { id },
        select: { id: true, email: true, fullName: true, role: true },
    });
    if (!user)
        throw new Error('Usuario no encontrado');
    return user;
};
exports.getUserProfile = getUserProfile;
const updateUserProfile = async (id, fullName) => {
    if (!fullName || typeof fullName !== 'string' || !fullName.trim()) {
        throw new Error('Nombre inválido');
    }
    try {
        const user = await prisma_1.prisma.user.update({
            where: { id },
            data: { fullName: fullName.trim() },
            select: { id: true, email: true, fullName: true, role: true },
        });
        return user;
    }
    catch (e) {
        if (e?.code === 'P2025')
            throw new Error('Usuario no encontrado');
        throw e;
    }
};
exports.updateUserProfile = updateUserProfile;
const updateUserPassword = async (id, currentPassword, newPassword) => {
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
        throw new Error('Contraseña inválida (mínimo 6 caracteres)');
    }
    const user = await prisma_1.prisma.user.findUnique({ where: { id } });
    if (!user)
        throw new Error('Usuario no encontrado');
    const ok = await bcryptjs_1.default.compare(currentPassword || '', user.passwordHash);
    if (!ok)
        throw new Error('Contraseña actual incorrecta');
    const passwordHash = await bcryptjs_1.default.hash(newPassword, 10);
    await prisma_1.prisma.user.update({ where: { id }, data: { passwordHash } });
};
exports.updateUserPassword = updateUserPassword;
const getClientProfile = async (id) => {
    const profile = await prisma_1.prisma.cliente.findUnique({
        where: { id_usuario: id },
        select: { id_cliente: true, rut: true, nombre_contacto: true, email: true, telefono: true, direccion: true, comuna: true, ciudad: true, id_usuario: true, creado_en: true },
    });
    return profile;
};
exports.getClientProfile = getClientProfile;
const upsertClientProfile = async (id, data) => {
    const { rut, nombre_contacto, telefono, direccion, comuna, ciudad } = data;
    const user = await prisma_1.prisma.user.findUnique({ where: { id } });
    if (!user)
        throw new Error('Usuario no encontrado');
    const rutInfo = rut ? (0, rut_1.normalizeRut)(rut) : null;
    const formattedRut = rutInfo?.normalized ?? (rut ? rut.trim() : null);
    const rutCompact = rutInfo?.compact ?? null;
    const profile = await prisma_1.prisma.cliente.upsert({
        where: { id_usuario: id },
        create: {
            id_usuario: id,
            email: user.email,
            rut: formattedRut,
            rutNormalizado: rutCompact,
            nombre_contacto: nombre_contacto || user.fullName || null,
            telefono: telefono || null,
            direccion: direccion || null,
            comuna: comuna || null,
            ciudad: ciudad || null,
            estado: 'active',
        },
        update: {
            rut: formattedRut,
            rutNormalizado: rutCompact,
            nombre_contacto: nombre_contacto ?? undefined,
            telefono: telefono ?? null,
            direccion: direccion ?? null,
            comuna: comuna ?? null,
            ciudad: ciudad ?? null,
            estado: 'active',
        },
        select: { id_cliente: true, rut: true, nombre_contacto: true, email: true, telefono: true, direccion: true, comuna: true, ciudad: true, id_usuario: true, creado_en: true },
    });
    return profile;
};
exports.upsertClientProfile = upsertClientProfile;
