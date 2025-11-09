
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS,
  },
});

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(options: EmailOptions) {
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
  } catch (error) {
    console.error(`[email] Error sending email to ${options.to}`, error);
  }
}
