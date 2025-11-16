"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const app_1 = __importDefault(require("./app"));
const crypto_1 = __importDefault(require("crypto"));
// Ensure JWT secret is configured. In development, generate a temporary one.
if (!process.env.JWT_SECRET) {
    const env = process.env.NODE_ENV || 'development';
    if (env !== 'production') {
        const generated = 'dev-' + crypto_1.default.randomBytes(24).toString('hex');
        process.env.JWT_SECRET = generated;
        // eslint-disable-next-line no-console
        console.warn('[auth] JWT_SECRET no definido. Generando secreto temporal para desarrollo.');
    }
    else {
        // eslint-disable-next-line no-console
        console.error('[auth] JWT_SECRET es obligatorio en producción. Defínelo en variables de entorno.');
        process.exit(1);
    }
}
const PORT = process.env.PORT || 3000;
app_1.default.listen(PORT, () => {
    console.log(`API listening on :${PORT}`);
});
