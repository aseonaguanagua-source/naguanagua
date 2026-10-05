import { NextResponse } from 'next/server';
import { TheFactoryHKA } from '@/lib/thefactoryhka';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const estado = await TheFactoryHKA.verificarConexion();

    return NextResponse.json({
      success: true,
      config: {
        baseUrl: TheFactoryHKA.getBaseUrl(),
        user: TheFactoryHKA.getUser(),
        isConfigured: !!(TheFactoryHKA.getUser() && TheFactoryHKA.getPassword()),
        isProduction: !TheFactoryHKA.getBaseUrl().toLowerCase().includes('demo'),
        enabled: TheFactoryHKA.isEnabled(),
        backupEmail: TheFactoryHKA.getBackupEmail(),
        fallbackEmail: TheFactoryHKA.getFallbackEmail(),
      },
      connectionStatus: estado
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { user, password, baseUrl } = body;

    // Test temporal con credenciales enviadas
    if (user && password) {
      const url = baseUrl || TheFactoryHKA.getBaseUrl();
      const res = await fetch(`${url}/api/Autenticacion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario: user, clave: password })
      });

      if (!res.ok) {
        const errText = await res.text();
        return NextResponse.json({
          ok: false,
          error: `Error de autenticación (${res.status}): ${errText}`
        }, { status: 400 });
      }

      const data = await res.json();
      return NextResponse.json({
        ok: true,
        message: 'Credenciales válidas. The Factory HKA generó token con éxito.',
        tokenPreview: `${data.token?.substring(0, 16)}...`,
        url
      });
    }

    return NextResponse.json({ error: 'Faltan usuario y clave para probar' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
