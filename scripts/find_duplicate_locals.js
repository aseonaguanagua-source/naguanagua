require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function findDuplicates() {
  console.log("Fetching all inmuebles...");
  let allInmuebles = [];
  let start = 0;
  const step = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('inmuebles')
      .select('id, numero_local, identidad, contribuyente, estado, direccion, actividad_principal, tipo')
      .range(start, start + step - 1);

    if (error) {
      console.error("Error fetching inmuebles:", error);
      return;
    }
    allInmuebles.push(...data);
    if (data.length < step) {
      hasMore = false;
    } else {
      start += step;
    }
  }

  const inmuebles = allInmuebles;
  console.log(`Fetched ${inmuebles.length} inmuebles in total.`);

  const byLocal = {};
  
  // Group by numero_local
  for (const inv of inmuebles) {
    if (!inv.numero_local || inv.numero_local.trim() === '' || inv.numero_local.toLowerCase().includes('aplica') || inv.numero_local.toLowerCase().includes('condominio')) continue;
    const loc = inv.numero_local.trim();
    if (!byLocal[loc]) byLocal[loc] = [];
    byLocal[loc].push(inv);
  }

  const conflictCases = [];

  for (const [loc, group] of Object.entries(byLocal)) {
    if (group.length > 1) {
      // Are there different identities?
      const identities = [...new Set(group.map(g => g.identidad))];
      if (identities.length > 1) {
        // we have a conflict! different users occupying the same local
        conflictCases.push({
          local: loc,
          inmuebles: group
        });
      }
    }
  }

  console.log(`Found ${conflictCases.length} cases with the same numero_local but different contribuyentes.`);
  
  // Let's create a markdown report
  let md = `# Reporte de Conflictos de Ocupación en Locales (Inmuebles)\n\n`;
  md += `**Generado el:** ${new Date().toLocaleDateString()}\n\n`;
  md += `Se han detectado los siguientes casos donde múltiples usuarios (contribuyentes) diferentes están registrados bajo el mismo \`numero_local\`.\n`;
  md += `Es probable que uno sea un inquilino anterior (Inactivo/Eliminado) y el otro el actual (Activo).\n\n`;
  
  for (const conflict of conflictCases) {
    md += `### Local: \`${conflict.local}\`\n`;
    md += `| ID Inmueble | Contribuyente | Cédula/RIF | Estado | Actividad |\n`;
    md += `|---|---|---|---|---|\n`;
    
    for (const inv of conflict.inmuebles) {
      md += `| \`${inv.id}\` | ${inv.contribuyente || '-'} | ${inv.identidad || '-'} | **${inv.estado}** | ${inv.actividad_principal || '-'} |\n`;
    }
    md += `\n---\n\n`;
  }

  fs.writeFileSync('Conflictos_Locales.md', md);
  console.log("Report generated at Conflictos_Locales.md");
}

findDuplicates();
