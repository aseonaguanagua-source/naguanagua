// Paso 7: marca como "Eliminado" lo que no existe (o está eliminado) en SIGYR, según scratch/global/eliminar.json.
// Eliminación LÓGICA y condicional (solo si el estado sigue igual). Respaldo en respaldo_20261012/eliminados.json.
// npx tsx scripts/saneamiento/aplicar_eliminar.ts [--dry]
import { config } from 'dotenv';
import fs from 'fs';
config({ path: '.env.local' });
const SCR = '/Users/davidzara/.gemini/antigravity-ide/brain/20e5ee32-12e0-4894-a878-b56958d4e6fd/scratch/global';
const DRY = process.argv.includes('--dry');

(async () => {
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const e = JSON.parse(fs.readFileSync(`${SCR}/eliminar.json`, 'utf8'));
  fs.mkdirSync(`${SCR}/respaldo_20261012`, { recursive: true });
  fs.writeFileSync(`${SCR}/respaldo_20261012/eliminados.json`, JSON.stringify(e));
  let ok = 0, sin = 0, err = 0;
  const marca = async (t: string, id: string, antes: string, nuevo: string) => {
    if (DRY) { ok++; return; }
    const { data, error } = await sb.from(t).update({ estado: nuevo }).eq('id', id).eq('estado', antes).select('id');
    if (error) { err++; console.log('ERR', t, id, error.message); } else if (data?.length) ok++; else sin++;
  };
  for (const x of e.inmuebles.eliminar) await marca('inmuebles', x.id, x.estado, 'Eliminado');
  for (const x of e.unidades.eliminar) await marca('condominio_unidades', x.id, 'Activa', 'Eliminada');
  for (const x of e.condominios.eliminar) await marca('condominios', x.id, 'Activo', 'Inactivo');
  if (!DRY) await sb.from('auditoria').insert({ accion: 'Saneamiento global: eliminar lo que no existe en SIGYR', usuario: 'Sistema (saneamiento 12/10/2026)', detalles: { _categoria: 'SANEAMIENTO', criticidad: 'ALTA', marcados: ok, inmuebles: e.inmuebles.eliminar.map((x: any) => ({ id: x.id, inmueble: x.inmueble, estado_antes: x.estado })) } });
  console.log({ ok, sinCambio: sin, err, dry: DRY });
})();
