import crypto from 'crypto';

export function generateClaimCode(length = 6): string {
  const digits = '0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    const idx = crypto.randomInt(0, digits.length);
    result += digits[idx];
  }
  return result;
}

export function hashClaimCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

export function verifyClaimCode(code: string, hash?: string | null): boolean {
  if (!code || !hash) {
    return false;
  }
  return hashClaimCode(code) === hash;
}
