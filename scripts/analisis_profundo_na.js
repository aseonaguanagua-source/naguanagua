const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf-8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

async function main() {
  let all = [];
  let page = 0;
  while (true) {
    const { data, error } = await supabase
      .from('inmuebles')
      .select('id, inmueble, identidad, contribuyente, actividad_principal, direccion, estado, padre_id, condominio_padre_id, es_condominio, tipo, notas, cant_inmuebles')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error) { console.error(error); break; }
    if (!data || data.length === 0) break;
    all = all.concat(data);
    page++;
  }

  const byCode = new Map(all.map(i => [i.inmueble, i]));
  const activeInms = all.filter(i => i.estado !== 'Eliminado');

  // Buscar todos los activos con | en dirección
  const pipeCases = [];
  activeInms.forEach(i => {
    if (i.direccion && i.direccion.includes('|')) {
      const parts = i.direccion.split('|');
      const refCode = parts[parts.length - 1].trim();
      const refInm = byCode.get(refCode);
      pipeCases.push({
        inmueble: i.inmueble,
        act: i.actividad_principal,
        identidad: i.identidad,
        contribuyente: i.contribuyente,
        padreActual: i.padre_id,
        refCode,
        refExists: !!refInm,
        refPadre: refInm?.padre_id,
        refEstado: refInm?.estado,
        refAct: refInm?.actividad_principal
      });
    }
  });

  console.log('--- PROPIEDADES ACTIVAS CON REFERENCIA DE MIGRACION (| CODE) ---');
  pipeCases.forEach(p => {
    console.log(`${p.inmueble} (${p.act}) -> Ref: ${p.refCode} (Padre de Ref: ${p.refPadre}, Padre actual: ${p.padreActual}) | RIF: ${p.identidad} | ${p.contribuyente}`);
  });

  // Buscar N/A que tienen notas como 'Ajuste, se agrego actividades faltantes' o cant_inmuebles > 0 pero 0 hijos activos
  const naWithCantOrNotas = activeInms.filter(i => {
    if ((i.actividad_principal || '').trim().toUpperCase() !== 'N/A' || i.es_condominio) return false;
    const activeChildren = activeInms.filter(c => c.padre_id === i.inmueble);
    return activeChildren.length === 0;
  });

  console.log(`\n--- N/A ACTIVOS SIN HIJOS ACTIVOS VINCULADOS: ${naWithCantOrNotas.length} ---`);
  naWithCantOrNotas.forEach(na => {
    const rInms = activeInms.filter(x => x.identidad === na.identidad && x.inmueble !== na.inmueble);
    console.log(`N/A: ${na.inmueble} | RIF: ${na.identidad} | ${na.contribuyente} | Cant: ${na.cant_inmuebles} | Notas: ${na.notas} | Actividades activas del contribuyente (${rInms.length}):`, rInms.map(r => `${r.inmueble} (${r.actividad_principal})`).join(', '));
  });
}

main();
