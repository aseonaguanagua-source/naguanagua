const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf-8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

const fixes = [
  // Caso principal reportado por el usuario: AMAL TIENDAS 2021, C.A
  {
    padre: 'URB033304',
    contribuyente: 'AMAL TIENDAS 2021, C.A',
    hijos: ['URB035303', 'URB035304', 'URB035305']
  },
  // Caso gemelo por re-empadronamiento (| REF): BODEGON LAS 4J, C.A.
  {
    padre: 'URB033315',
    contribuyente: 'BODEGON LAS 4J, C.A.',
    hijos: ['URB035306', 'URB035307']
  },
  // AUTOMERCADO LAS CHIMENEAS, C.A
  {
    padre: 'URB033294',
    contribuyente: 'AUTOMERCADO LAS CHIMENEAS, C.A',
    hijos: ['URB032120', 'URB032121', 'URB032122', 'URB034272']
  },
  // JULIO CESAR BENAVIDEZ
  {
    padre: 'URB033768',
    contribuyente: 'JULIO CESAR BENAVIDEZ',
    hijos: ['URB008525', 'URB008527']
  },
  // CONSTRUCTORA 969 C.A.
  {
    padre: 'URB002505',
    contribuyente: 'CONSTRUCTORA 969 C.A.',
    hijos: ['URB002509', 'URB002513']
  },
  // ASOCIACION CARABOBEÑA DE TIRO
  {
    padre: 'URB030879',
    contribuyente: 'ASOCIACION CARABOBEÑA DE TIRO',
    hijos: ['URB030888', 'URB030889']
  },
  // DISTRIBUIDORA M J S, C.A
  {
    padre: 'URB033649',
    contribuyente: 'DISTRIBUIDORA M J S, C.A (DISTRIBUIDORA M J S, C.A)',
    hijos: ['URB034427']
  }
];

async function run() {
  console.log('--- APLICANDO VINCULACIÓN DE ACTIVIDADES A SUS PADRES N/A ---');

  for (const item of fixes) {
    console.log(`\nProcesando Padre ${item.padre} (${item.contribuyente})...`);

    // 1. Asignar padre_id a los hijos
    const { data: updatedHijos, error: errHijos } = await supabase
      .from('inmuebles')
      .update({ padre_id: item.padre })
      .in('inmueble', item.hijos)
      .select('inmueble, actividad_principal, padre_id');

    if (errHijos) {
      console.error(`  Error actualizando hijos de ${item.padre}:`, errHijos);
      continue;
    }

    console.log(`  Hijos vinculados (${updatedHijos.length}):`, updatedHijos.map(h => `${h.inmueble} (${h.actividad_principal}) -> ${h.padre_id}`).join(', '));

    // 2. Actualizar cant_inmuebles del padre
    const { data: updatedPadre, error: errPadre } = await supabase
      .from('inmuebles')
      .update({ cant_inmuebles: item.hijos.length })
      .eq('inmueble', item.padre)
      .select('inmueble, cant_inmuebles, actividad_principal');

    if (errPadre) {
      console.error(`  Error actualizando cant_inmuebles de padre ${item.padre}:`, errPadre);
    } else {
      console.log(`  Padre actualizado: ${updatedPadre[0]?.inmueble} cant_inmuebles = ${updatedPadre[0]?.cant_inmuebles}`);
    }
  }

  console.log('\n--- VINCULACIÓN COMPLETADA CON ÉXITO ---');
}

run();
