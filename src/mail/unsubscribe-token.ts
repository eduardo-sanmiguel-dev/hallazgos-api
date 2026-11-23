import { createHmac, timingSafeEqual } from 'crypto';

// Separa esta firma de cualquier otro uso del mismo secreto (JWT, huellas de
// contraseña): un HMAC de otro propósito nunca sirve como enlace de baja.
const PURPOSE = 'mail-unsubscribe:v1:';

const signature = (userId: number, secret: string) =>
  createHmac('sha256', secret)
    .update(`${PURPOSE}${userId}`)
    .digest('base64url');

/**
 * Token del enlace de baja de los avisos de planta: `<userId>.<firma>`. No
 * vence, para que funcione en correos viejos; solo cambia la preferencia de
 * ese usuario y deja de servir si cambia JWT_SECRET_KEY.
 */
export function createUnsubscribeToken(userId: number, secret: string): string {
  return `${userId}.${signature(userId, secret)}`;
}

/** Id del usuario si el token es válido; null si no. */
export function verifyUnsubscribeToken(
  token: string,
  secret: string,
): number | null {
  const match = /^([1-9]\d{0,9})\.([\w-]{43})$/.exec(token ?? '');
  if (!match) return null;
  const userId = Number(match[1]);
  const expected = Buffer.from(signature(userId, secret));
  const received = Buffer.from(match[2]);
  return timingSafeEqual(expected, received) ? userId : null;
}
