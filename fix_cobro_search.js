const fs = require('fs');
const path = 'c:/Users/david/Desktop/tucacas/global_green_tucacas/src/app/cobro-movil/page.tsx';
let c = fs.readFileSync(path, 'utf8');

const oldSearch = `  const handleSearch = async () => {
    if (!docNumber.trim()) return;
    setIsSearching(true); setSearchError('');
    const idLimpio = docNumber.replace(/-/g, '').toUpperCase();
    const fullDoc = docType + idLimpio;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let user: Contribuyente | null = (contribuyentes as any[]).find((c: any) => {
      const id = (c.Identidad || '').replace(/-/g, '').toUpperCase();
      return id === fullDoc || id === idLimpio || (c.Contribuyente || '').toUpperCase().includes(docNumber.toUpperCase());
    }) || null;
    if (!user) {
      const { data } = await supabase.from('inmuebles').select('*')
        .or(\`identidad.eq.\${fullDoc},identidad.eq.\${idLimpio}\`).limit(1).maybeSingle();
      if (data) user = { Identidad: data.identidad, Contribuyente: data.contribuyente, Telefono: data.telefono };
    }
    if (!user) { setSearchError('Contribuyente no encontrado'); setIsSearching(false); return; }
    const { data: inmsDB } = await supabase.from('inmuebles').select('*')
      .or(\`identidad.eq.\${user.Identidad},identidad.eq.\${fullDoc}\`);
    const saldoFavor = (inmsDB || []).reduce((s: number, i: any) => s + (parseFloat(i.saldo_favor_bs || '0') || 0), 0);
    setFoundUser({ ...user, SaldoFavor: saldoFavor });
    setUserInms((inmsDB || []) as Inmueble[]);
    const { data: facts } = await supabase.from('facturas').select('*')
      .in('estado', ['Pendiente', 'Abonado', 'Por Verificar'])
      .or(\`identidad.eq.\${user.Identidad},identidad.eq.\${fullDoc},identidad.eq.\${idLimpio}\`)
      .order('emision', { ascending: true });
    setRecibos((facts || []) as Recibo[]);
    setStep('account'); setIsSearching(false);
  };`;

const newSearch = `  const handleSearch = async () => {
    if (!docNumber.trim()) return;
    setIsSearching(true); setSearchError('');

    const idLimpio = docNumber.replace(/-/g, '').toUpperCase();
    const fullDoc = docType + idLimpio;           // ej. V12345678
    const fullDocDash = docType + '-' + idLimpio; // ej. V-12345678

    // 1. Buscar en contexto React
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let user: Contribuyente | null = (contribuyentes as any[]).find((c: any) => {
      const id = (c.Identidad || '').replace(/-/g, '').toUpperCase();
      return id === fullDoc || id === idLimpio ||
        (c.Contribuyente || '').toUpperCase().includes(docNumber.toUpperCase());
    }) || null;

    // 2. Fallback: buscar en tabla inmuebles
    if (!user) {
      const { data } = await supabase.from('inmuebles').select('*')
        .or(\`identidad.eq.\${fullDoc},identidad.eq.\${fullDocDash},identidad.eq.\${idLimpio}\`)
        .limit(1).maybeSingle();
      if (data) user = {
        Identidad: data.identidad,
        Contribuyente: data.contribuyente,
        Telefono: data.telefono,
        Direccion: data.direccion
      };
    }

    if (!user) { setSearchError('Contribuyente no encontrado'); setIsSearching(false); return; }

    // 3. Obtener inmuebles
    const { data: inmsDB } = await supabase.from('inmuebles').select('*')
      .or(\`identidad.eq.\${user.Identidad},identidad.eq.\${fullDoc},identidad.eq.\${fullDocDash},identidad.eq.\${idLimpio}\`);
    const saldoFavor = (inmsDB || []).reduce((s: number, i: any) => s + (parseFloat(i.saldo_favor_bs || '0') || 0), 0);
    setFoundUser({ ...user, SaldoFavor: saldoFavor });
    setUserInms((inmsDB || []) as Inmueble[]);

    // 4. Buscar facturas — misma lógica exacta que Caja
    const identidadClean = (user.Identidad || '').replace(/-/g, '').toUpperCase();
    const { data: allUserFacturas } = await supabase
      .from('facturas')
      .select('*')
      .in('estado', ['Pendiente', 'Por Verificar', 'Abonado'])
      .or(\`identidad.eq.\${user.Identidad},identidad.eq.\${fullDoc},identidad.eq.\${identidadClean}\`)
      .order('emision', { ascending: true });

    // 5. Fallback por nombre del contribuyente
    let fallbackFacturas: Recibo[] = [];
    if ((allUserFacturas || []).length === 0 && user.Contribuyente) {
      const { data: fByName } = await supabase
        .from('facturas')
        .select('*')
        .in('estado', ['Pendiente', 'Por Verificar'])
        .eq('contribuyente', user.Contribuyente)
        .order('emision', { ascending: true });
      if (fByName && fByName.length > 0) {
        fallbackFacturas = fByName as Recibo[];
        // Backfill identidad para búsquedas futuras
        const idsToUpdate = fByName.map((f: any) => f.id);
        await supabase.from('facturas').update({ identidad: user.Identidad }).in('id', idsToUpdate);
      }
    }

    // 6. Combinar y ordenar: RECIB- primero, CM- después (igual que Caja)
    const combined = [...(allUserFacturas || []), ...fallbackFacturas] as Recibo[];
    combined.sort((a, b) => {
      const aIsCM = a.referencia?.startsWith('CM-');
      const bIsCM = b.referencia?.startsWith('CM-');
      if (!aIsCM && bIsCM) return -1;
      if (aIsCM && !bIsCM) return 1;
      return (a.emision || '').localeCompare(b.emision || '');
    });

    setRecibos(combined);
    setStep('account');
    setIsSearching(false);
  };`;

if (!c.includes(oldSearch.substring(0, 80))) {
  console.log('❌ Old search function not found as expected, trying substring match...');
  // Try to find by key signature
  const startMark = '  const handleSearch = async () => {';
  const idx = c.indexOf(startMark);
  if (idx === -1) { console.log('❌ handleSearch not found at all'); process.exit(1); }
  // Find the closing }; of the function
  let depth = 0, i = idx, endIdx = -1;
  while (i < c.length) {
    if (c[i] === '{') depth++;
    if (c[i] === '}') { depth--; if (depth === 0) { endIdx = i + 1; break; } }
    i++;
  }
  if (endIdx === -1) { console.log('❌ Cannot find end of handleSearch'); process.exit(1); }
  // consume trailing ;
  if (c[endIdx] === ';') endIdx++;
  c = c.substring(0, idx) + newSearch + c.substring(endIdx);
} else {
  c = c.replace(oldSearch, newSearch);
}

fs.writeFileSync(path, c);
console.log('✅ handleSearch updated with robust Caja logic (fallback by name + backfill + proper sort)');
