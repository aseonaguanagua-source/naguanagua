const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../src/app/cobro-movil/page.tsx');
let content = fs.readFileSync(file, 'utf8');

const target = `    const variants = getIdentidadVariants(inputClean, activePrefix);
    const orFilter = variants.map(v => \`identidad.eq.\${v}\`).join(',');

    // 1. Buscar en inmuebles con todas las variantes
    let { data: inmsDB } = await supabase.from('inmuebles')
      .select('id,identidad,inmueble,contribuyente,cant_inmuebles,mmv_mes,deuda_mmv,deuda_congelada_bs,clasificacion,tipo,direccion,actividad_principal,agente_retencion,multa_bs,meses_deuda,es_condominio,condominio_padre_id,notas')
      .or(orFilter);

    // 2. Si no se encontró por identidad directa, buscar por código de inmueble (ej: URB002290)
    if (!inmsDB || inmsDB.length === 0) {
      const { data: byInmCode } = await supabase.from('inmuebles')
        .select('id,identidad,inmueble,contribuyente,cant_inmuebles,mmv_mes,deuda_mmv,deuda_congelada_bs,clasificacion,tipo,direccion,actividad_principal,agente_retencion,multa_bs,meses_deuda,es_condominio,condominio_padre_id,notas')
        .ilike('inmueble', \`%\${inputClean}%\`)
        .limit(10);
      if (byInmCode && byInmCode.length > 0) inmsDB = byInmCode;
    }

    // 3. Si aún no se encontró, resolver identidad oficial en la tabla contribuyentes
    if (!inmsDB || inmsDB.length === 0) {
      const { data: cMatches } = await supabase.from('contribuyentes')
        .select('*')
        .or(orFilter)
        .limit(1);

      if (cMatches && cMatches.length > 0) {
        const officialId = cMatches[0].identidad;
        const cVariants = getIdentidadVariants(officialId);
        const { data: inmsByContrib } = await supabase.from('inmuebles')
          .select('id,identidad,inmueble,contribuyente,cant_inmuebles,mmv_mes,deuda_mmv,deuda_congelada_bs,clasificacion,tipo,direccion,actividad_principal,agente_retencion,multa_bs,meses_deuda,es_condominio,condominio_padre_id,notas')
          .or(cVariants.map(v => \`identidad.eq.\${v}\`).join(','));
        if (inmsByContrib && inmsByContrib.length > 0) {
          inmsDB = inmsByContrib;
        }
      }
    }

    if (inmsDB && inmsDB.length > 0) {
      const activeInms = inmsDB.filter((i: any) => !i.condominio_padre_id && !i.es_condominio);
      if (activeInms.length === 0 && inmsDB.some((i: any) => i.condominio_padre_id || i.es_condominio)) {
        setSearchError('Sus propiedades pertenecen a Condominios. El cobro móvil solo está habilitado para inmuebles regulares.');
        setIsSearching(false);
        return;
      }
      inmsDB = activeInms;
    }

    if (!inmsDB || inmsDB.length === 0) {
      setSearchError('No encontrado. Verifique su Cédula o RIF.');
      setIsSearching(false);
      return;
    }

    const p = inmsDB[0];

    // Sincronizar el prefijo visual en el dropdown si es distinto
    if (p.identidad && /^[A-Z]-/i.test(p.identidad)) {
      const detectedPrefix = p.identidad.charAt(0).toUpperCase();
      if (detectedPrefix !== docType) setDocType(detectedPrefix);
    }

    let nombreCont = p.contribuyente;
    
    // Si no tiene contribuyente en el inmueble, intentar buscar en facturas
    if (!nombreCont) {
      const { data: fNombre } = await supabase.from('facturas')
        .select('contribuyente').eq('identidad', p.identidad)
        .not('contribuyente', 'is', null).limit(1);
      if (fNombre && fNombre.length > 0 && fNombre[0].contribuyente) {
        nombreCont = fNombre[0].contribuyente;
      }
    }

    // Si aún no tiene nombre, buscar en la tabla oficial de contribuyentes
    if (!nombreCont) {
      const { data: cNombre } = await supabase.from('contribuyentes')
        .select('nombre')
        .or(orFilter)
        .not('nombre', 'is', null)
        .limit(1);
      if (cNombre && cNombre.length > 0 && cNombre[0].nombre) {
        nombreCont = cNombre[0].nombre;
      }
    }

    const user: Contribuyente = {
      Contribuyente: nombreCont || 'Sin Nombre Registrado',
      Identidad: p.identidad,
      Direccion: p.direccion,
      Clasificacion: p.clasificacion,
      Actividad: p.actividad_principal,
      EsAgente: inmsDB.some((i: any) => i.agente_retencion)
    };

    setFoundUser(user);
    setUserInms(inmsDB);

    const { data: recDB } = await supabase.from('pagos_reportados')
      .select('*')
      .eq('identidad', p.identidad)
      .order('created_at', { ascending: false });

    const { data: facDB } = await supabase.from('facturas')
      .select('*')
      .eq('identidad', p.identidad)
      .order('created_at', { ascending: false });`;

const replacement = `    try {
      const res = await fetch(\`/api/cobro-movil/buscar?q=\${encodeURIComponent(inputClean)}\`);
      const data = await res.json();
      
      if (!res.ok) {
        setSearchError(data.error || 'Error al buscar el contribuyente.');
        setIsSearching(false);
        return;
      }

      const inmsDB = data.inmuebles;
      const c = data.foundUser;

      // Sincronizar el prefijo visual en el dropdown si es distinto
      if (c.Identidad && /^[A-Z]-/i.test(c.Identidad)) {
        const detectedPrefix = c.Identidad.charAt(0).toUpperCase();
        if (detectedPrefix !== docType) setDocType(detectedPrefix);
      }

      setFoundUser(c);
      setUserInms(inmsDB);

      const recDB = data.pagos;
      const facDB = data.facturas;`;

if (!content.includes(target)) {
  console.log("Target not found!");
} else {
  content = content.replace(target, replacement);
  fs.writeFileSync(file, content);
  console.log("Patched successfully!");
}

