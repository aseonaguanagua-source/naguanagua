const fs = require('fs');

let c = fs.readFileSync('src/app/(admin)/admin/caja/conciliacion/page.tsx', 'utf8');

const search = `        if (recibos.includes('RECIB-DEUDA') && !det.es_abono) {
          const { data: inmList2 } = await supabase
            .from('inmuebles')
            .select('id')
            .eq('identidad', pago.identidad);
          if (inmList2 && inmList2.length > 0) {
            for (const inm of inmList2) {
              await supabase.from('inmuebles')
                .update({ deuda_mmv: 0, deuda_congelada_bs: 0 })
                .eq('id', inm.id);
            }
          }
        }`;

const replace = `        // Reducir deuda proporcionalmente por cada RECIB-HIST pagado
        const histRecibos = recibos.filter((r: string) => r.startsWith('RECIB-HIST-'));
        if (histRecibos.length > 0 && !det.es_abono) {
          const { data: inms } = await supabase.from('inmuebles').select('*').eq('identidad', pago.identidad);
          if (inms && inms.length > 0) {
            for (const ref of histRecibos) {
              const inmId = ref.split('-')[2];
              const inm = inms.find((i: any) => i.inmueble === inmId);
              if (inm) {
                const meses = Math.max(1, parseInt(inm.meses_deuda || 1));
                const newMeses = Math.max(0, meses - 1);
                
                const d = parseFloat(inm.deuda_mmv || 0);
                const c = parseFloat(inm.deuda_congelada_bs || 0);
                const m = parseFloat(inm.multa_bs || 0);
                
                const newDeuda = newMeses === 0 ? 0 : d - (d / meses);
                const newCongelada = newMeses === 0 ? 0 : c - (c / meses);
                const newMulta = newMeses === 0 ? 0 : m - (m / meses);
                
                await supabase.from('inmuebles').update({
                  meses_deuda: newMeses,
                  deuda_mmv: newDeuda,
                  deuda_congelada_bs: newCongelada,
                  multa_bs: newMulta
                }).eq('id', inm.id);
                
                // Actualizar el objeto local para los siguientes recibos del mismo inmueble
                inm.meses_deuda = newMeses;
                inm.deuda_mmv = newDeuda;
                inm.deuda_congelada_bs = newCongelada;
                inm.multa_bs = newMulta;
              }
            }
          }
        }
        
        // Mantener compatibilidad con RECIB-DEUDA antiguo
        if (recibos.includes('RECIB-DEUDA') && !det.es_abono) {
          const { data: inmList2 } = await supabase
            .from('inmuebles')
            .select('id')
            .eq('identidad', pago.identidad);
          if (inmList2 && inmList2.length > 0) {
            for (const inm of inmList2) {
              await supabase.from('inmuebles')
                .update({ deuda_mmv: 0, deuda_congelada_bs: 0, multa_bs: 0, meses_deuda: 0 })
                .eq('id', inm.id);
            }
          }
        }`;

c = c.replace(search, replace);
fs.writeFileSync('src/app/(admin)/admin/caja/conciliacion/page.tsx', c);
