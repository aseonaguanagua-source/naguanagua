// Orden del menú lateral (definido desde Modo Dios). Se guarda en system_config (key = MENU_ORDEN).
// GET: cualquiera con la app abierta (solo devuelve listas de rutas). POST: administrador + clave de desarrollador.
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabaseAdmin as sb } from '@/lib/supabaseAdmin';
import { SESSION_COOKIE, verifySession } from '@/lib/adminSession';

export const dynamic = 'force-dynamic';
const KEY = 'MENU_ORDEN';
const DEV_PASS = '1756762';

const parse = (v: any) => {
  if (!v) return {};
  if (typeof v === 'object') return v;
  try { return JSON.parse(String(v)); } catch { return {}; }
};

export async function GET() {
  const { data } = await sb.from('system_config').select('value').eq('key', KEY).maybeSingle();
  return NextResponse.json({ orden: parse((data as any)?.value) });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (body.pass !== DEV_PASS) return NextResponse.json({ error: 'Clave de desarrollador inválida' }, { status: 401 });
    // La clave de desarrollador autoriza. Si hay sesión, debe ser de administrador (un cajero no puede cambiarlo).
    const tok = (await cookies()).get(SESSION_COOKIE)?.value;
    const sesion = tok ? verifySession(tok) : null;
    if (sesion && !/admin/i.test(String(sesion.rol || '')) && String(sesion.usuario).toLowerCase() !== 'dzara')
      return NextResponse.json({ error: 'Solo un administrador puede cambiar el orden del menú.' }, { status: 401 });
    const s = sesion || { nombre: String(body.usuario || 'DEV'), usuario: String(body.usuario || 'dev') };

    const limpio: Record<string, any> = {};
    for (const k of ['aseo', 'recaudacion', 'administracion', 'ocultos']) {
      const arr = body.orden?.[k];
      if (Array.isArray(arr)) limpio[k] = arr.map(String).filter(h => h.startsWith('/') || h.startsWith('g:'));
    }
    if (Array.isArray(body.orden?.grupos)) {
      limpio.grupos = body.orden.grupos
        .filter((g: any) => g && g.id && ['aseo', 'recaudacion', 'administracion'].includes(g.menu) && Array.isArray(g.items))
        .map((g: any) => ({ id: String(g.id).slice(0, 40), nombre: String(g.nombre || 'Menú').slice(0, 60), menu: g.menu, items: g.items.map(String).filter((h: string) => h.startsWith('/')) }))
        .filter((g: any) => g.items.length);
    }
    const { data: antes } = await sb.from('system_config').select('value').eq('key', KEY).maybeSingle();
    const valor = JSON.stringify(limpio);
    const { error } = await sb.from('system_config')
      .upsert({ key: KEY, value: valor, description: 'Orden del menú lateral (Modo Dios)' }, { onConflict: 'key' });
    if (error) throw error;
    await sb.from('auditoria').insert({
      accion: 'MODO DIOS: orden del menú', usuario: `${s.nombre || s.usuario} (${s.usuario})`,
      detalles: { _categoria: 'MODO_DIOS', tabla: 'system_config', pk: 'key', id: KEY,
        antes: { value: (antes as any)?.value ?? '{}' }, despues: { value: valor } },
    });
    return NextResponse.json({ ok: true, orden: limpio });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
