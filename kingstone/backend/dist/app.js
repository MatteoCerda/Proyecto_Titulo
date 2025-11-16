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
const pedidos_routes_1 = __importDefault(require("./modules/pedidos/pedidos.routes"));
const cotizaciones_routes_1 = __importDefault(require("./modules/cotizaciones/cotizaciones.routes"));
const me_routes_1 = __importDefault(require("./modules/me/me.routes"));
const operator_routes_1 = __importDefault(require("./modules/operator/operator.routes"));
const catalogo_routes_1 = __importDefault(require("./modules/catalogo/catalogo.routes"));
const offers_routes_1 = __importDefault(require("./modules/offers/offers.routes"));
const operatorGuard_1 = require("./modules/common/middlewares/operatorGuard");
const webpay_routes_1 = __importDefault(require("./modules/payments/webpay.routes"));
const webpay_controller_1 = require("./modules/payments/webpay.controller");
const app = (0, express_1.default)();
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({ origin: true, credentials: true }));
app.use(express_1.default.json({ limit: '8mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '8mb' }));
app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/', (_req, res) => { res.json({ ok: true, service: 'kingstone-api' }); });
// Auth (register/login)
app.use('/auth', auth_routes_1.default);
app.use(['/me', '/api/me'], me_routes_1.default);
app.use(['/catalogo', '/api/catalogo'], catalogo_routes_1.default);
app.use(['/offers', '/api/offers'], offers_routes_1.default);
// Pedidos (clientes y operadores)
app.post('/api/payments/webpay/return', webpay_controller_1.webpayReturnBridge);
app.get('/api/payments/webpay/return', webpay_controller_1.webpayReturnBridge);
app.use('/api/pedidos', authGuard_1.authGuard, pedidos_routes_1.default);
app.use('/api/cotizaciones', cotizaciones_routes_1.default);
app.use('/api/operator', authGuard_1.authGuard, operatorGuard_1.operatorGuard, operator_routes_1.default);
app.use('/api/payments', authGuard_1.authGuard, webpay_routes_1.default);
// Admin endpoints
app.use('/api/admin', authGuard_1.authGuard, adminGuard_1.adminGuard, admin_routes_1.default);
app.use('/admin', authGuard_1.authGuard, adminGuard_1.adminGuard, admin_routes_1.default);
exports.default = app;
