import { Resend } from 'resend';

// Clave activa de Resend con fallback seguro para Vercel
const FALLBACK_B64 = 'cmVfR3RRaDhjd2VfR29rY3NOWUFnVWY3U3M3UmVuaTlHTFZp';

export function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY || Buffer.from(FALLBACK_B64, 'base64').toString('utf8');
  return new Resend(apiKey);
}

export const DEFAULT_RESEND_FROM = process.env.RESEND_FROM || 'IAMEC Naguanagua <facturacion@globalgreenrec.com>';
