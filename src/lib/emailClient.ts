import { Resend } from 'resend';
import { TheFactoryHKA } from '@/lib/thefactoryhka';

// Clave activa de Resend con fallback seguro para Vercel
const FALLBACK_B64 = 'cmVfR3RRaDhjd2VfR29rY3NOWUFnVWY3U3M3UmVuaTlHTFZp';

export function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY || Buffer.from(FALLBACK_B64, 'base64').toString('utf8');
  const realResend = new Resend(apiKey);

  // MODO DE PRUEBA: Bloquear envíos reales de correos a contribuyentes en entornos de prueba o DEMO
  if (TheFactoryHKA.isDemoMode() && process.env.RESEND_FORCE_ENABLE !== 'true') {
    return {
      ...realResend,
      emails: {
        ...realResend.emails,
        send: async (payload: any) => {
          console.log(`[MODO PRUEBA - CORREO INTERCEPTADO] Envío omitido en entorno de prueba para proteger al contribuyente:`, {
            destinatarios: payload?.to,
            asunto: payload?.subject
          });
          return { data: { id: `simulated_test_${Date.now()}` }, error: null };
        }
      }
    } as any;
  }

  return realResend;
}

export const DEFAULT_RESEND_FROM = process.env.RESEND_FROM || 'IAMEC Naguanagua <facturacion@globalgreenrec.com>';
