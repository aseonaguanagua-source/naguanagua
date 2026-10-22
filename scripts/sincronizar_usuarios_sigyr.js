const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envContent = fs.readFileSync('.env.local', 'utf-8');
const url = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = (envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/) || envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/))[1].trim();
const supabase = createClient(url, key);

const sigyrMap = JSON.parse(fs.readFileSync('../backup_sigyr/sigyr_users_clean_map.json', 'utf-8'));

async function sincronizarTodo() {
  console.log('====================================================================');
  console.log('INICIANDO SINCRONIZACIÓN USUARIO POR USUARIO CON BASE DE DATOS SIGYR');
  console.log('====================================================================');

  let offset = 0;
  let totalProcesados = 0;
  let direccionesActualizadas = 0;
  let emailsActualizados = 0;
  let telefonosActualizados = 0;

  while (true) {
    const { data: contribs, error } = await supabase
      .from('contribuyentes')
      .select('id, identidad, nombre, email, telefono, direccion')
      .range(offset, offset + 499);

    if (error) {
      console.error('Error al leer contribuyentes:', error);
      break;
    }
    if (!contribs || contribs.length === 0) break;

    const updates = [];

    for (const c of contribs) {
      const sig = sigyrMap[c.identidad];
      if (!sig) continue;

      const fieldsToUpdate = {};
      let needsUpdate = false;

      // 1. Sincronizar Dirección Fiscal
      if (sig.direccion_fiscal && sig.direccion_fiscal.trim().length > 5 && !sig.direccion_fiscal.startsWith('0 0 0')) {
        let cleanDir = sig.direccion_fiscal
          .replace(/\s*N\?\s*/gi, ' NRO. ')
          .replace(/\s+/g, ' ')
          .trim();

        // Si la dirección actual en Supabase es nula, genérica o diferente a la dirección fiscal real de SIGYR
        const dirActual = (c.direccion || '').trim();
        const esCadastralODefectuosa = !dirActual ||
          dirActual.startsWith('0 0') ||
          dirActual.startsWith('2 000') ||
          dirActual.startsWith('1 214') ||
          dirActual.startsWith('3 35') ||
          dirActual.startsWith('4 ') ||
          dirActual === 'NAGUANAGUA, EDO. CARABOBO';

        if (esCadastralODefectuosa || (cleanDir.length > 5 && cleanDir !== dirActual)) {
          fieldsToUpdate.direccion = cleanDir;
          direccionesActualizadas++;
          needsUpdate = true;
        }
      }

      // 2. Sincronizar Email (si SIGYR tiene un correo real y Supabase tiene un dummy o test)
      if (sig.email && sig.email.includes('@') && !sig.email.includes('@test.com') && !sig.email.includes('sincorre')) {
        const emailActual = (c.email || '').trim().toLowerCase();
        if (!emailActual || emailActual.includes('@test.com') || emailActual.includes('sincorre') || (sig.email.toLowerCase() !== emailActual && !emailActual.includes('@gmail.com'))) {
          fieldsToUpdate.email = sig.email.toLowerCase();
          emailsActualizados++;
          needsUpdate = true;
        }
      }

      // 3. Sincronizar Teléfono
      if (sig.telefono && sig.telefono.trim().length > 6 && sig.telefono.trim() !== '00000000000' && sig.telefono.trim() !== '0') {
        const telActual = (c.telefono || '').replace(/[^0-9]/g, '');
        const telSig = sig.telefono.replace(/[^0-9]/g, '');
        if (!telActual || telActual.length < 7 || telActual === '0') {
          fieldsToUpdate.telefono = sig.telefono.trim();
          telefonosActualizados++;
          needsUpdate = true;
        }
      }

      if (needsUpdate) {
        updates.push({ id: c.id, ...fieldsToUpdate });
      }
    }

    // Ejecutar actualizaciones en paralelo en el lote
    if (updates.length > 0) {
      await Promise.all(
        updates.map(u => {
          const { id, ...data } = u;
          return supabase.from('contribuyentes').update(data).eq('id', id);
        })
      );
    }

    totalProcesados += contribs.length;
    console.log(`Procesados: ${totalProcesados} contribuyentes... (Direcciones corregidas: ${direccionesActualizadas}, Emails: ${emailsActualizados}, Teléfonos: ${telefonosActualizados})`);

    offset += 500;
  }

  console.log('====================================================================');
  console.log('SINCRONIZACIÓN MAESTRA FINALIZADA CON ÉXITO');
  console.log('====================================================================');
  console.log(`Total de contribuyentes procesados usuario por usuario: ${totalProcesados}`);
  console.log(`Direcciones fiscales reales sincronizadas desde SIGYR : ${direccionesActualizadas}`);
  console.log(`Correos electrónicos oficiales actualizados            : ${emailsActualizados}`);
  console.log(`Teléfonos de contacto actualizados                    : ${telefonosActualizados}`);
}

sincronizarTodo();
