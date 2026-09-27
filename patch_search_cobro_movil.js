const fs = require('fs');
const file = '/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/app/cobro-movil/page.tsx';
let content = fs.readFileSync(file, 'utf8');

const target = `    const user: Contribuyente = {
      Identidad: p.identidad,
      Contribuyente: nombreCont || 'Cont. No Registrado',
      Direccion: p.direccion || '',
      Clasificacion: p.clasificacion || 'Residencial',
      Actividad: p.actividad_principal || '',
      EsAgente: (inmsDB as any[]).some(i => i.agente_retencion === true),
    };
    setFoundUser(user);
    setUserInms(inmsDB as Inmueble[]);

    const totalDeudaMMV = inmsDB.reduce((s: number, i: any) => s + parseFloat(i.deuda_mmv || 0), 0);`;

const replacement = `    const user: Contribuyente = {
      Identidad: p.identidad,
      Contribuyente: nombreCont || 'Cont. No Registrado',
      Direccion: p.direccion || '',
      Clasificacion: p.clasificacion || 'Residencial',
      Actividad: p.actividad_principal || '',
      EsAgente: (inmsDB as any[]).some(i => i.agente_retencion === true),
    };
    setFoundUser(user);

    let inmsFinal = [...inmsDB];
    const isCondoByFlag = inmsDB.some((i: any) => i.condominio === 'SI' || i.condominio === 'Si' || i.condominio === 'si');
    const isCondoByName = (user.Contribuyente || '').toLowerCase().includes('condominio') || (user.Actividad || '').toLowerCase().includes('condominio');
    const codCont = p.identidad;
    if (isCondoByFlag || isCondoByName) {
      const { data: hijosByPattern } = await supabase
        .from('inmuebles')
        .select('id,identidad,inmueble,contribuyente,cant_inmuebles,mmv_mes,deuda_mmv,deuda_congelada_bs,clasificacion,direccion,actividad_principal,agente_retencion')
        .ilike('clasificacion', \`%HIJO_DE:\${codCont}%\`);
      if (hijosByPattern && hijosByPattern.length > 0) {
        // En naguanagua vieja, usualmente la clasificacion de los hijos tenia HIJO_DE:Cod_Padre
        inmsFinal = [...inmsFinal, ...hijosByPattern];
      } else {
        // También intentar por el inmueble padre (usualmente condominios principales son hijos de SU PROPIO INMUEBLE)
        const padrePrincipal = inmsDB.find((i: any) => i.condominio === 'SI' || i.condominio === 'Si');
        if (padrePrincipal) {
          const { data: hijosById } = await supabase
            .from('inmuebles')
            .select('id,identidad,inmueble,contribuyente,cant_inmuebles,mmv_mes,deuda_mmv,deuda_congelada_bs,clasificacion,direccion,actividad_principal,agente_retencion,condominio,multa_bs,meses_deuda')
            .ilike('clasificacion', \`%HIJO_DE:\${padrePrincipal.inmueble}%\`);
          if (hijosById && hijosById.length > 0) {
            // merge sin duplicados
            const ids = new Set(inmsFinal.map(x => x.id));
            hijosById.forEach(h => {
              if (!ids.has(h.id)) inmsFinal.push(h);
            });
          }
        }
      }
    }
    setUserInms(inmsFinal as Inmueble[]);

    const totalDeudaMMV = inmsFinal.reduce((s: number, i: any) => s + parseFloat(i.deuda_mmv || 0), 0);`;

if(content.includes(target)){
    content = content.replace(target, replacement);
    fs.writeFileSync(file, content);
    console.log("Success");
} else {
    console.log("Target not found");
}
