'use client';
import { useState, useEffect, useRef } from 'react';
import { Search, Camera, CreditCard, Landmark, CheckCircle2, XCircle, AlertCircle, ChevronLeft, Send, Upload, ArrowRight, FileDown } from 'lucide-react';
import { useAppContext } from '@/store/AppContext';
import { supabase } from '@/lib/supabase';
import jsPDF from 'jspdf';
import { logAudit } from '@/lib/audit';
import autoTable from 'jspdf-autotable';
import { logos } from '@/lib/logosBase64';

type Step = 'search' | 'account' | 'pay' | 'success';
type PayMethod = 'Debito' | 'Transferencia';

interface Recibo { referencia: string; emision: string; estado: string; monto: string; identidad?: string; contribuyente?: string; }
interface Inmueble { inmueble: string; cant_inmuebles?: string | number; mmv_mes?: string | number; tipo?: string; clasificacion?: string; actividad_principal?: string; direccion?: string; identidad?: string; }
interface Contribuyente { Contribuyente: string; Identidad: string; Telefono?: string; Direccion?: string; SaldoFavor?: number; }

const BANCOS = [
  'Banco de Venezuela','Banesco','Mercantil','BBVA Provincial',
  'Bicentenario','Venezolano de Crédito','Sofitasa','Bancaribe',
  'BNC','Del Tesoro','Agrícola de Venezuela','Exterior','Otro'
];
const MESES = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
const mesLabel = (d: string) => {
  if (!d) return '';
  const p = d.split('-');
  return p.length >= 2 ? `${MESES[parseInt(p[1]) - 1]} ${p[0]}` : d;
};
const fmtBs = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CobroMovilPage() {
  const { contribuyentes, tcmmv } = useAppContext();
  const [step, setStep] = useState<Step>('search');
  const [docType, setDocType] = useState('V');
  const [docNumber, setDocNumber] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [foundUser, setFoundUser] = useState<Contribuyente | null>(null);
  const [recibos, setRecibos] = useState<Recibo[]>([]);
  const [userInms, setUserInms] = useState<Inmueble[]>([]);
  const [selectedRefs, setSelectedRefs] = useState<string[]>([]);
  const [totalSel, setTotalSel] = useState(0);
  const [payMethod, setPayMethod] = useState<PayMethod>('Debito');
  const [banco, setBanco] = useState('Banco de Venezuela');
  const [referencia, setReferencia] = useState('');
  const [montoIngresado, setMontoIngresado] = useState('');
  
  const handleMontoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(/\D/g, '');
    if (!raw) {
      setMontoIngresado('');
      return;
    }
    let valStr = parseInt(raw, 10).toString();
    while (valStr.length < 3) valStr = '0' + valStr;
    const dec = valStr.slice(-2);
    let intg = valStr.slice(0, -2);
    intg = intg.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    setMontoIngresado(intg + ',' + dec);
  };
  const [fechaTx, setFechaTx] = useState(new Date().toISOString().split('T')[0]);
  const [comprobante, setComprobante] = useState<File | null>(null);
  const [comprobantePreview, setComprobantePreview] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [successData, setSuccessData] = useState<{ monto: number; referencia: string; estado: string; banco: string } | null>(null);
  const [payError, setPayError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  const getReciboMonto = (r: Recibo): number => {
    if (r.estado === 'Abonado') return parseFloat(String(r.monto || '0').replace(/[^\d.]/g, '')) || 0;
    if (!tcmmv || tcmmv <= 0) return parseFloat(String(r.monto || '0').replace(/[^\d.]/g, '')) || 0;
    if (r.referencia?.startsWith('CM-')) {
      const matched = userInms.find(i => i.inmueble && r.referencia.includes(i.inmueble));
      if (matched) {
        const cant = parseFloat(String(matched.cant_inmuebles || 1));
        const mmv = parseFloat(String(matched.mmv_mes || 0));
        if (mmv > 0) return parseFloat((cant * mmv * tcmmv).toFixed(2));
      }
      return userInms.reduce((s, i) => {
        const cant = parseFloat(String(i.cant_inmuebles || 1));
        const mmv = parseFloat(String(i.mmv_mes || 0));
        return s + (mmv > 0 ? cant * mmv * tcmmv : 0);
      }, 0);
    }
    return parseFloat(String(r.monto || '0').replace(/[^\d.]/g, '')) || 0;
  };

  useEffect(() => {
    const t = selectedRefs.reduce((s, ref) => {
      const f = recibos.find(r => r.referencia === ref);
      return s + (f ? getReciboMonto(f) : 0);
    }, 0);
    setTotalSel(parseFloat(t.toFixed(2)));
  }, [selectedRefs, recibos, userInms, tcmmv]);


  const handleDownloadPDF = async () => {
    if (!foundUser) return;
    const today = new Date();
    const tasaVigente = today.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const cajero = localStorage.getItem('adminUser') || 'Cobrador';
    const MESES_FULL = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
    const getMes = (d: string) => {
      const p = d?.split('-');
      return p?.length >= 2 ? `${MESES_FULL[parseInt(p[1])-1]}-${p[0]}` : d || '—';
    };

    // â”€â”€ Consultar TODOS los meses pendientes directamente en Supabase â”€â”€
    let todasDeudas: Recibo[] = [];
    try {
      const idOrig = (foundUser.Identidad || '').trim();
      const idClean = idOrig.replace(/-/g, '').toUpperCase();
      const orFiltros = [`identidad.eq.${idOrig}`];
      if (idClean !== idOrig) orFiltros.push(`identidad.eq.${idClean}`);
      const { data: dbFacturas } = await supabase
        .from('facturas')
        .select('*')
        .or(orFiltros.join(','))
        .in('estado', ['Pendiente', 'Abonado'])
        .order('emision', { ascending: true });
      if (dbFacturas && dbFacturas.length > 0) {
        todasDeudas = dbFacturas as Recibo[];
      } else {
        const { data: fb } = await supabase
          .from('facturas').select('*')
          .eq('contribuyente', foundUser.Contribuyente || '')
          .in('estado', ['Pendiente', 'Abonado'])
          .order('emision', { ascending: true });
        if (fb) todasDeudas = fb as Recibo[];
      }
    } catch {
      todasDeudas = recibos;
    }

    // ── En lugar de usar solo el primer inmueble, generar un PDF por cada inmueble ──
    const inmueblesAProcesar = userInms.length > 0 
      ? userInms 
      : [{ inmueble: 'Principal', tipo: 'Residencial', cant_inmuebles: 1, mmv_mes: 0 } as any];

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    let pageAdded = false;

    for (const inm of inmueblesAProcesar) {
      // Filtrar todasDeudas para que solo incluya las deudas de este inmueble (o las genéricas viejas)
      const deudasDelInmueble = todasDeudas.filter(f => {
        if (!f.referencia) return true;
        if (f.referencia.startsWith('CM-')) {
          const match = f.referencia.match(/(I-\d+|C-\d+)/);
          if (match) {
            const refId = match[0];
            return inm.inmueble === refId || inm.cod_cont === refId || (inm as any).Inmueble === refId;
          }
        }
        return true;
      });

      // Si no tiene deudas este inmueble y es multi-local, podemos omitir descargarlo vacío
      // pero si es el único inmueble, lo descargamos igual para que salga en 0.
      if (deudasDelInmueble.length === 0 && inmueblesAProcesar.length > 1) continue;

      if (pageAdded) doc.addPage();
      pageAdded = true;

      const docNro = Math.floor(10000 + Math.random() * 90000);
      try { doc.addImage(logos.isma, 'JPEG', 14, 8, 42, 22); } catch(e) {}
      doc.setFontSize(20); doc.setFont('helvetica', 'bold');
      doc.text('ESTADO DE CUENTA', 105, 16, { align: 'center' });
      doc.setFontSize(9); doc.setTextColor(220, 38, 38);
      doc.text(`TASA VIGENTE HASTA: ${tasaVigente}`, 105, 23, { align: 'center' });
      doc.setTextColor(0, 0, 0);
      doc.setLineWidth(0.3); doc.line(14, 32, 196, 32);
      doc.setFont('helvetica', 'italic');
      doc.text(`Generado por: ${cajero}`, 14, 38);
      doc.setFont('helvetica', 'normal');
      doc.text(`Nro.: ${docNro}`, 196, 38, { align: 'right' });
      doc.line(14, 41, 196, 41);
      const uso = inm.clasificacion || inm.tipo || 'Residencial';
      const area = (inm as any).area ? `${(inm as any).area} Mt2` : '—';
      const codInm = inm.inmueble || 'Principal';
      doc.setFontSize(9);
      doc.text('Código:', 14, 47); doc.setFont('helvetica', 'bold'); doc.text(codInm, 30, 47);
      doc.setFont('helvetica', 'normal'); doc.text('Uso:', 65, 47);
      doc.setFont('helvetica', 'bold'); doc.text(uso, 76, 47);
      doc.setFont('helvetica', 'normal'); doc.text('Área Operativa:', 115, 47);
      doc.setFont('helvetica', 'bold'); doc.text(area, 142, 47);
      doc.setFont('helvetica', 'normal'); doc.text('Identidad:', 162, 47);
      doc.setFont('helvetica', 'bold'); doc.text(foundUser.Identidad, 180, 47);
      doc.setFont('helvetica', 'normal'); doc.text('Nombre o Razón Social:', 14, 54);
      doc.setFont('helvetica', 'bold'); doc.text(foundUser.Contribuyente, 62, 54);
      doc.setFont('helvetica', 'normal');
      const dirInm = (inm as any).direccion || foundUser.Direccion || '';
      const splitDir = doc.splitTextToSize(`Dirección Inmueble: ${dirInm}`, 182);
      doc.text(splitDir, 14, 60);
      let y = 60 + splitDir.length * 5 + 4;
      doc.line(14, y, 196, y); y += 6;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
      doc.text('ESTADO DE CUENTA RESUMIDO', 105, y, { align: 'center' });
      y += 2; doc.line(14, y, 196, y); y += 6;

      const calcM = (f: any): number => {
        if (f.estado === 'Abonado') return parseFloat(String(f.monto || '0').replace(/[^\d.]/g, '')) || 0;
        if (f.referencia?.startsWith('CM-') && tcmmv && tcmmv > 0) {
          const cant = parseFloat(String(inm.cant_inmuebles || 1));
          const mmv = parseFloat(String(inm.mmv_mes || 0));
          if (mmv > 0) return parseFloat((cant * mmv * tcmmv).toFixed(2));
        }
        return parseFloat(String(f.monto || '0').replace(/[^\d.]/g, '')) || 0;
      };

      const totalInm = deudasDelInmueble.reduce((s, f) => s + calcM(f), 0);
      const mesesArr = [...new Set(deudasDelInmueble.map(f => getMes(f.emision)))];
      const periodosLabel = mesesArr.join(', ') || '—';
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      [
        [`Períodos Calculados (${deudasDelInmueble.length}):`, periodosLabel],
        ['Monto Recolección Aseo Urbano Bs.', `Bs. ${totalInm.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`],
        ['Total Exento Bs.', `Bs. ${totalInm.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`],
        ['Base Imponible Bs.', 'Bs. 0,00'],
        ['IVA (16.00%) Bs.', 'Bs. 0,00'],
        ['Total estado de cuenta Bs.', `Bs. ${totalInm.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`],
      ].forEach(([label, value]) => {
        doc.setFont('helvetica', 'normal'); doc.text(label, 14, y);
        doc.setFont('helvetica', 'bold'); doc.text(value, 196, y, { align: 'right' });
        y += 6;
      });
      doc.line(14, y, 196, y); y += 6;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
      doc.text('TOTAL A PAGAR', 14, y);
      doc.text(`Bs. ${totalInm.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`, 196, y, { align: 'right' });
      y += 2; doc.line(14, y, 196, y); y += 8;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
      doc.text('ESTADO DE CUENTA DETALLADO', 105, y, { align: 'center' });
      y += 4;
      try {
        autoTable(doc, {
          startY: y,
          head: [['PERIODO', 'DETALLE', 'RECOLECCIÓN', 'INT REC', 'MULTA', 'IVA', 'TOTAL BS']],
          body: deudasDelInmueble.map(f => {
            const m = calcM(f);
            const det = (inm as any).actividad_principal ? `Aseo ${(inm as any).actividad_principal}` : `Aseo ${((inm as any).tipo || (inm as any).clasificacion || "residencial").toLowerCase()}`;
            return [f.emision || '—', det, m.toLocaleString('es-VE', {minimumFractionDigits:2}), '0,00','0,00','0,00', m.toLocaleString('es-VE', {minimumFractionDigits:2})];
          }),
          theme: 'grid',
          headStyles: { fillColor: [255,255,255], textColor: [0,0,0], fontStyle: 'bold', lineColor:[0,0,0], lineWidth:0.3, halign:'center' },
          styles: { fontSize: 8, cellPadding: 2 },
          columnStyles: { 0:{cellWidth:25}, 1:{cellWidth:48}, 2:{halign:'right'}, 3:{halign:'right'}, 4:{halign:'right'}, 5:{halign:'right'}, 6:{halign:'right', fontStyle:'bold'} }
        });
        y = (doc as any).lastAutoTable.finalY + 8;
      } catch(e) {}
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
      doc.text('INFORMACIÓN PARA PAGOS Y TRANSFERENCIAS', 105, y, { align: 'center' });
      y += 4; doc.line(14, y, 196, y); y += 5;
      doc.setFont('helvetica', 'normal');
      doc.text('Banco:  BANESCO (0134)', 14, y); y += 5;
      doc.text('Cta:    01340415144151031715', 14, y); y += 6;
      doc.setFont('helvetica', 'italic');
      doc.text('Pagos a nombre de: INST SOC MUN PARA EL AMBIENTE R.I.F.: G-200076739', 14, y);

      // ── NOTA EN ROJO AL PIE ──
      y += 10;
      doc.setLineWidth(0.3); doc.setDrawColor(220, 38, 38);
      doc.line(14, y, 196, y); y += 5;
      doc.setDrawColor(0, 0, 0); doc.setFontSize(8);
      doc.setFont('helvetica', 'bolditalic'); doc.setTextColor(220, 38, 38);
      doc.text('IMPORTANTE: Los montos indicados en este estado de cuenta son validos UNICAMENTE para la fecha de emision del presente documento.', 105, y, { align: 'center' });
      y += 5;
      doc.text('La tasa de cambio BCV varia diariamente. Para cancelar en una fecha posterior, solicite un nuevo estado de cuenta actualizado.', 105, y, { align: 'center' });
      doc.setFont('helvetica', 'normal'); doc.setTextColor(0, 0, 0);

    }
    if (pageAdded) doc.save(`Estado_Cuenta_${foundUser.Identidad}_${Date.now()}.pdf`);
  };

  const handleSearch = async () => {
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
        .or(`identidad.eq.${fullDoc},identidad.eq.${fullDocDash},identidad.eq.${idLimpio}`)
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
      .or(`identidad.eq.${user.Identidad},identidad.eq.${fullDoc},identidad.eq.${fullDocDash},identidad.eq.${idLimpio}`);
    const saldoFavor = (inmsDB || []).reduce((s: number, i: any) => s + (parseFloat(i.saldo_favor_bs || '0') || 0), 0);
    setFoundUser({ ...user, SaldoFavor: saldoFavor });
    setUserInms((inmsDB || []) as Inmueble[]);

    // 4. Buscar recibos — misma lógica exacta que Caja
    const identidadClean = (user.Identidad || '').replace(/-/g, '').toUpperCase();
    const { data: allUserFacturas } = await supabase
      .from('facturas')
      .select('*')
      .in('estado', ['Pendiente', 'Por Verificar', 'Abonado'])
      .or(`identidad.eq.${user.Identidad},identidad.eq.${fullDoc},identidad.eq.${identidadClean}`)
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
  };

  const toggleRef = (ref: string) =>
    setSelectedRefs(prev => prev.includes(ref) ? prev.filter(r => r !== ref) : [...prev, ref]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setComprobante(file); setComprobantePreview(URL.createObjectURL(file));
  };

  const handlePay = async () => {
    if (!referencia.trim()) { setPayError('Ingrese el número de referencia'); return; }
        const montoLimpio = montoIngresado.replace(/\./g, '').replace(',', '.');
    if (!montoIngresado || isNaN(parseFloat(montoLimpio))) { setPayError('Ingrese el monto cobrado'); return; }
    if (!foundUser) return;
    setPayError(''); setIsProcessing(true);
    const cajero = localStorage.getItem('adminUser') || 'Cobrador';
    const montoReal = parseFloat(montoLimpio);
    try {
      let comprobanteUrl = '';
      if (comprobante) {
        const ext = comprobante.name.split('.').pop() || 'jpg';
        const fp = `comprobantes/movil_${(foundUser.Identidad || 'x').replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.${ext}`;
        const { data: up, error: upE } = await supabase.storage.from('comprobantes').upload(fp, comprobante, { upsert: true });
        if (!upE && up) comprobanteUrl = supabase.storage.from('comprobantes').getPublicUrl(fp).data?.publicUrl || '';
      }
      const estado = payMethod === 'Debito' ? 'Aprobado' : 'Por Verificar';
      await supabase.from('pagos_reportados').insert({
        identidad: foundUser.Identidad, monto: montoReal, banco, referencia,
        tipo: payMethod, estado,
        detalles: JSON.stringify({ recibos: selectedRefs, comprobante_url: comprobanteUrl, origen: 'cobro_movil', cajero })
      });
      if (payMethod === 'Debito') {
        let dinero = montoReal;
        for (const ref of selectedRefs) {
          const fac = recibos.find(r => r.referencia === ref); if (!fac) continue;
          const mFac = getReciboMonto(fac);
          if (dinero >= mFac) { await supabase.from('facturas').update({ estado: 'Pagado' }).eq('referencia', ref); dinero -= mFac; }
          else if (dinero > 0) { await supabase.from('facturas').update({ monto: (mFac - dinero).toFixed(2), estado: 'Abonado' }).eq('referencia', ref); dinero = 0; }
        }
      } else {
        if (selectedRefs.length > 0) await supabase.from('facturas').update({ estado: 'Por Verificar' }).in('referencia', selectedRefs);
      }
      logAudit('Cobro desde Cobro Móvil', {
        contribuyente: foundUser?.Contribuyente,
        identidad: foundUser?.Identidad,
        monto_bs: montoReal,
        metodo: payMethod,
        meses: selectedRefs.length,
        referencias: selectedRefs,
      }, 'COBRO');
      setSuccessData({ monto: montoReal, referencia, estado, banco }); setStep('success');
    } catch (err: unknown) {
      setPayError('Error: ' + (err instanceof Error ? err.message : 'desconocido'));
    }
    setIsProcessing(false);
  };

  const reset = () => {
    setStep('search'); setDocNumber(''); setRecibos([]); setFoundUser(null);
    setSelectedRefs([]); setReferencia(''); setMontoIngresado('');
    setComprobante(null); setComprobantePreview('');
  };

  const inp = 'w-full bg-slate-800 text-white rounded-2xl px-5 py-4 text-base border border-slate-700 focus:outline-none focus:border-emerald-500 placeholder-slate-500';

  return (
    <div style={{ WebkitTapHighlightColor: 'transparent' } as React.CSSProperties} className="flex flex-col flex-1">

      {/* SEARCH */}
      {step === 'search' && (
        <div className="flex flex-col flex-1 px-5 pt-8 pb-6 gap-5">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-3">
              <Search className="w-8 h-8 text-emerald-400" />
            </div>
            <h1 className="text-white text-xl font-bold">Buscar Contribuyente</h1>
            <p className="text-slate-400 text-sm mt-1">Cédula, RIF o nombre</p>
          </div>
          <div className="flex gap-2">
            <select value={docType} onChange={e => setDocType(e.target.value)}
              className="bg-slate-800 text-white rounded-2xl px-3 py-4 text-base font-bold border border-slate-700 focus:outline-none focus:border-emerald-500 text-center min-w-[64px]">
              {['V','J','E','G','P'].map(t => <option key={t}>{t}</option>)}
            </select>
            <input type="text" value={docNumber} onChange={e => setDocNumber(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Número o nombre..." className={inp} autoComplete="off" />
          </div>
          {searchError && (
            <div className="flex items-center gap-2 text-red-400 bg-red-400/10 rounded-2xl px-4 py-3 text-sm">
              <XCircle className="w-5 h-5 shrink-0" />{searchError}
            </div>
          )}
          <button onClick={handleSearch} disabled={isSearching || !docNumber.trim()}
            className="w-full bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-5 rounded-2xl text-lg active:scale-95 flex items-center justify-center gap-2">
            {isSearching
              ? <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <><Search className="w-5 h-5" />Buscar</>}
          </button>
        </div>
      )}

      {/* ACCOUNT */}
      {step === 'account' && foundUser && (
        <div className="flex flex-col flex-1" style={{ minHeight: 0 }}>
          <div className="bg-slate-800 border-b border-slate-700 px-4 py-4 flex items-start gap-3">
            <button onClick={() => { setStep('search'); setDocNumber(''); }} className="mt-0.5 text-slate-400">
              <ChevronLeft className="w-6 h-6" />
            </button>
            <div className="flex-1 min-w-0">
              <div className="text-white font-bold text-base truncate">{foundUser.Contribuyente}</div>
              <div className="text-emerald-400 text-sm font-mono">{foundUser.Identidad}</div>
              {(foundUser.SaldoFavor ?? 0) > 0 && <div className="text-xs text-emerald-300 mt-0.5">Saldo a favor: Bs. {fmtBs(foundUser.SaldoFavor ?? 0)}</div>}
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <div className="text-slate-400 text-xs">{recibos.length} recibos</div>
              <button onClick={handleDownloadPDF}
                className="flex items-center gap-1.5 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 text-xs font-semibold px-3 py-1.5 rounded-xl border border-emerald-500/30 active:scale-95 transition-all">
                <FileDown className="w-3.5 h-3.5" />PDF
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pt-4 pb-32">
            {recibos.length === 0 ? (
              <div className="text-center py-16">
                <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto mb-3" />
                <p className="text-white font-semibold text-lg">Contribuyente solvente</p>
                <p className="text-slate-400 text-sm mt-1">No hay recibos pendientes</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <button onClick={() => selectedRefs.length === recibos.length ? setSelectedRefs([]) : setSelectedRefs(recibos.map(r => r.referencia))}
                  className="flex items-center justify-between bg-slate-800/60 rounded-2xl px-4 py-3 border border-slate-700">
                  <span className="text-slate-300 text-sm font-medium">
                    {selectedRefs.length === recibos.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
                  </span>
                  <span className="text-emerald-400 text-sm font-bold">{selectedRefs.length}/{recibos.length}</span>
                </button>
                {recibos.map(r => {
                  const monto = getReciboMonto(r);
                  const sel = selectedRefs.includes(r.referencia);
                  const inm = userInms.find(i => i.inmueble && r.referencia.includes(i.inmueble));
                  const inDesc = inm ? [inm.tipo, inm.actividad_principal].filter(Boolean).join(' Â· ') || inm.clasificacion || '' : '';
                  return (
                    <button key={r.referencia} onClick={() => toggleRef(r.referencia)}
                      className={'w-full flex items-center gap-4 px-4 py-4 rounded-2xl border active:scale-[0.98] text-left ' +
                        (sel ? 'bg-emerald-500/15 border-emerald-500/60' : 'bg-slate-800 border-slate-700')}>
                      <div className={'w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 ' +
                        (sel ? 'bg-emerald-500 border-emerald-500' : 'border-slate-600')}>
                        {sel && <CheckCircle2 className="w-4 h-4 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-white font-mono text-sm font-semibold truncate">{r.referencia}</div>
                        <div className="text-slate-400 text-xs mt-0.5">{mesLabel(r.emision)}</div>
                        {inm && <div className="text-emerald-400 text-[11px] mt-0.5 truncate">{inm.inmueble}{inDesc ? ' Â· ' + inDesc : ''}</div>}
                      </div>
                      <div className={'text-base font-bold shrink-0 ' + (sel ? 'text-emerald-400' : 'text-white')}>
                        {fmtBs(monto)}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {recibos.length > 0 && (
            <div className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-sm border-t border-slate-700 px-5 py-4">
              <div className="max-w-lg mx-auto flex items-center gap-4">
                <div className="flex-1">
                  <div className="text-slate-400 text-xs">{selectedRefs.length} seleccionado(s)</div>
                  <div className="text-white font-bold text-xl">Bs. {fmtBs(totalSel)}</div>
                </div>
                <button onClick={() => setStep('pay')} disabled={selectedRefs.length === 0}
                  className="bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-4 px-6 rounded-2xl text-base active:scale-95 flex items-center gap-2">
                  Cobrar <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* PAY */}
      {step === 'pay' && foundUser && (
        <div className="flex flex-col flex-1">
          <div className="bg-slate-800 border-b border-slate-700 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
            <button onClick={() => setStep('account')} className="text-slate-400"><ChevronLeft className="w-6 h-6" /></button>
            <span className="text-white font-bold text-base">Registrar Cobro</span>
          </div>
          <div className="flex-1 overflow-y-auto px-5 pt-5 pb-36 flex flex-col gap-5">
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-5">
              <div className="text-emerald-400 text-xs font-bold uppercase tracking-wide truncate">{foundUser.Contribuyente}</div>
              <div className="text-white font-black mt-1" style={{ fontSize: 28 }}>Bs. {fmtBs(totalSel)}</div>
              <div className="text-slate-400 text-xs mt-1">{selectedRefs.length} recibo(s) Â· Tasa {tcmmv?.toFixed(2)}</div>
            </div>
            <div>
              <label className="text-slate-400 text-xs font-bold uppercase tracking-wide block mb-2">Método de Pago</label>
              <div className="grid grid-cols-2 gap-3">
                {(['Debito', 'Transferencia'] as PayMethod[]).map(m => (
                  <button key={m} onClick={() => setPayMethod(m)}
                    className={'flex flex-col items-center gap-2 py-5 rounded-2xl border text-sm font-bold active:scale-95 ' +
                      (payMethod === m ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-300')}>
                    {m === 'Debito' ? <CreditCard className="w-6 h-6" /> : <Landmark className="w-6 h-6" />}
                    {m === 'Debito' ? 'Débito' : 'Transferencia'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-slate-400 text-xs font-bold uppercase tracking-wide block mb-2">Banco</label>
              <select value={banco} onChange={e => setBanco(e.target.value)} className={inp} style={{ fontSize: 16 }}>
                {BANCOS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className="text-slate-400 text-xs font-bold uppercase tracking-wide block mb-2">NÂº de Referencia</label>
              <input type="tel" value={referencia} onChange={e => setReferencia(e.target.value)}
                placeholder="Ej. 00012345" className={inp} style={{ fontSize: 20 }} />
            </div>
            <div>
              <label className="text-slate-400 text-xs font-bold uppercase tracking-wide block mb-2">Monto Cobrado (Bs.)</label>
              <input type="text" inputMode="numeric" value={montoIngresado} onChange={handleMontoChange}
                placeholder={totalSel.toFixed(2)} className={inp} style={{ fontSize: 24, fontWeight: 700 }} />
            </div>
            <div>
              <label className="text-slate-400 text-xs font-bold uppercase tracking-wide block mb-2">Fecha de Transacción</label>
              <input type="date" value={fechaTx} onChange={e => setFechaTx(e.target.value)} className={inp} style={{ fontSize: 16 }} />
            </div>
            <div>
              <label className="text-slate-400 text-xs font-bold uppercase tracking-wide block mb-2">Foto del Comprobante</label>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => camRef.current?.click()}
                  className="flex flex-col items-center gap-2 bg-slate-800 border border-slate-700 rounded-2xl py-5 text-slate-300 text-sm font-semibold active:bg-slate-700">
                  <Camera className="w-7 h-7" />Tomar Foto
                </button>
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="flex flex-col items-center gap-2 bg-slate-800 border border-slate-700 rounded-2xl py-5 text-slate-300 text-sm font-semibold active:bg-slate-700">
                  <Upload className="w-7 h-7" />Galería
                </button>
              </div>
              <input ref={camRef} type="file" accept="image/*" capture="environment" onChange={handleFile} className="hidden" />
              <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
              {comprobantePreview && (
                <div className="mt-3 relative">
                  <img src={comprobantePreview} alt="Comprobante" className="w-full rounded-2xl object-cover max-h-56" />
                  <button onClick={() => { setComprobante(null); setComprobantePreview(''); }}
                    className="absolute top-2 right-2 bg-red-500/90 text-white rounded-full p-1.5">
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>
            {payError && (
              <div className="flex items-center gap-2 text-red-400 bg-red-400/10 rounded-2xl px-4 py-3 text-sm">
                <AlertCircle className="w-5 h-5 shrink-0" />{payError}
              </div>
            )}
            {payMethod === 'Transferencia' && (
              <p className="text-slate-500 text-xs text-center">La transferencia será revisada en Conciliación Bancaria.</p>
            )}
          </div>
          <div className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-sm border-t border-slate-700 px-5 py-4">
            <div className="max-w-lg mx-auto">
              <button onClick={handlePay} disabled={isProcessing}
                className="w-full bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-5 rounded-2xl text-lg active:scale-95 flex items-center justify-center gap-2">
                {isProcessing
                  ? <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <><Send className="w-5 h-5" />{payMethod === 'Debito' ? 'Confirmar Cobro' : 'Enviar a Verificación'}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUCCESS */}
      {step === 'success' && successData && (
        <div className="flex flex-col flex-1 items-center justify-between px-5 py-8">
          <div className="flex flex-col items-center gap-4 flex-1 justify-center w-full">
            <div className="w-24 h-24 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-400" />
            </div>
            <h2 className="text-white text-2xl font-black text-center">
              {successData.estado === 'Aprobado' ? '¡Cobro Exitoso!' : 'Enviado a Verificación'}
            </h2>
            <p className="text-slate-400 text-sm text-center max-w-xs">
              {successData.estado === 'Aprobado'
                ? 'El pago fue registrado y los recibos actualizados.'
                : 'La transferencia será revisada por el administrador.'}
            </p>
            <div className="w-full bg-slate-800 rounded-2xl p-5 border border-slate-700 flex flex-col gap-4">
              {([
                ['Contribuyente', foundUser?.Contribuyente ?? '', 'text-white font-semibold'],
                ['Monto', 'Bs. ' + fmtBs(successData.monto), 'text-emerald-400 font-black text-xl'],
                ['Referencia', successData.referencia, 'text-white font-mono'],
                ['Banco', successData.banco, 'text-white'],
                ['Estado', successData.estado, successData.estado === 'Aprobado' ? 'text-emerald-400 font-bold' : 'text-yellow-400 font-bold'],
              ] as [string, string, string][]).map(([label, value, cls]) => (
                <div key={label} className="flex justify-between items-center gap-3">
                  <span className="text-slate-400 text-sm shrink-0">{label}</span>
                  <span className={'text-sm text-right truncate ' + cls}>{value}</span>
                </div>
              ))}
            </div>
          </div>
          <button onClick={reset}
            className="w-full bg-emerald-500 text-white font-bold py-5 rounded-2xl text-lg active:scale-95 mt-6">
            Nuevo Cobro
          </button>
        </div>
      )}
    </div>
  );
}

