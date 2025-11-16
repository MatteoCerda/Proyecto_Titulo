"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmail = sendEmail;
const nodemailer_1 = __importDefault(require("nodemailer"));
const transporter = nodemailer_1.default.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS,
    },
});
async function sendEmail(options) {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) {
        console.warn('[email] GMAIL_USER or GMAIL_PASS not set, skipping email.');
        return;
    }
    try {
        await transporter.sendMail({
            from: `Kingston Estampados <${process.env.GMAIL_USER}>`,
            ...options,
        });
        console.log(`[email] Email sent to ${options.to}`);
    }
    catch (error) {
        console.error(`[email] Error sending email to ${options.to}`, error);
    }
}
