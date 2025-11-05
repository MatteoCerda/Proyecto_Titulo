import dotenv from 'dotenv';
dotenv.config();
import app from './app';
import crypto from 'crypto';

// Ensure JWT secret is configured. In development, generate a temporary one.
if (!process.env.JWT_SECRET) {
  const env = process.env.NODE_ENV || 'development';
  if (env !== 'production') {
    const generated = 'dev-' + crypto.randomBytes(24).toString('hex');
    process.env.JWT_SECRET = generated;
    // eslint-disable-next-line no-console
    console.warn('[auth] JWT_SECRET no definido. Generando secreto temporal para desarrollo.');
  } else {
    // eslint-disable-next-line no-console
    console.error('[auth] JWT_SECRET es obligatorio en producción. Defínelo en variables de entorno.');
    process.exit(1);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API listening on :${PORT}`);
});
