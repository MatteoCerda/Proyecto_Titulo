"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = validate;
const zod_1 = require("zod");
const register = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(6),
    fullName: zod_1.z.string().min(2),
    rut: zod_1.z.string().max(15).optional(),
    nombre_contacto: zod_1.z.string().max(150).optional(),
    telefono: zod_1.z.string().max(30).optional(),
    direccion: zod_1.z.string().max(200).optional(),
    comuna: zod_1.z.string().max(80).optional(),
    ciudad: zod_1.z.string().max(80).optional()
});
const login = zod_1.z.object({ email: zod_1.z.string().email(), password: zod_1.z.string().min(1) });
const forgot = zod_1.z.object({ email: zod_1.z.string().email() });
const reset = zod_1.z.object({ token: zod_1.z.string().min(10), password: zod_1.z.string().min(6) });
function validate(kind, data) {
    switch (kind) {
        case 'register': return register.parse(data);
        case 'login': return login.parse(data);
        case 'forgot': return forgot.parse(data);
        case 'reset': return reset.parse(data);
    }
}
