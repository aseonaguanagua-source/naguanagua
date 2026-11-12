import { NextResponse } from 'next/server';
import {
  estadoVigenciaTasaCongelada,
  guardarTasaCongeladaCondominio,
  hoyCaracasYMD,
  obtenerMapaTasasCongeladas,
  resolverTasaCongelada,
} from '@/lib/condominios/servicio';

export const dynamic = 'force-dynamic';

const CLAVE_AUTORIZACION = 'dzara18';

/**
 * GET /api/admin/condominios/congelar-tasa
 * GET /api/admin/condominios/congelar-tasa?codigo=URB015849
 * GET /api/admin/condominios/congelar-tasa?codigos=URB015849,URB016491
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const codigo = url.searchParams.get('codigo');
    const codigosParam = url.searchParams.get('codigos');
    const hoyYMD = hoyCaracasYMD();
    const mapa = await obtenerMapaTasasCongeladas();

    if (codigo) {
      const cod = codigo.trim().toUpperCase();
      const cfg = mapa[cod] || null;
      return NextResponse.json({
        codigo: cod,
        hoy: hoyYMD,
        config: cfg,
        activa: resolverTasaCongelada(cfg, hoyYMD),
        estado: estadoVigenciaTasaCongelada(cfg, hoyYMD),
      });
    }

    if (codigosParam) {
      const cods = codigosParam
        .split(',')
        .map(s => s.trim().toUpperCase())
        .filter(Boolean);
      const resultado: Record<string, any> = {};
      for (const cod of cods) {
        const cfg = mapa[cod] || null;
        const act = resolverTasaCongelada(cfg, hoyYMD);
        if (cfg) {
          resultado[cod] = {
            config: cfg,
            activa: act,
            estado: estadoVigenciaTasaCongelada(cfg, hoyYMD),
          };
        }
      }
      return NextResponse.json({ hoy: hoyYMD, tasas: resultado });
    }

    const activas: Record<string, any> = {};
    for (const [cod, cfg] of Object.entries(mapa)) {
      const act = resolverTasaCongelada(cfg, hoyYMD);
      if (act) activas[cod] = act;
    }

    return NextResponse.json({
      hoy: hoyYMD,
      configuraciones: mapa,
      activas,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error consultando tasas congeladas' }, { status: 500 });
  }
}

/**
 * POST /api/admin/condominios/congelar-tasa
 * Body: {
 *   codigo: string,
 *   clave: string, // 'dzara18'
 *   accion?: 'congelar' | 'descongelar',
 *   tasa?: number,
 *   desde?: string, // YYYY-MM-DD
 *   hasta?: string, // YYYY-MM-DD
 *   fechaReferencia?: string,
 *   motivo?: string,
 *   usuario?: string
 * }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const clave = String(body?.clave || '').trim();

    if (clave !== CLAVE_AUTORIZACION) {
      return NextResponse.json(
        { error: 'Clave de autorización incorrecta. Debe ingresar la clave autorizada para congelar o descongelar la tasa.' },
        { status: 403 }
      );
    }

    const codigo = String(body?.codigo || '').trim().toUpperCase();
    if (!codigo) {
      return NextResponse.json({ error: 'Código de condominio requerido.' }, { status: 400 });
    }

    const accion: 'congelar' | 'descongelar' = body?.accion === 'descongelar' ? 'descongelar' : 'congelar';
    const res = await guardarTasaCongeladaCondominio({
      codigo,
      accion,
      tasa: Number(body?.tasa || 0),
      desde: body?.desde,
      hasta: body?.hasta,
      fechaReferencia: body?.fechaReferencia,
      motivo: body?.motivo,
      usuario: body?.usuario || 'Autorizado (dzara18)',
    });

    return NextResponse.json({
      ok: true,
      codigo,
      hoy: hoyCaracasYMD(),
      config: res.config,
      activa: res.activa,
      estado: estadoVigenciaTasaCongelada(res.config),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Error guardando tasa congelada' }, { status: 400 });
  }
}
