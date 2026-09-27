const fs = require('fs');
const file = '/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/app/(admin)/admin/contribuyentes/page.tsx';
let content = fs.readFileSync(file, 'utf8');

const target = `          // fallback por nombre si no hay resultados por identidad (cubre RECIB- con identidad en otro formato)
          if (!facData || facData.length === 0) {
            supabase
              .from('facturas')
              .select('*')
              .in('estado', ['Pendiente', 'Por Verificar', 'Abonado'])
              .eq('contribuyente', viewData.Contribuyente)
              .order('emision', { ascending: true })
              .then(({ data: facByName }) => setViewFacturasDb(facByName || []));
          } else {
            setViewFacturasDb(facData || []);
          }`;

const replacement = `          // fallback por nombre si no hay resultados por identidad (cubre RECIB- con identidad en otro formato)
          const applyDynamicInvoices = (baseFacturas: any[]) => {
            const combined = [...baseFacturas];
            const misInmuebles = inmuebles.filter((i: any) => (i.identidad || '').replace(/-/g,'').toUpperCase() === (viewData?.Identidad || '').replace(/-/g,'').toUpperCase());
            if (combined.length === 0 && misInmuebles.length > 0) {
              const hasDeuda = misInmuebles.some((i: any) => parseFloat(i.deuda_mmv || '0') > 0 || parseFloat(i.deuda_congelada_bs || '0') > 0 || parseInt(i.meses_deuda || '0') > 0);
              if (hasDeuda) {
                misInmuebles.forEach((inm: any) => {
                  const deudaMMV = parseFloat(inm.deuda_mmv || '0');
                  const congelada = parseFloat(inm.deuda_congelada_bs || '0');
                  const multa = parseFloat(inm.multa_bs || '0');
                  const meses = parseInt(inm.meses_deuda || 0);
                  if (deudaMMV > 0 || congelada > 0 || multa > 0 || meses > 0) {
                    const numMeses = Math.max(1, meses);
                    for (let i = 1; i <= numMeses; i++) {
                      combined.push({
                        id: \`dummy-hist-\${inm.inmueble}-\${i}\`,
                        referencia: \`RECIB-HIST-\${inm.inmueble}-M\${i}\`,
                        identidad: viewData.Identidad,
                        contribuyente: viewData.Contribuyente,
                        emision: new Date(new Date().setMonth(new Date().getMonth() - numMeses + i - 1)).toISOString(),
                        vencimiento: new Date(new Date().setMonth(new Date().getMonth() - numMeses + i - 1)).toISOString(),
                        estado: 'Pendiente',
                        monto: '0'
                      });
                    }
                  }
                });
              }
            }
            setViewFacturasDb(combined);
          };

          if (!facData || facData.length === 0) {
            supabase
              .from('facturas')
              .select('*')
              .in('estado', ['Pendiente', 'Por Verificar', 'Abonado'])
              .eq('contribuyente', viewData.Contribuyente)
              .order('emision', { ascending: true })
              .then(({ data: facByName }) => applyDynamicInvoices(facByName || []));
          } else {
            applyDynamicInvoices(facData || []);
          }`;

content = content.replace(target, replacement);
fs.writeFileSync(file, content);
console.log('Patched contribuyentes/page.tsx successfully!');
