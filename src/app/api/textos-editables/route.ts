// Textos editados en modo desarrollador. Se guardan en system_config (key = TEXTOS_EDITADOS).
// Estructura: { "<ruta de la página>" | "*": { "<texto original>": "<texto nuevo>" } }
// GET: público (solo textos). POST: clave de desarrollador (si hay sesión, debe ser administrador).
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabaseAdmin as sb } from '@/lib/supabaseAdmin';
import { SESSION_COOKIE, verifySession } from '@/lib/adminSession';

export const dynamic = 'force-dynamic';
const KEY = 'TEXTOS_EDITADOS';
const DEV_PASS = '1756762';
const parse = (v: any) => { if (!v) return {}; if (typeof v === 'object') return v; try { return JSON.parse(String(v)); } catch { return {}; } };

export async function GET() {
  const { data } = await sb.from('system_config').select('value').eq('key', KEY).maybeSingle();
  return NextResponse.json({ textos: parse((data as any)?.value) });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (body.pass !== DEV_PASS) return NextResponse.json({ error: 'Clave de desarrollador inválida' }, { status: 401 });
    const tok = (await cookies()).get(SESSION_COOKIE)?.value;
    const sesion = tok ? verifySession(tok) : null;
    if (sesion && !/admin/i.test(String(sesion.rol || '')) && String(sesion.usuario).toLowerCase() !== 'dzara')
      return NextResponse.json({ error: 'Solo un administrador puede editar textos.' }, { status: 401 });
    const quien = sesion ? `${sesion.nombre || sesion.usuario} (${sesion.usuario})` : String(body.usuario || 'DEV');

    const ruta = String(body.ruta || '*').slice(0, 200);
    const original = String(body.original || '').trim().slice(0, 2000);
    const nuevo = body.nuevo == null ? null : String(body.nuevo).slice(0, 2000);
    if (!original) return NextResponse.json({ error: 'Falta el texto original' }, { status: 400 });

    const { data: fila } = await sb.from('system_config').select('value').eq('key', KEY).maybeSingle();
    const antes = parse((fila as any)?.value);
    const todo: Record<string, Record<string, string>> = JSON.parse(JSON.stringify(antes));
    todo[ruta] = todo[ruta] || {};
    if (nuevo === null || nuevo.trim() === original) delete todo[ruta][original]; // restaurar
    else todo[ruta][original] = nuevo;
    if (!Object.keys(todo[ruta]).length) delete todo[ruta];

    const valor = JSON.stringify(todo);
    const { error } = await sb.from('system_config').upsert({ key: KEY, value: valor, description: 'Textos editados en modo desarrollador' }, { onConflict: 'key' });
    if (error) throw error;
    await sb.from('auditoria').insert({
      accion: 'MODO DIOS: edición de texto', usuario: quien,
      detalles: { _categoria: 'MODO_DIOS', tabla: 'system_config', pk: 'key', id: KEY, ruta, antes: { texto: original }, despues: { texto: nuevo } },
    });
    return NextResponse.json({ ok: true, textos: todo });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
