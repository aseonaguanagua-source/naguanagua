const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function enrichNames() {
  const file = '/Users/davidzara/Documents/naguanagua_zero/auditoria_agentes_sin_deduccion.json';
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));

  for (const item of data.detalle_pagos_sin_deduccion) {
    if (!item.contribuyente || item.contribuyente === 'CONTRIBUYENTE' || item.contribuyente === item.identidad) {
      const { data: inm } = await supabase.from('inmuebles').select('contribuyente').eq('identidad', item.identidad).limit(1);
      if (inm?.[0]?.contribuyente) {
        item.contribuyente = inm[0].contribuyente;
      } else {
        const { data: c } = await supabase.from('condominios').select('nombre').eq('identidad', item.identidad).limit(1);
        if (c?.[0]?.nombre) item.contribuyente = c[0].nombre;
      }
    }
  }

  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');

  // Actualizar también CSV
  const outCsv = '/Users/davidzara/Documents/naguanagua_zero/auditoria_agentes_sin_deduccion.csv';
  const csvRows = [
    ['Fecha', 'Referencia', 'RIF', 'Contribuyente', 'Monto Cobrado (Bs.)', 'Retención IVA 75% No Deducida (Bs.)', 'Cajero', 'Método', 'Módulo'].join(';')
  ];
  for (const s of data.detalle_pagos_sin_deduccion) {
    csvRows.push([
      s.fecha,
      `="${s.referencia}"`,
      s.identidad,
      `"${(s.contribuyente || '').replace(/"/g, '""')}"`,
      s.monto_cobrado_bs.toFixed(2).replace('.', ','),
      s.retencion_no_deducida_aprox_bs.toFixed(2).replace('.', ','),
      s.cajero,
      s.metodo,
      s.modulo
    ].join(';'));
  }
  fs.writeFileSync(outCsv, csvRows.join('\n'), 'utf8');
  console.log('Nombres enriquecidos con éxito.');
}
enrichNames();
