const fs = require('fs');
let path = '/Users/davidzara/Documents/naguanagua_zero/Plantilla_Municipio/src/app/api/get-all-data/route.ts';
let c = fs.readFileSync(path, 'utf8');

c = c.replace("return NextResponse.json({", 
`    // Fetch Condominios explicitly
    const { data: condominiosRaw } = await supabase.from('inmuebles')
      .select('id, inmueble, identidad, actividad_principal, direccion, estado, created_at, cant_inmuebles')
      .ilike('actividad_principal', '%[CONDOMINIO]%');
      
    const condominios = (condominiosRaw || []).map(inm => ({
        id: inm.id,
        codigo: inm.inmueble,
        identidad: inm.identidad,
        nombre: 'Condominio ' + inm.inmueble,
        direccion: inm.direccion || '',
        unidades: parseInt(inm.cant_inmuebles || '0'),
        representante: 'N/A',
        estado: inm.estado || 'Activo',
        created_at: inm.created_at
    }));

    // Add condominios to mergedInmuebles so they are in the search if needed
    // But they are already mostly fast.
    
    return NextResponse.json({
      condominios,
`);

fs.writeFileSync(path, c, 'utf8');
