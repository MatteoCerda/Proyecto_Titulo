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
exports.postRegister = postRegister;
exports.postLogin = postLogin;
exports.postForgotPassword = postForgotPassword;
exports.postResetPassword = postResetPassword;
const zod_1 = require("zod");
const svc = __importStar(require("./auth.service"));
const auth_validation_1 = require("./auth.validation");
function respondValidationError(err, res) {
    const firstIssue = err.issues?.[0];
    const message = firstIssue?.message || 'Datos invalidos';
    res.status(400).json({
        message,
        issues: err.issues?.map(issue => ({
            path: issue.path,
            message: issue.message
        }))
    });
}
function tryHandleValidationError(err, res) {
    if (err instanceof zod_1.ZodError) {
        respondValidationError(err, res);
        return true;
    }
    return false;
}
async function postRegister(req, res) {
    try {
        const dto = (0, auth_validation_1.validate)('register', req.body);
        const user = await svc.register(dto);
        res.status(201).json(user);
    }
    catch (err) {
        if (tryHandleValidationError(err, res))
            return;
        if (err?.message === 'EMAIL_IN_USE') {
            return res.status(409).json({ message: 'Email ya registrado' });
        }
        res.status(500).json({ message: 'Error interno' });
    }
}
async function postLogin(req, res) {
    try {
        const dto = (0, auth_validation_1.validate)('login', req.body);
        const result = await svc.login(dto);
        res.json(result);
    }
    catch (err) {
        if (tryHandleValidationError(err, res))
            return;
        if (err?.message === 'INVALID_CREDENTIALS') {
            return res.status(401).json({ message: 'Credenciales invalidas' });
        }
        res.status(500).json({ message: 'Error interno' });
    }
}
async function postForgotPassword(req, res) {
    try {
        const dto = (0, auth_validation_1.validate)('forgot', req.body);
        const info = await svc.forgotPassword(dto.email);
        res.json(info);
    }
    catch (err) {
        if (tryHandleValidationError(err, res))
            return;
        res.status(500).json({ message: 'Error interno' });
    }
}
async function postResetPassword(req, res) {
    try {
        const dto = (0, auth_validation_1.validate)('reset', req.body);
        await svc.resetPassword(dto.token, dto.password);
        res.json({ ok: true });
    }
    catch (err) {
        if (tryHandleValidationError(err, res))
            return;
        const map = { TOKEN_INVALID: 400, TOKEN_EXPIRED: 400 };
        const code = map[err?.message] || 500;
        res.status(code).json({ message: err?.message || 'Error interno' });
    }
}
