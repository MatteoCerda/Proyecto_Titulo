"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertClientProfile = exports.getClientProfile = exports.updateUserPassword = exports.updateUserProfile = exports.getUserProfile = void 0;
const meService = __importStar(require("./me.service"));
const getUserProfile = async (req, res) => {
    try {
        const id = Number(req.user?.sub);
        if (!id)
            return res.status(401).json({ message: 'No autorizado' });
        const user = await meService.getUserProfile(id);
        res.json({ user });
    }
    catch (e) {
        res.status(500).json({ message: e.message || 'Error interno' });
    }
};
exports.getUserProfile = getUserProfile;
const updateUserProfile = async (req, res) => {
    try {
        const id = Number(req.user?.sub);
        const { fullName } = req.body || {};
        if (!id)
            return res.status(401).json({ message: 'No autorizado' });
        const user = await meService.updateUserProfile(id, fullName);
        res.json({ user });
    }
    catch (e) {
        if (e.message === 'Usuario no encontrado')
            return res.status(404).json({ message: e.message });
        if (e.message === 'Nombre inválido')
            return res.status(400).json({ message: e.message });
        res.status(500).json({ message: 'Error interno' });
    }
};
exports.updateUserProfile = updateUserProfile;
const updateUserPassword = async (req, res) => {
    try {
        const id = Number(req.user?.sub);
        const { currentPassword, newPassword } = req.body || {};
        if (!id)
            return res.status(401).json({ message: 'No autorizado' });
        await meService.updateUserPassword(id, currentPassword, newPassword);
        res.json({ ok: true });
    }
    catch (e) {
        if (e.message === 'Usuario no encontrado')
            return res.status(404).json({ message: e.message });
        if (e.message.startsWith('Contraseña'))
            return res.status(400).json({ message: e.message });
        res.status(500).json({ message: 'Error interno' });
    }
};
exports.updateUserPassword = updateUserPassword;
const getClientProfile = async (req, res) => {
    try {
        const id = Number(req.user?.sub);
        if (!id)
            return res.status(401).json({ message: 'No autorizado' });
        const profile = await meService.getClientProfile(id);
        res.json({ profile });
    }
    catch (e) {
        res.status(500).json({ message: e.message || 'Error interno' });
    }
};
exports.getClientProfile = getClientProfile;
const upsertClientProfile = async (req, res) => {
    try {
        const id = Number(req.user?.sub);
        if (!id)
            return res.status(401).json({ message: 'No autorizado' });
        const profile = await meService.upsertClientProfile(id, req.body);
        res.json({ profile });
    }
    catch (e) {
        if (e.message === 'Usuario no encontrado')
            return res.status(404).json({ message: e.message });
        res.status(500).json({ message: e.message || 'Error interno' });
    }
};
exports.upsertClientProfile = upsertClientProfile;
