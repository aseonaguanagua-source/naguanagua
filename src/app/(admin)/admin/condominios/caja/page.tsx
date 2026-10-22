'use client';

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Building2, Search, RefreshCw, AlertTriangle, Wallet, CheckCircle2, X, Printer, ShieldAlert, Power,
  Receipt, Layers, ArrowLeft, FlaskConical, Users, UserSearch, FileText, Calendar, StickyNote,
} from 'lucide-react';
import { SelectorModulo } from '@/components/condominios/SelectorModulo';
import { getCajeroId } from '@/lib/cajaHelpers';
import { LISTA_BANCOS } from '@/lib/bancos';
import { supabase } from '@/lib/supabase';
import { formatBs } from '@/lib/formatCurrency';
import { acreditarSaldoFavor } from '@/lib/saldoFavor';
import { obtenerTasaEuroFecha, fechaDMY, valorUCD } from '@/lib/tasaHistorica';
import { periodosMultasPrevias } from '@/lib/condominios/motor';

const fmtBs = (n: number) => (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
import { parseLocalFloat, formatLocalNumberInput, getIdentidadVariantsExact } from '@/lib/formatters';
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const fmtPeriodo = (p: string) => { const [y, m] = String(p).split('-'); return `${MESES[parseInt(m) - 1]} ${y}`; };
const rango = (ps: string[]) => !ps?.length ? '' : ps.length === 1 ? fmtPeriodo(ps[0]) : `${fmtPeriodo(ps[0])} – ${fmtPeriodo(ps[ps.length - 1])}`;
const METODOS = [
  ['Transferencia', 'Transferencia'], ['Debito', 'Tarjeta de débito'], ['Credito', 'Tarjeta de crédito'],
  ['TMD', 'Punto TMD (Master)'], ['TVD', 'Punto TVD (Visa)'], ['Deposito', 'Depósito'], ['Saldo a Favor', 'Saldo a Favor']
] as const;
const MODALIDAD: Record<string, string> = {
  CENTRALIZADO: 'Centralizado: el condominio paga todo', MIXTO_COMERCIAL: 'Mixto comercial',
  INDIVIDUAL: 'Pago individual: cada unidad paga lo suyo', TARIFA_FIJA: 'Tarifa fija',
};

function usuario() { try { return JSON.parse(localStorage.getItem('admin_user_data') || '{}'); } catch { return {}; } }

function Caja() {
  const sp = useSearchParams();
  const router = useRouter();
  const [activa, setActiva] = useState<boolean | null>(null);
  const [admin, setAdmin] = useState(false);
  const [q, setQ] = useState('');
  const [res, setRes] = useState<{ condominios: any[]; unidades: any[] } | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [codigo, setCodigo] = useState(sp.get('codigo') || '');
  const [cobro, setCobro] = useState<any>(null);
  const [calculando, setCalculando] = useState(false);
  const [error, setError] = useState('');
  const [claves, setClaves] = useState<string[]>(sp.get('unidad') ? [sp.get('unidad') as string] : []);
  const [meses, setMeses] = useState<number | ''>('');
  const [mesesPorUnidad, setMesesPorUnidad] = useState<Record<string, number>>({});
  const [filtroU, setFiltroU] = useState('');
  const [estadoBase, setEstadoBase] = useState<any>(null);
  // modo de pago: lo escoge el cajero
  const [modo, setModo] = useState<'CONDOMINIO' | 'CONTRIBUYENTE'>(sp.get('cedula') || sp.get('unidad') ? 'CONTRIBUYENTE' : 'CONDOMINIO');
  const [abonoLocales, setAbonoLocales] = useState(false);
  const [identidad, setIdentidad] = useState(sp.get('cedula') || '');
  const [soloMultas, setSoloMultas] = useState(false);
  const [incluirMultas, setIncluirMultas] = useState(false);
  const [modalContacto, setModalContacto] = useState(false);
  const [contactoTelefono, setContactoTelefono] = useState('');
  const [contactoCorreo, setContactoCorreo] = useState('');
  const [guardandoContacto, setGuardandoContacto] = useState(false);
  const [contactoOmitido, setContactoOmitido] = useState(false);
  const [modalNotas, setModalNotas] = useState(false);
  const [notaCondominio, setNotaCondominio] = useState('');
  const [guardandoNota, setGuardandoNota] = useState(false);
  const [tasaOverrideStr, setTasaOverrideStr] = useState('');
  const hoyCaracas = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
  const [fechaOverrideStr, setFechaOverrideStr] = useState(hoyCaracas);
  const [tasaFechaInfo, setTasaFechaInfo] = useState('');
  const [cargandoTasaFecha, setCargandoTasaFecha] = useState(false);
  /** Carga la tasa oficial BCV del Euro vigente en la fecha elegida (hoy = tasa automática). */
  const aplicarTasaDeFecha = async (fecha: string) => {
    if (!fecha) return;
    const hoy = hoyCaracas();
    if (fecha > hoy) { alert('No se puede usar una fecha futura.'); return; }
    if (fecha === hoy) { setTasaOverrideStr(''); setTasaFechaInfo(''); return; }
    setCargandoTasaFecha(true);
    try {
      const { euro, fechaValor } = await obtenerTasaEuroFecha(fecha);
      setTasaOverrideStr(String(euro).replace('.', ','));
      setTasaFechaInfo(`Tasa BCV Euro del ${fechaDMY(fecha)}${fechaValor !== fecha ? ` (fecha valor ${fechaDMY(fechaValor)})` : ''}`);
    } catch (e: any) {
      alert(e?.message || 'No se pudo obtener la tasa de esa fecha');
    } finally {
      setCargandoTasaFecha(false);
    }
  };
  // pago
  const [metodo, setMetodo] = useState('Transferencia');
  const [banco, setBanco] = useState('');
  const [referencia, setReferencia] = useState('');
  const [cobrando, setCobrando] = useState(false);
  const [recibo, setRecibo] = useState<any>(null);
  const pagoId = useRef<string>('');
  // multipago
  const [pagosAgregados, setPagosAgregados] = useState<any[]>([]);
  const [metodoAct, setMetodoAct] = useState('Transferencia');
  const [bancoAct, setBancoAct] = useState('Banco de Venezuela');
  const [bancoDestinoAct, setBancoDestinoAct] = useState('BANCAMIGA - 0172 - 0717');
  const [referenciaAct, setReferenciaAct] = useState('');
  const [montoAct, setMontoAct] = useState('');
  const [comprobanteAct, setComprobanteAct] = useState<File | null>(null);
  const [fechaAct, setFechaAct] = useState(new Date().toISOString().slice(0, 10));
  const [fechaTransaccionAct, setFechaTransaccionAct] = useState(new Date().toISOString().slice(0, 10));
  const [fechaIngresoCajaAct, setFechaIngresoCajaAct] = useState(new Date().toISOString().slice(0, 10));
  // interruptor
  const [modalInt, setModalInt] = useState(false);
  const [motivoInt, setMotivoInt] = useState('');

  const sumaPagos = useMemo(() => pagosAgregados.reduce((a, p) => a + p.monto, 0), [pagosAgregados]);
  
  // Saldo a Favor & Notas Crédito
  const [activeTab, setActiveTab] = useState<'Pagos' | 'NotasCredito'>(() => {
    const t = sp?.get('tab');
    return (t === 'notas' || t === 'NotasCredito') ? 'NotasCredito' : 'Pagos';
  });
  const [saldoFavorActivo, setSaldoFavorActivo] = useState(0);
  const [useSaldoFavor, setUseSaldoFavor] = useState(true);
  const [isNotaModalOpen, setIsNotaModalOpen] = useState(false);
  const [notaManualMonto, setNotaManualMonto] = useState('');
  const [notaManualRef, setNotaManualRef] = useState('');
  const [notaManualMotivo, setNotaManualMotivo] = useState('');
  const [notasCredito, setNotasCredito] = useState<any[]>([]);
  const [filtroNotas, setFiltroNotas] = useState('');
  const [isLoadingNotas, setIsLoadingNotas] = useState(false);
  const [notaEditando, setNotaEditando] = useState<any | null>(null);
  const [notaEditMonto, setNotaEditMonto] = useState('');
  const [notaEditRef, setNotaEditRef] = useState('');
  const [notaEditMotivo, setNotaEditMotivo] = useState('');
  const [guardandoEditNota, setGuardandoEditNota] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [calcTrigger, setCalcTrigger] = useState(0);
  const [pagosPorConciliar, setPagosPorConciliar] = useState<any[]>([]);

  // Computado de deuda tras aplicar Saldo a Favor
  const totalConImpuestos = cobro?.totales?.totalBs || 0;
  const descuentoSaldoFavor = (metodoAct !== 'Saldo a Favor' && useSaldoFavor) 
    ? Math.min(totalConImpuestos, saldoFavorActivo) 
    : 0;
  const totalNetoAbonable = Math.max(0, totalConImpuestos - descuentoSaldoFavor);
  const faltaPagar = useMemo(() => Math.round((totalNetoAbonable - sumaPagos) * 100) / 100, [totalNetoAbonable, sumaPagos]);

  // Se resetean los pagos si cambia la deuda
  useEffect(() => { setPagosAgregados([]); }, [cobro?.totales?.totalBs, descuentoSaldoFavor]);

  useEffect(() => {
    if (!cobro?.condo?.codigo && !codigo) {
      setPagosPorConciliar([]);
      return;
    }
    const cod = (cobro?.condo?.codigo || codigo || '').trim().toLowerCase();
    const idents = [cobro?.condo?.identidad, cobro?.condo?.codigo, codigo].filter(Boolean).map(x => String(x).toLowerCase().replace(/[^a-z0-9]/g, ''));
    (async () => {
      try {
        const { data } = await supabase
          .from('pagos_reportados')
          .select('*')
          .in('estado', ['Por Verificar', 'Pendiente'])
          .order('created_at', { ascending: false })
          .limit(200);
        if (data) {
          const match = data.filter((p: any) => {
            const pId = String(p.identidad || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            if (idents.some(id => id && (pId === id || pId.includes(id) || id.includes(pId)))) return true;
            const detStr = (typeof p.detalles === 'string' ? p.detalles : JSON.stringify(p.detalles || '')).toLowerCase();
            return detStr.includes(cod);
          });
          setPagosPorConciliar(match);
        }
      } catch (e) {
        console.warn('Error fetching pagos por conciliar:', e);
      }
    })();
  }, [cobro?.condo?.codigo, cobro?.condo?.identidad, codigo]);

  const fetchNotasCredito = async () => {
    setIsLoadingNotas(true);
    try {
      const curCondo = cobro?.condo;
      const condoCodigo = curCondo?.codigo || codigo;
      const condoIdent = curCondo?.identidad;

      if (!condoCodigo && !condoIdent) {
        setNotasCredito([]);
        return;
      }

      const rawIdents = [condoIdent, condoCodigo].filter(Boolean);
      const allIdents = Array.from(new Set(rawIdents.flatMap(id => getIdentidadVariantsExact(id))));

      const { data, error: errDocs } = await supabase
        .from('documentos')
        .select('*')
        .eq('tipo', 'Nota de Credito')
        .in('identidad', allIdents)
        .order('created_at', { ascending: false });

      if (errDocs) console.error('Error fetching notas credito:', errDocs);

      const validDocs = (data || []).filter((d: any) => d.estado !== 'Anulado');
      const docsList = [...validDocs];

      // Suma de notas registradas en documentos
      const sumaDocs = docsList.reduce((acc: number, n: any) => {
        let details: any = {};
        try { details = typeof n.detalles === 'string' ? JSON.parse(n.detalles) : (n.detalles || {}); } catch(e){}
        return acc + parseLocalFloat(details.monto_bs ?? details.monto ?? 0);
      }, 0);

      // Si en la ficha (inmuebles/condominios) hay saldo a favor que supera los documentos existentes,
      // sintetizamos una fila explícita para que el usuario pueda verla, editar su monto o eliminarla/ponerla a 0.
      const diferenciaDirecta = Math.round((saldoFavorActivo - sumaDocs) * 100) / 100;
      if (diferenciaDirecta > 0.05) {
        docsList.unshift({
          id: `__directo__${condoCodigo || condoIdent}`,
          created_at: new Date().toISOString(),
          identidad: condoIdent || condoCodigo,
          contribuyente: curCondo?.nombre || 'Saldo a Favor en Ficha',
          estado: 'Vigente',
          isDirecto: true,
          detalles: JSON.stringify({
            monto_bs: diferenciaDirecta,
            origen_referencia: 'Saldo a Favor en Ficha (Catastro / Condominio)',
            motivo: 'Abono / Saldo registrado directamente en la ficha'
          })
        });
      }

      setNotasCredito(docsList);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingNotas(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'NotasCredito') {
      fetchNotasCredito();
    }
  }, [activeTab, cobro?.condo?.codigo, cobro?.condo?.identidad, codigo, saldoFavorActivo]);

  const handleEliminarNota = async (docId: string, monto: any) => {
    const montoNum = parseLocalFloat(monto);
    if (!confirm(`¿Está seguro de quitar y eliminar este saldo a favor por Bs. ${formatBs(montoNum)}?\n\nEsto revertirá automáticamente el saldo a favor del condominio.`)) {
      return;
    }
    try {
      if (String(docId).startsWith('__directo__')) {
        const res = await fetch('/api/admin/condominios/ajustar-saldo-favor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            codigoCondominio: cobro?.condo?.codigo || codigo,
            identidad: cobro?.condo?.identidad,
            nuevoMonto: 0,
            motivo: 'Eliminación manual desde Caja de Condominios',
            usuario: usuario()?.usuario || 'Admin'
          })
        });
        const resJson = await res.json();
        if (!res.ok || !resJson.ok) throw new Error(resJson.error || 'Error al eliminar saldo');
      } else {
        const res = await fetch('/api/admin/documentos/eliminar-nota-credito', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: docId,
            motivo: 'Eliminación manual desde Caja de Condominios',
            usuario: usuario()?.usuario || 'Admin'
          })
        });
        const resJson = await res.json();
        if (!res.ok || !resJson.ok) {
          throw new Error(resJson.error || 'Error al eliminar la nota de crédito');
        }
      }
      setSaldoFavorActivo(prev => Math.max(0, prev - montoNum));
      setSuccessMsg('Saldo a favor eliminado correctamente.');
      setTimeout(() => setSuccessMsg(''), 4000);
      await fetchNotasCredito();
      setCalcTrigger(prev => prev + 1);
    } catch (err: any) {
      alert('Error eliminando saldo a favor: ' + err.message);
    }
  };

  const handleAbrirEditarNota = (nota: any) => {
    let details: any = {};
    try {
      details = typeof nota.detalles === 'string' ? JSON.parse(nota.detalles) : (nota.detalles || {});
    } catch(e){}
    const rawMonto = parseLocalFloat(details.monto_bs ?? details.monto ?? 0);
    setNotaEditando(nota);
    setNotaEditMonto(formatLocalNumberInput(rawMonto.toFixed(2).replace('.', ',')));
    setNotaEditRef(details.origen_referencia || '');
    setNotaEditMotivo(details.motivo || '');
  };

  const handleGuardarEditarNota = async () => {
    if (!notaEditando) return;
    const montoParsed = parseLocalFloat(notaEditMonto);
    if (isNaN(montoParsed) || montoParsed < 0) return alert('Ingrese un monto válido mayor o igual a 0');
    setGuardandoEditNota(true);
    try {
      if (notaEditando.isDirecto || String(notaEditando.id).startsWith('__directo__')) {
        const res = await fetch('/api/admin/condominios/ajustar-saldo-favor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            codigoCondominio: cobro?.condo?.codigo || codigo,
            identidad: cobro?.condo?.identidad,
            nuevoMonto: montoParsed,
            motivo: notaEditMotivo.trim() || 'Ajuste manual desde Caja de Condominios',
            usuario: usuario()?.usuario || 'Admin'
          })
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Error al ajustar saldo');
        setSaldoFavorActivo(montoParsed);
        setSuccessMsg(data.mensaje || 'Saldo a favor actualizado correctamente');
      } else {
        const res = await fetch('/api/admin/documentos/editar-nota-credito', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: notaEditando.id,
            nuevoMonto: montoParsed,
            nuevaReferencia: notaEditRef.trim(),
            nuevoMotivo: notaEditMotivo.trim(),
            usuario: usuario()?.usuario || 'Admin'
          })
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Error al editar nota de crédito');

        if (data.diferencia) {
          setSaldoFavorActivo(prev => Math.max(0, prev + data.diferencia));
        }
        setSuccessMsg(data.mensaje || 'Nota de crédito actualizada correctamente');
      }
      setTimeout(() => setSuccessMsg(''), 4000);
      setNotaEditando(null);
      await fetchNotasCredito();
      setCalcTrigger(prev => prev + 1);
    } catch (err: any) {
      alert('Error editando saldo a favor: ' + (err.message || err));
    } finally {
      setGuardandoEditNota(false);
    }
  };



  useEffect(() => {
    const u = usuario(); setAdmin(u.rol === 'Administrador' || u.usuario === 'dzara');
    fetch('/api/admin/condominios/cobrar', { method: 'POST', body: JSON.stringify({ accion: 'estado' }) }).then(r => r.json()).then(j => setActiva(!!j.cajaActiva)).catch(() => setActiva(false));
  }, []);

  // Búsqueda
  useEffect(() => {
    const t = q.trim();
    if (t.length < 3) { setRes(null); return; }
    const h = setTimeout(async () => {
      setBuscando(true);
      try {
        const r = await fetch(`/api/admin/condominios?buscar=${encodeURIComponent(t)}`);
        const json = await r.json();
        setRes({
          condominios: (json.condominios || []).filter((c: any) => c.estado !== 'Eliminado'),
          unidades: (json.unidades || []).filter((u: any) => u.estado !== 'Eliminada' && u.condominios?.estado !== 'Eliminado')
        });
      } finally { setBuscando(false); }
    }, 350);
    return () => clearTimeout(h);
  }, [q]);

  /** unidad + todos=false → solo ese local; todos=true → todos los locales de ese dueño */
  const elegir = (cod: string, unidad?: any, todos = false) => {
    setCodigo(cod); setRes(null); setQ(''); setClaves([]); setAbonoLocales(false); setMeses(''); setRecibo(null); setSoloMultas(false); setIncluirMultas(false); setContactoOmitido(false);
    if (unidad && todos && unidad.identidad) {
      setModo('CONTRIBUYENTE'); setIdentidad(String(unidad.identidad).toUpperCase());
      router.replace(`/admin/condominios/caja?codigo=${cod}&cedula=${encodeURIComponent(unidad.identidad)}`);
    } else if (unidad) {
      setModo('CONTRIBUYENTE'); setIdentidad(''); setClaves([unidad.id]);
      router.replace(`/admin/condominios/caja?codigo=${cod}&unidad=${unidad.id}`);
    } else {
      setModo('CONDOMINIO'); setIdentidad('');
      router.replace(`/admin/condominios/caja?codigo=${cod}`);
    }
  };
  const cambiarModo = (m: 'CONDOMINIO' | 'CONTRIBUYENTE') => { setModo(m); setClaves([]); setAbonoLocales(false); setSoloMultas(false); setIncluirMultas(false); if (m === 'CONDOMINIO') setIdentidad(''); };

  // Calcular (cada vez que cambia la selección)
  useEffect(() => {
    if (!codigo) return;
    const h = setTimeout(async () => {
      setCalculando(true); setError('');
      try {
        let tasaParsed = parseFloat(tasaOverrideStr.replace(/\./g, '').replace(',', '.'));
        if (isNaN(tasaParsed)) tasaParsed = 0;
        const clavesPayload = (modo === 'CONDOMINIO' && abonoLocales && claves.length === 0)
          ? ['__NINGUNO__']
          : (modo === 'CONDOMINIO' && !abonoLocales ? [] : claves);

        const r = await fetch('/api/admin/condominios/cobrar', { method: 'POST', body: JSON.stringify({
          accion: 'calcular', codigo, modo,
          claves: clavesPayload,
          identidad: modo === 'CONTRIBUYENTE' ? identidad.trim() || null : null,
          meses: meses || null,
          mesesPorUnidad: Object.keys(mesesPorUnidad).length > 0 ? mesesPorUnidad : undefined,
          soloMultas,
          incluirMultas,
          tasaOverride: tasaParsed > 0 ? tasaParsed : undefined,
          fechaOverride: fechaOverrideStr || undefined,
        }) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'No se pudo calcular');
        setCobro(j); setActiva(!!j.cajaActiva);
        pagoId.current = crypto.randomUUID();
        
        // Fetch Saldo Favor
        setSaldoFavorActivo(j.saldoFavorActivo || 0);

        // Si se buscó por un local o unidad específica, auto-filtrar en la tabla de unidades
        if (j.condo && j.condo.codigo !== codigo.toUpperCase()) {
          setFiltroU(codigo);
        }

        // Verificar datos de contacto para mostrar modal si faltan
        if (j.condo) {
          const tel = j.condo.telefono || '';
          const cor = j.condo.correo || '';
          setContactoTelefono(tel);
          setContactoCorreo(cor);
          if (!tel && !cor && !contactoOmitido) {
            setModalContacto(true);
          }
        }
      } catch (e: any) { setError(e.message); setCobro(null); setSaldoFavorActivo(0); } finally { setCalculando(false); }
    }, 300);
    return () => clearTimeout(h);
  }, [codigo, modo, claves, abonoLocales, identidad, meses, mesesPorUnidad, soloMultas, incluirMultas, tasaOverrideStr, fechaOverrideStr, calcTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  const c = cobro?.condo;
  const base = cobro?.estado;
  const porContrib = modo === 'CONTRIBUYENTE';
  const conDeuda = useMemo(() => (base?.renglones || []).filter((r: any) => r.totalBs > 0.01), [base]);
  // Cédula con o sin prefijo (7436881 = V-7436881): se compara solo el número
  const normId = (s: any) => String(s || '').toUpperCase().trim().replace(/^[VEJPG]-?/, '').replace(/[^A-Z0-9]/g, '').replace(/^0+/, '');
  const visiblesU = useMemo(() => {
    const t = filtroU.trim().toUpperCase();
    const ced = porContrib ? normId(identidad) : '';
    return conDeuda.filter((r: any) =>
      (!ced || ced.length < 5 || normId(r.identidad) === ced) &&
      (!t || [r.inmueble, r.numero, r.propietario, r.identidad, r.actividad].some((x: any) => String(x || '').toUpperCase().includes(t))));
  }, [conDeuda, filtroU, identidad, porContrib]); // eslint-disable-line react-hooks/exhaustive-deps
  const enCobro = useMemo(() => new Set((cobro?.lineas || []).map((l: any) => l.clave)), [cobro]);
  const mapLineas = useMemo(() => new Map<string, any>((cobro?.lineas || []).map((l: any) => [l.clave, l])), [cobro]);
  const multasDe = (r: any) => (r.deuda?.multaBs || 0) + (r.multaExtraBs || 0) + (r.multasManualesBs || 0);
  const unidadesParaMax = useMemo(() => {
    if (claves.length > 0) return conDeuda.filter((r: any) => claves.includes(r.clave));
    if (porContrib && identidad.trim()) {
      const ced = normId(identidad);
      return conDeuda.filter((r: any) => normId(r.identidad) === ced);
    }
    if (visiblesU.length > 0 && visiblesU.length <= 5) return visiblesU;
    return conDeuda;
  }, [claves, conDeuda, porContrib, identidad, visiblesU]);

  const mesesMax = base?.totales?.mesesMax || 0;
  const multasMax = Math.max(1, ...(unidadesParaMax || []).map((r: any) => (r.multaMeses || 0) + (r.multasManuales || []).length));
  const maxOpciones = soloMultas ? multasMax : mesesMax;
  const listaMultasInfo = useMemo(() => {
    if (!soloMultas || !unidadesParaMax || unidadesParaMax.length === 0) return [];
    const u = unidadesParaMax[0];
    const items: { label: string; periodo?: string }[] = [];
    const mesesMultaEnAseo = (u.deuda?.porMes || []).filter((m: any) => m.multaBs > 0).length;
    const mesesRemanentes = Math.max(0, (u.multaMeses || 0) - mesesMultaEnAseo);
    if (mesesRemanentes > 0) {
      const persPrev = periodosMultasPrevias(u.pendienteDesde, mesesRemanentes);
      for (let i = 0; i < mesesRemanentes; i++) {
        const per = persPrev[i];
        items.push({ label: per ? fmtPeriodo(per) : `Mes ${i + 1}`, periodo: per });
      }
    }
    if (u.deuda?.porMes) {
      for (const m of u.deuda.porMes) {
        if (m.multaBs > 0) {
          const per = u.periodos?.[m.n - 1];
          items.push({ label: per ? fmtPeriodo(per) : `Mora Mes ${m.n}`, periodo: per });
        }
      }
    }
    if (u.multasManuales) {
      for (const man of u.multasManuales) {
        const per = man.periodo;
        items.push({ label: per ? fmtPeriodo(per) : (man.concepto || 'Multa Fija'), periodo: per });
      }
    }
    return items;
  }, [soloMultas, unidadesParaMax]);
  const toggle = (k: string) => setClaves(cs => cs.includes(k) ? cs.filter(x => x !== k) : [...cs, k]);
  const sinSeleccion = (porContrib && !claves.length && !identidad.trim()) || (!porContrib && abonoLocales && !claves.length);

  const agregarPago = () => {
    let montoParsed = parseLocalFloat(montoAct);
    if (!montoParsed || montoParsed <= 0) return alert('Monto inválido.');
    if (['Transferencia', 'Deposito', 'Punto de Venta'].includes(metodoAct)) {
      if (!bancoAct) return alert('Seleccione banco.');
      const refClean = referenciaAct.trim().replace(/\D/g, '');
      if (refClean.length !== 8) return alert('La referencia debe tener exactamente 8 dígitos numéricos.');
      if (metodoAct === 'Transferencia' && !comprobanteAct) return alert('Es obligatorio adjuntar el comprobante para Transferencia.');
    }
    // if (montoParsed > faltaPagar + 0.05) return alert('El monto supera la deuda restante.');
    setPagosAgregados([...pagosAgregados, { 
      metodo: metodoAct, 
      banco: bancoAct, 
      bancoDestino: bancoDestinoAct, 
      referencia: referenciaAct, 
      monto: montoParsed, 
      comprobante: comprobanteAct, 
      fecha: fechaAct,
      fechaTransaccion: fechaTransaccionAct,
      fechaIngresoCaja: fechaIngresoCajaAct,
    }]);
    setMetodoAct('Transferencia'); setBancoAct('Banco de Venezuela'); setBancoDestinoAct('BANCAMIGA - 0172 - 0717'); setReferenciaAct(''); setMontoAct(''); setComprobanteAct(null);
  };

  const quitarPago = (idx: number) => {
    setPagosAgregados(pagosAgregados.filter((_, i) => i !== idx));
  };

  const handleGuardarContacto = async () => {
    if (!contactoTelefono.trim() && !contactoCorreo.trim()) {
      alert('Ingrese al menos un teléfono o correo electrónico.');
      return;
    }
    setGuardandoContacto(true);
    try {
      const targetId = porContrib && identidad.trim() ? identidad.trim() : c?.identidad;
      const targetInm = porContrib && claves.length ? claves[0] : c?.codigo;
      
      const upd: any = {};
      if (contactoTelefono.trim()) upd.telefono = contactoTelefono.trim();
      if (contactoCorreo.trim()) upd.correo_electronico = contactoCorreo.trim();
      
      if (targetInm) {
        await supabase.from('inmuebles').update(upd).eq('inmueble', targetInm);
      }
      if (targetId) {
        await supabase.from('inmuebles').update(upd).eq('identidad', targetId);
      }
      if (c?.codigo) {
        const condoUpd: any = {};
        if (contactoTelefono.trim()) condoUpd.telefono = contactoTelefono.trim();
        if (contactoCorreo.trim()) condoUpd.correo = contactoCorreo.trim();
        await supabase.from('condominios').update(condoUpd).eq('codigo', c.codigo);
        if (cobro?.condo) {
          setCobro({ ...cobro, condo: { ...cobro.condo, ...condoUpd } });
        }
      }
      
      setSuccessMsg('Datos de contacto actualizados correctamente.');
      setTimeout(() => setSuccessMsg(''), 4000);
      setModalContacto(false);
      setContactoOmitido(true);
    } catch (e: any) {
      alert('Error al guardar datos: ' + e.message);
    } finally {
      setGuardandoContacto(false);
    }
  };

  const handleGuardarNota = async () => {
    if (!c?.codigo) return;
    setGuardandoNota(true);
    try {
      const nuevaNota = notaCondominio.trim() || null;
      const res = await fetch('/api/admin/condominios', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo: c.codigo,
          cambios: { notas: nuevaNota },
          motivo: 'Nota actualizada desde Caja de Condominios',
          usuario: getCajeroId() || 'Operador',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar la nota');
      
      // Actualizar estado local inmediatamente para que se vea en pantalla
      if (cobro?.condo) {
        setCobro({ ...cobro, condo: { ...cobro.condo, notas: nuevaNota } });
      }
      setSuccessMsg('Nota del condominio guardada correctamente.');
      setTimeout(() => setSuccessMsg(''), 4000);
      setModalNotas(false);
    } catch (e: any) {
      alert('Error al guardar nota: ' + e.message);
    } finally {
      setGuardandoNota(false);
    }
  };

  const cobrar = async () => {
    if (!cobro?.lineas?.length) return;
    if (faltaPagar > 0.05) { alert('Aún falta por pagar Bs ' + fmtBs(faltaPagar)); return; }
    
    const nf = cobro.facturas?.length || 1;
    if (!confirm(`¿Registrar el cobro de Bs ${fmtBs(cobro.totales.totalBs)}?\n\nSe emitirán ${nf} factura(s):\n${(cobro.facturas || []).map((f: any) => `• ${f.nombre} (${f.identidad}): Bs ${fmtBs(f.totalBs)}`).join('\n')}`)) return;
    
    setCobrando(true);
    try {
      // Subir comprobantes
      const pagosSubidos = [];
      for (const p of pagosAgregados) {
        let url = '';
        if (p.comprobante) {
          const ext = p.comprobante.name.split('.').pop() || 'jpg';
          const uId = usuario().usuario || 'caja';
          const fileName = `condominios/${codigo}_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
          const fd = new FormData();
          fd.append('file', p.comprobante);
          fd.append('bucket', 'comprobantes');
          fd.append('path', fileName);
          const rUp = await fetch('/api/upload', { method: 'POST', body: fd });
          const jUp = await rUp.json();
          if (rUp.ok && jUp.publicUrl) url = jUp.publicUrl;
        }
        pagosSubidos.push({ ...p, comprobante_url: url, comprobante_nombre: p.comprobante?.name });
      }

      let tasaParsed = parseFloat(tasaOverrideStr.replace(/\./g, '').replace(',', '.'));
      if (isNaN(tasaParsed)) tasaParsed = 0;

      const u = usuario();
      
      const realPagosSubidos = [];
      if (descuentoSaldoFavor > 0) {
         realPagosSubidos.push({
            metodo: 'Saldo a Favor',
            monto: descuentoSaldoFavor,
            referencia: 'Desc. Saldo Favor',
            fechaTransaccion: fechaTransaccionAct,
            fechaIngresoCaja: fechaIngresoCajaAct,
         });
      }
      realPagosSubidos.push(...pagosSubidos);
      
      const clavesPayload = (modo === 'CONDOMINIO' && abonoLocales && claves.length === 0)
        ? ['__NINGUNO__']
        : (modo === 'CONDOMINIO' && !abonoLocales ? [] : claves);

      const sumaRealPagos = realPagosSubidos.reduce((a, b) => a + (Number(b.monto) || 0), 0);
      const totalAPagarCobro = cobro.totales.totalBs;
      const excedenteGenerado = faltaPagar < -0.05 ? Math.abs(faltaPagar) : 0;
      const nuevoCobroId = crypto.randomUUID();
      pagoId.current = nuevoCobroId;

      const primerPagoReal = realPagosSubidos.find(p => p.metodo !== 'Saldo a Favor') || realPagosSubidos[0];

      const r = await fetch('/api/admin/condominios/cobrar', {
        method: 'POST', body: JSON.stringify({
          accion: 'cobrar', codigo, modo,
          claves: clavesPayload,
          identidad: porContrib ? identidad.trim() || null : null,
          meses: meses || null,
          mesesPorUnidad: Object.keys(mesesPorUnidad).length > 0 ? mesesPorUnidad : undefined,
          soloMultas,
          incluirMultas,
          usuario: u.usuario,
          tasaOverride: tasaParsed > 0 ? tasaParsed : (cobro?.estado?.tasa ? Number(cobro.estado.tasa) : undefined),
          fechaOverride: fechaOverrideStr || undefined,
          pago: { 
            pagoId: nuevoCobroId, 
            metodo: primerPagoReal?.metodo || 'MÚLTIPLE', 
            banco: primerPagoReal?.banco || '', 
            referencia: primerPagoReal?.referencia || '', 
            montoRecibido: sumaRealPagos > totalAPagarCobro ? sumaRealPagos : totalAPagarCobro, 
            cajero: getCajeroId(),
            bancoDestino: primerPagoReal?.bancoDestino || '',
            pagosAgregados: realPagosSubidos,
            saldoFavorGenerado: excedenteGenerado
          },
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'No se pudo cobrar');
      
      // Actualizar Saldo Favor en UI post-cobro
      if (descuentoSaldoFavor > 0 || realPagosSubidos.some(p => p.metodo === 'Saldo a Favor')) {
        setSaldoFavorActivo(Math.max(0, saldoFavorActivo - descuentoSaldoFavor - realPagosSubidos.filter(p=>p.metodo==='Saldo a Favor').reduce((a,b)=>a+b.monto,0)));
      }

      const tieneTransferenciaOPorVerificar = realPagosSubidos.some(p => p.metodo === 'Transferencia' || p.metodo === 'Depósito') || j.estado === 'Por Verificar';

      if (tieneTransferenciaOPorVerificar) {
        setRecibo(null);
        alert('✅ Cobro registrado exitosamente en estado "Por Verificar".\n\nPor normativa de recaudación, el recibo de caja y la factura fiscal se emitirán una vez que el pago sea CONCILIADO en el módulo de Conciliación Bancaria.');
        setSuccessMsg('Transferencia registrada exitosamente. Pendiente de aprobación en Conciliación Bancaria.');
      } else {
        setRecibo({
          ...j,
          partes: j.pagos,
          monto: totalAPagarCobro,
          montoRecibido: sumaRealPagos > totalAPagarCobro ? sumaRealPagos : totalAPagarCobro,
          saldoFavorGenerado: excedenteGenerado,
          metodo: 'MÚLTIPLE',
          banco: '',
          referencia: '',
          fecha: new Date(),
          prueba: false
        });
      }
      setReferencia(''); setClaves([]); setAbonoLocales(false); setMeses(''); setSoloMultas(false); setPagosAgregados([]);
    } catch (e: any) { alert(e.message); } finally { setCobrando(false); }
  };

  const verReciboPrueba = () => setRecibo({
    cobro, monto: cobro.totales.totalBs, metodo, banco, referencia, fecha: new Date(), prueba: true,
    partes: (cobro.facturas || []).map((f: any, i: number) => ({ reciboRef: `PRUEBA-${i + 1}`, identidad: f.identidad, nombre: f.nombre, monto: f.totalBs })),
  });

  const cambiarInterruptor = async () => {
    const r = await fetch('/api/admin/condominios/cobrar', { method: 'POST', body: JSON.stringify({ accion: 'interruptor', activar: !activa, motivo: motivoInt, usuario: usuario().usuario }) });
    const j = await r.json();
    if (!r.ok) { alert(j.error); return; }
    setActiva(!!j.cajaActiva); setModalInt(false); setMotivoInt('');
  };

  const handleCrearNotaManual = async () => {
    const montoNota = parseLocalFloat(notaManualMonto);
    if (!montoNota || montoNota <= 0) return alert('Ingrese un monto válido');
    if (!notaManualRef || notaManualRef.trim().length < 3) return alert('La referencia debe tener al menos 3 caracteres.');
    if (!cobro) return;

    let targetId = cobro.modo === 'CONTRIBUYENTE' ? cobro.facturas[0]?.identidad : (cobro.condo.identidad || cobro.condo.codigo);
    let targetName = cobro.modo === 'CONTRIBUYENTE' ? cobro.facturas[0]?.nombre : cobro.condo.nombre;

    if (!targetId) return alert('No hay un identificador válido para acreditar el saldo.');

    try {
      const res = await fetch('/api/admin/documentos/crear-nota-credito', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identidad: targetId,
          contribuyente: targetName,
          monto: montoNota,
          motivo: 'Nota de crédito generada desde Caja de Condominios',
          referencia: notaManualRef.trim(),
          codigoCondominio: cobro.condo?.codigo,
          usuario: 'Admin'
        })
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || 'Error al generar la nota de crédito');
      
      setSaldoFavorActivo(prev => prev + montoNota);
      setSuccessMsg('Nota de crédito manual generada y saldo a favor acreditado exitosamente.');
      setTimeout(() => setSuccessMsg(''), 4000);
      setIsNotaModalOpen(false);
      setNotaManualMonto('');
      setNotaManualRef('');
      if (activeTab === 'NotasCredito') fetchNotasCredito();
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1500px] mx-auto">
      {/* ══ ENCABEZADO ══ */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4 print:hidden">
        <div className="space-y-2">
          <SelectorModulo activo="caja" />
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2"><Wallet className="w-7 h-7 text-emerald-600" /> Caja de Condominios</h1>
          <p className="text-xs text-slate-500">Busque el condominio (nombre, código o RIF) o el dueño de una unidad. El monto lo calcula el sistema con la tarifa y la tasa Euro vigentes.</p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <div className="flex items-center gap-2">
            {activa === null ? null : activa ? (
              <span className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-black flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> ACTIVA: registra pagos reales</span>
            ) : (
              <span className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-black flex items-center gap-2"><FlaskConical className="w-4 h-4" /> MODO PRUEBA: solo calcula, no registra</span>
            )}
            
            <div className="flex bg-slate-100 rounded-lg p-1 mr-2 border border-slate-200">
              <button onClick={() => setActiveTab('Pagos')} className={`px-4 py-1.5 text-xs font-bold rounded transition ${activeTab === 'Pagos' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600'}`}>Pagos</button>
              <button onClick={() => setActiveTab('NotasCredito')} className={`px-4 py-1.5 text-xs font-bold rounded transition ${activeTab === 'NotasCredito' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600'}`}>Notas de Crédito</button>
            </div>
            
            {admin && activa !== null && (
              <button id="btn-interruptor-caja-condominios" onClick={() => setModalInt(true)} className="px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer">
                <Power className="w-4 h-4" /> {activa ? 'Pasar a prueba' : 'Activar'}
              </button>
            )}
          </div>
          <div className="bg-[#f0fdf4] border border-[#86efac] rounded-xl p-3 flex flex-col gap-2 shadow-sm min-w-[280px]">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[#166534] font-bold text-sm">Tasa Euro Aplicada:</span>
              <input type="text" value={tasaOverrideStr} onChange={e => {
                let v = e.target.value.replace(/[^0-9,.]/g, '');
                setTasaOverrideStr(v); setTasaFechaInfo('');
              }} onBlur={e => {
                 let v = e.target.value;
                 if (v.includes(',') && v.includes('.')) {
                   if (v.lastIndexOf(',') > v.lastIndexOf('.')) v = v.replace(/\./g, '').replace(',', '.');
                   else v = v.replace(/,/g, '');
                 } else if (v.includes(',')) {
                   v = v.replace(',', '.');
                 }
                 let p = parseFloat(v);
                 if(!isNaN(p) && p > 0) setTasaOverrideStr(p.toFixed(2).replace('.', ','));
                 else setTasaOverrideStr('');
              }} placeholder="Automática" className="bg-white border border-[#86efac] rounded-lg px-2 py-1.5 text-right font-bold text-[#166534] text-sm w-24 outline-none focus:ring-1 focus:ring-[#166534]" />
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-[#86efac]/50">
              <div className="flex items-center gap-1.5 text-[#166534]">
                <Calendar className="w-4 h-4" />
                <input type="date" value={fechaOverrideStr} max={hoyCaracas()} onChange={e => { setFechaOverrideStr(e.target.value); aplicarTasaDeFecha(e.target.value); }} className="bg-transparent border-none text-xs font-bold text-[#166534] outline-none cursor-pointer" />
              </div>
              <button disabled={cargandoTasaFecha} onClick={() => {
                aplicarTasaDeFecha(fechaOverrideStr);
                if (!codigo) return;
                // Force re-calculation by toggling a dummy state or relying on the useEffect dependency
                setCobro(null); setEstadoBase(null);
              }} className="bg-[#059669] hover:bg-[#047857] text-white px-3 py-1 rounded-lg text-xs font-bold transition-colors disabled:opacity-50">
                {cargandoTasaFecha ? '...' : 'Fijar Día'}
              </button>
            </div>
            {tasaFechaInfo && <div className="text-[10px] font-semibold text-[#166534]">{tasaFechaInfo}</div>}
            {(() => {
              const t = parseFloat(tasaOverrideStr.replace(/\./g, '').replace(',', '.')) || Number(cobro?.estado?.tasa || estadoBase?.tasa || 0);
              return t > 0 ? <div className="text-[10px] font-semibold text-[#166534]">UCD (Euro × 57): Bs {fmtBs(valorUCD(t))}</div> : null;
            })()}
          </div>
        </div>
      </div>

      {/* ══ BUSCADOR ══ */}
      <div className="relative print:hidden">
        <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
        <input id="buscar-caja-condominio" value={q} onChange={e => setQ(e.target.value)} autoFocus
          placeholder="Nombre, código (URB…), RIF del condominio, o cédula / nombre del dueño de una unidad…"
          className="w-full pl-12 pr-4 py-4 rounded-2xl border border-slate-300 bg-white text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        {buscando && <RefreshCw className="w-4 h-4 animate-spin text-slate-400 absolute right-4 top-1/2 -translate-y-1/2" />}
        {res && (
          <div className="absolute z-30 mt-2 w-full bg-white rounded-2xl shadow-xl border border-slate-200 max-h-[60vh] overflow-y-auto">
            {res.condominios.length === 0 && res.unidades.length === 0 && <div className="p-4 text-sm text-slate-500">Sin resultados.</div>}
            {res.condominios.length > 0 && <div className="px-4 pt-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Condominios</div>}
            {res.condominios.map((x: any) => (
              <button key={x.codigo} onClick={() => elegir(x.codigo)} className="w-full text-left px-4 py-2.5 hover:bg-emerald-50 flex items-center gap-3 cursor-pointer">
                <Building2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <div><div className="font-bold text-slate-900 text-sm">{x.nombre}</div><div className="text-[11px] text-slate-500 font-mono">{x.codigo} · {x.identidad} · {x.cant_declarada} unidades</div></div>
              </button>
            ))}
            {res.unidades.length > 0 && <div className="px-4 pt-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Unidades</div>}
            {res.unidades.map((u: any) => (
              <div key={u.id} className="w-full px-4 py-2.5 hover:bg-emerald-50 flex items-center gap-3">
                <button onClick={() => elegir(u.condominios.codigo, u)} className="flex-1 text-left flex items-center gap-3 cursor-pointer" title="Cobrar solo este local">
                  <Layers className="w-4 h-4 text-sky-600 shrink-0" />
                  <div><div className="font-bold text-slate-900 text-sm"><span className="font-mono">{u.inmueble}{u.numero ? ` · ${u.numero}` : ''}</span> — {u.propietario || 'Sin propietario'} <span className="font-mono text-xs text-slate-500">{u.identidad}</span></div>
                    <div className="text-[11px] text-slate-500">en {u.condominios.nombre} · <b className="text-sky-700">cobrar solo este local</b></div></div>
                </button>
                {u.identidad && (
                  <button onClick={() => elegir(u.condominios.codigo, u, true)} className="shrink-0 px-2.5 py-1 rounded-lg border border-slate-200 text-[11px] font-bold text-slate-600 hover:border-sky-300 hover:text-sky-800 cursor-pointer">
                    Todos los locales de {u.identidad}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-red-800 text-sm flex gap-2 print:hidden"><AlertTriangle className="w-4 h-4 mt-0.5" /> {error}</div>}
      {!codigo && !error && (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 py-16 text-center text-slate-400 print:hidden">
          <Building2 className="w-10 h-10 mx-auto mb-2" /> Busque un condominio para cobrar.
        </div>
      )}
      {codigo && !cobro && calculando && <div className="py-16 text-center text-slate-500 print:hidden"><RefreshCw className="w-6 h-6 animate-spin inline mr-2" /> Calculando…</div>}

      {c && cobro && activeTab === 'NotasCredito' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Control de Saldos a Favor (Notas de Crédito)</h2>
              <p className="text-xs text-slate-500 mt-0.5">Notas de crédito vinculadas al condominio {c.nombre} ({c.codigo})</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <input
                  type="text"
                  placeholder="🔍 Filtrar por Cédula, RIF o Nombre..."
                  value={filtroNotas}
                  onChange={e => setFiltroNotas(e.target.value)}
                  className="text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 w-60"
                />
                {filtroNotas && (
                  <button
                    onClick={() => setFiltroNotas('')}
                    className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                  >
                    ×
                  </button>
                )}
              </div>
              <button
                onClick={() => {
                  setNotaEditando({
                    id: `__directo__${c.codigo || c.identidad}`,
                    isDirecto: true,
                    detalles: JSON.stringify({
                      monto_bs: saldoFavorActivo,
                      origen_referencia: 'Ajuste manual de saldo a favor',
                      motivo: 'Ajuste manual solicitado desde Caja'
                    })
                  });
                  setNotaEditMonto(formatLocalNumberInput(saldoFavorActivo.toFixed(2).replace('.', ',')));
                  setNotaEditRef('Ajuste Manual');
                  setNotaEditMotivo('Ajuste manual de saldo a favor');
                }}
                className="text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 px-3 py-2 rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Ajustar o poner en 0 el saldo a favor de este condominio manualmente"
              >
                ⚙️ Ajustar Saldo Directo
              </button>
              <button
                onClick={() => setIsNotaModalOpen(true)}
                className="text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-3.5 py-2 rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                + Generar Nota de Crédito Manual
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-600 uppercase bg-slate-50 border-b">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Cédula / RIF</th>
                  <th className="px-4 py-3">Contribuyente</th>
                  <th className="px-4 py-3 text-right">Monto (Bs)</th>
                  <th className="px-4 py-3 text-center">Ref. Origen</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                  <th className="px-4 py-3 text-center">Acción</th>
                </tr>
              </thead>
              <tbody>
                {isLoadingNotas ? <tr><td colSpan={7} className="text-center py-4 text-slate-500">Cargando...</td></tr> :
                (() => {
                  const notasFiltradas = notasCredito.filter(n => {
                    if (!filtroNotas.trim()) return true;
                    const f = filtroNotas.trim().toLowerCase();
                    const fClean = f.replace(/[-\s]/g, '');
                    const id = String(n.identidad || '').toLowerCase();
                    const idClean = id.replace(/[-\s]/g, '');
                    const name = String(n.contribuyente || '').toLowerCase();
                    let details: any = {};
                    try { details = typeof n.detalles === 'string' ? JSON.parse(n.detalles) : (n.detalles || {}); } catch(e){}
                    const ref = String(details.origen_referencia || '').toLowerCase();
                    return id.includes(f) || idClean.includes(fClean) || name.includes(f) || ref.includes(f);
                  });

                  if (notasFiltradas.length === 0) {
                    return (
                      <tr>
                        <td colSpan={7} className="text-center py-6 text-slate-400">
                          {filtroNotas.trim() 
                            ? `No se encontraron notas de crédito que coincidan con "${filtroNotas}".` 
                            : 'No se encontraron notas de crédito para este condominio.'}
                        </td>
                      </tr>
                    );
                  }

                  return notasFiltradas.map(n => {
                    let details: any = {};
                    try {
                      details = typeof n.detalles === 'string' ? JSON.parse(n.detalles) : (n.detalles || {});
                    } catch(e){}
                    const rawMonto = details.monto ?? details.monto_bs ?? 0;
                    const formattedMonto = formatBs(rawMonto);
                    const esVigente = n.estado === 'Vigente';
                    return (
                      <tr key={n.id} className="border-b hover:bg-slate-50">
                        <td className="px-4 py-3">{new Date(n.created_at).toLocaleDateString()}</td>
                        <td className="px-4 py-3 font-medium">{n.identidad}</td>
                        <td className="px-4 py-3">{n.contribuyente}</td>
                        <td className="px-4 py-3 text-right font-bold text-emerald-600">Bs. {formattedMonto}</td>
                        <td className="px-4 py-3 text-center">{details.origen_referencia || '-'}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${esVigente ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                            {n.estado}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {esVigente ? (
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => handleAbrirEditarNota(n)}
                                className="text-xs font-bold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-1 rounded transition-colors cursor-pointer flex items-center gap-1"
                                title="Editar monto y concepto de este saldo a favor"
                              >
                                <span>✏️</span>
                                <span>Editar</span>
                              </button>
                              <button
                                onClick={() => handleEliminarNota(n.id, rawMonto)}
                                className="text-xs font-bold text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 border border-red-200 px-2.5 py-1 rounded transition-colors cursor-pointer flex items-center gap-1"
                                title="Quitar / Eliminar saldo a favor"
                              >
                                <span>🗑️</span>
                                <span>Quitar</span>
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">---</span>
                          )}
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {c && cobro && pagosPorConciliar.length > 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-400 p-4 rounded-xl flex items-start gap-3 shadow-sm print:hidden">
          <div className="p-2 bg-amber-200/80 rounded-lg text-amber-900 text-xl font-bold shrink-0">⚠️</div>
          <div className="flex-1">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-sm font-extrabold text-amber-950 uppercase tracking-wide">
                Atención en Caja: Pagos / Abonos Por Conciliar en este Condominio
              </h3>
              <span className="text-xs font-bold bg-amber-200 text-amber-900 px-2.5 py-0.5 rounded-full border border-amber-300">
                {pagosPorConciliar.length} {pagosPorConciliar.length === 1 ? 'operación pendiente' : 'operaciones pendientes'}
              </span>
            </div>
            <p className="text-xs text-amber-900 mt-1">
              Este condominio tiene un monto acumulado por conciliar de{' '}
              <strong className="text-sm font-black text-amber-950">
                Bs. {pagosPorConciliar.reduce((a: number, p: any) => a + (parseFloat(p.monto) || 0), 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </strong>
              {' '}en el módulo de Conciliación bancaria.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {pagosPorConciliar.map((p: any, idx: number) => (
                <span key={idx} className="text-[11px] bg-white border border-amber-300 text-amber-900 px-2 py-0.5 rounded-md font-mono font-semibold shadow-2xs">
                  Ref: {p.referencia || 'S/R'} — Bs. {parseFloat(p.monto || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({p.tipo || 'Transferencia'})
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {c && cobro && activeTab === 'Pagos' && (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-5 print:hidden">
          {/* ══ IZQUIERDA: condominio y selección ══ */}
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-mono text-slate-500">{c.codigo} · {c.identidad}</div>
                <div className="text-xl font-black text-slate-900">{c.nombre}</div>
                <div className="flex flex-wrap gap-2 mt-1.5 text-[11px] font-bold">
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800">{MODALIDAD[c.modalidad] || c.modalidad}</span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700">{c.cant_declarada} unidades declaradas</span>
                  {c.agente_retencion && <span className="px-2 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-violet-800">Agente de retención</span>}
                  <button 
                    onClick={() => {
                      setContactoTelefono(c.telefono || '');
                      setContactoCorreo(c.correo || '');
                      setModalContacto(true);
                    }}
                    className="px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-300 text-amber-900 text-[11px] font-bold hover:bg-amber-100 flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    📞 Actualizar Contacto {(!c.telefono && !c.correo) ? '⚠️ (Falta)' : ''}
                  </button>
                  <button 
                    onClick={() => {
                      setNotaCondominio(c.notas || '');
                      setModalNotas(true);
                    }}
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                      c.notas 
                        ? 'bg-amber-100 border border-amber-300 text-amber-900 hover:bg-amber-200' 
                        : 'bg-slate-100 border border-slate-300 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    📝 {c.notas ? 'Notas del Condominio' : '+ Agregar Nota'}
                  </button>
                </div>
                {c.notas && (
                  <div className="mt-3.5 p-3.5 bg-amber-50/90 border border-amber-300 rounded-xl text-amber-950 flex items-start justify-between gap-3 shadow-2xs max-w-2xl">
                    <div className="flex items-start gap-2.5">
                      <StickyNote className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 block mb-0.5">Notas del Condominio</span>
                        <p className="text-xs font-semibold whitespace-pre-wrap text-slate-800 leading-relaxed">{c.notas}</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => {
                        setNotaCondominio(c.notas || '');
                        setModalNotas(true);
                      }}
                      className="px-2.5 py-1 text-xs font-bold bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg shrink-0 transition-colors cursor-pointer shadow-2xs"
                    >
                      ✏️ Editar Nota
                    </button>
                  </div>
                )}
                {successMsg && <div className="mt-2 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded inline-block">{successMsg}</div>}
              </div>
              <div className="text-right">
                <div className="text-[11px] font-bold uppercase text-slate-500">Deuda total</div>
                <div className={`text-2xl font-black tabular-nums ${base?.totales?.totalBs > 0.01 ? 'text-red-700' : 'text-emerald-700'}`}>{base?.totales?.totalBs > 0.01 ? `Bs ${formatBs(base.totales.totalBs)}` : 'Al día'}</div>
                <Link href={`/admin/condominios/ficha?codigo=${c.codigo}`} className="text-xs font-bold text-emerald-700 hover:underline block mb-2">Ver ficha y estado de cuenta →</Link>
                <button onClick={() => setIsNotaModalOpen(true)} className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-full border border-slate-300 transition-colors">
                  + Agregar Saldo a Favor Manual
                </button>
              </div>
            </div>

            {/* ══ MODO DE PAGO ══ */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button id="modo-condominio-completo" onClick={() => cambiarModo('CONDOMINIO')}
                className={`text-left rounded-2xl border-2 p-4 cursor-pointer transition ${!porContrib ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                <div className="font-black text-slate-900 flex items-center gap-2"><Building2 className="w-4 h-4 text-emerald-600" /> Paga el condominio completo</div>
                <div className="text-xs text-slate-600 mt-1">Una sola factura digital <b>al condominio</b> ({c.identidad}). Permite cobro completo o <b>abono sumando local por local</b>.{cobro.estado?.porActividad ? ' Las multas no van: las paga cada contribuyente.' : ''}</div>
              </button>
              <button id="modo-por-contribuyente" onClick={() => cambiarModo('CONTRIBUYENTE')}
                className={`text-left rounded-2xl border-2 p-4 cursor-pointer transition ${porContrib ? 'border-sky-500 bg-sky-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                <div className="font-black text-slate-900 flex items-center gap-2"><Users className="w-4 h-4 text-sky-600" /> Paga por contribuyente / local</div>
                <div className="text-xs text-slate-600 mt-1">Una factura digital <b>a cada dueño</b>. Incluye sus multas.</div>
              </button>
            </div>

            {cobro.avisos?.map((a: string, i: number) => <div key={i} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900 text-xs font-bold">{a}</div>)}

            {conDeuda.length === 0 ? (
              <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-8 text-center text-emerald-800 font-bold"><CheckCircle2 className="w-8 h-8 mx-auto mb-2" /> Este condominio está al día.</div>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-100">
                  <div className="font-extrabold text-slate-800 text-sm">
                    {porContrib
                      ? 'Escriba la cédula del contribuyente o escoja sus locales'
                      : abonoLocales
                        ? 'Abono al Condominio: Seleccione los locales a sumar'
                        : 'Todo lo que debe el condominio (Cobro Completo)'}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs font-bold text-red-700 bg-red-50 border border-red-200 px-2.5 py-1.5 rounded-lg cursor-pointer hover:bg-red-100 transition-colors">
                      <input id="solo-multas-condominio" type="checkbox" checked={soloMultas} onChange={e => { setSoloMultas(e.target.checked); if (e.target.checked) setIncluirMultas(false); }} className="w-4 h-4 accent-red-600" />
                      <span>Solo multas</span>
                    </label>

                    {!soloMultas && (
                      <label className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold cursor-pointer transition-colors ${
                        incluirMultas
                          ? 'bg-amber-100 border-amber-400 text-amber-900 shadow-xs ring-1 ring-amber-300'
                          : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                      }`} title="Solo se agrega la multa si marca esta casilla">
                        <input
                          id="incluir-multas-condominio"
                          type="checkbox"
                          checked={incluirMultas}
                          onChange={e => setIncluirMultas(e.target.checked)}
                          className="w-4 h-4 accent-amber-600 rounded"
                        />
                        <span>Cobrar multas por mora</span>
                      </label>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                      <label className="text-xs font-bold text-slate-600">
                        {soloMultas ? 'Multas a pagar (global):' : 'Meses a pagar (global):'}
                      </label>
                      <select id="meses-a-pagar" value={meses} onChange={e => setMeses(e.target.value ? Number(e.target.value) : '')} className="py-1.5 px-2 rounded-lg border border-slate-300 text-sm bg-white font-medium cursor-pointer">
                        <option value="">{soloMultas ? 'Todas las multas acumuladas' : 'Todos (ponerse al día)'}</option>
                        {Array.from({ length: maxOpciones }, (_, i) => i + 1).map(n => (
                          <option key={n} value={n}>
                            {soloMultas
                              ? (n === 1 ? '1er mes de multa (el más viejo obligatorio)' : `Hasta ${n} meses de multas (desde el más viejo)`)
                              : (n === 1 ? '1 mes de aseo (el más viejo)' : `${n} meses de aseo (más viejos)`)}
                          </option>
                        ))}
                      </select>
                      {Object.keys(mesesPorUnidad).length > 0 && (
                        <button
                          type="button"
                          onClick={() => setMesesPorUnidad({})}
                          className="text-[11px] font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 px-2.5 py-1 rounded-md border border-amber-300 transition-colors cursor-pointer shadow-xs"
                          title="Restablecer todos los locales al valor global de meses"
                        >
                          ↺ Restablecer meses por local ({Object.keys(mesesPorUnidad).length} personalizados)
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {soloMultas && maxOpciones > 0 && (
                  <div className="bg-amber-50/90 border-b border-amber-200 p-3.5 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">🔒</span>
                        <span className="text-xs font-black text-amber-950 uppercase tracking-wide">
                          Pago de Multas Mes a Mes (Orden Cronológico Estricto)
                        </span>
                      </div>
                      <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-amber-200 text-amber-900 border border-amber-300">
                        {meses ? `${meses} de ${maxOpciones} mes(es) de multa` : `Todas las multas (${maxOpciones})`}
                      </span>
                    </div>
                    <p className="text-[11px] text-amber-900 font-medium">
                      El sistema exige cobrar las multas en orden <b>desde la más antigua hacia la más reciente</b>. No se permite adelantar meses si existen multas anteriores pendientes.
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[11px] font-bold text-slate-600 mr-1">Seleccionar:</span>
                      {Array.from({ length: maxOpciones }, (_, idx) => {
                        const num = idx + 1;
                        const isSelected = meses === '' || (typeof meses === 'number' && meses >= num);
                        const infoMulta = listaMultasInfo[idx];
                        const labelBoton = infoMulta?.label
                          ? (num === 1 ? infoMulta.label : `Hasta ${infoMulta.label}`)
                          : (num === 1 ? '1er Mes (El más viejo)' : `Hasta Mes ${num}`);
                        return (
                          <button
                            key={num}
                            type="button"
                            onClick={() => {
                              if (meses === num && num > 1) {
                                setMeses(num - 1);
                              } else {
                                setMeses(num);
                              }
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                              isSelected
                                ? 'bg-amber-600 text-white border-amber-700 shadow-xs ring-2 ring-amber-300'
                                : 'bg-white text-slate-700 border-slate-300 hover:border-amber-400 hover:bg-amber-50'
                            }`}
                          >
                            {labelBoton}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => setMeses('')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                          meses === ''
                            ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs ring-2 ring-emerald-300'
                            : 'bg-white text-slate-700 border-slate-300 hover:border-emerald-400'
                        }`}
                      >
                        Todas las multas
                      </button>
                    </div>
                  </div>
                )}

                {porContrib && (
                  <div className="px-4 py-3 flex flex-wrap items-center gap-3 border-b border-slate-100 bg-sky-50/50">
                    <div className="relative">
                      <UserSearch className="w-4 h-4 text-sky-600 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input id="cedula-contribuyente-condominio" value={identidad} onChange={e => { setIdentidad(e.target.value.toUpperCase()); setClaves([]); }} placeholder="Cédula / RIF del contribuyente"
                        className="pl-8 pr-3 py-1.5 rounded-lg border border-sky-300 text-sm w-60 font-mono bg-white" />
                    </div>
                    <input value={filtroU} onChange={e => setFiltroU(e.target.value)} placeholder="Filtrar local, dueño o actividad…" className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm w-56" />
                    {(claves.length > 0 || identidad) && <button onClick={() => { setClaves([]); setIdentidad(''); }} className="text-xs font-bold text-slate-500 hover:underline cursor-pointer">Limpiar</button>}
                  </div>
                )}

                {!porContrib && (
                  <div className="px-4 py-3 border-b border-slate-100 bg-emerald-50/40 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-black text-slate-700">Modalidad de pago:</span>
                        <div className="inline-flex rounded-lg border border-emerald-300 bg-white p-0.5 shadow-2xs">
                          <button
                            type="button"
                            onClick={() => { setAbonoLocales(false); setClaves([]); }}
                            className={`px-3 py-1 text-xs font-bold rounded-md transition cursor-pointer ${
                              !abonoLocales
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'text-slate-600 hover:text-emerald-800'
                            }`}
                          >
                            🏢 Cobro Completo ({conDeuda.length} locales)
                          </button>
                          <button
                            type="button"
                            onClick={() => { setAbonoLocales(true); }}
                            className={`px-3 py-1 text-xs font-bold rounded-md transition cursor-pointer ${
                              abonoLocales
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'text-slate-600 hover:text-emerald-800'
                            }`}
                          >
                            ➕ Abono: Sumar local por local {abonoLocales && claves.length > 0 ? `(${claves.length})` : ''}
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          value={filtroU}
                          onChange={e => setFiltroU(e.target.value)}
                          placeholder="Buscar local, piso, dueño…"
                          className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs w-48 bg-white"
                        />
                        {abonoLocales && (
                          <>
                            <button
                              type="button"
                              onClick={() => setClaves(visiblesU.map((r: any) => r.clave))}
                              className="text-xs font-bold text-emerald-700 hover:underline cursor-pointer"
                            >
                              Seleccionar todos
                            </button>
                            {claves.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setClaves([])}
                                className="text-xs font-bold text-slate-500 hover:underline cursor-pointer"
                              >
                                Limpiar
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {abonoLocales && (
                      <div className="text-xs text-emerald-950 font-medium flex flex-wrap items-center justify-between gap-2 bg-emerald-100/70 px-3 py-2 rounded-lg border border-emerald-200">
                        <span>
                          💡 <b>Abono al Condominio:</b> Marque los locales que van a pagar. La factura digital saldrá <b>a nombre del condominio ({c?.identidad})</b> sumando exactamente los locales seleccionados.
                        </span>
                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                          <span className="font-bold text-emerald-900">
                            {claves.length} de {conDeuda.length} locales ({claves.length === 0 ? 'Ninguno seleccionado' : `Abono: Bs ${fmtBs(cobro?.totales?.totalBs || 0)}`})
                          </span>
                          {claves.length > 0 && (
                            <span className="bg-rose-100 text-rose-800 border border-rose-300 px-2 py-0.5 rounded font-black text-xs">
                              🔴 FALTA POR PAGAR: Bs {fmtBs(Math.max(0, (base?.totales?.totalBs || 0) - (cobro?.totales?.totalBs || 0)))}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="max-h-[480px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 sticky top-0">
                      <tr>
                        <th className="w-10 text-center px-2">
                          {porContrib ? (
                            ''
                          ) : abonoLocales ? (
                            <input
                              type="checkbox"
                              checked={visiblesU.length > 0 && visiblesU.every((r: any) => claves.includes(r.clave))}
                              onChange={e => {
                                if (e.target.checked) {
                                  setClaves(Array.from(new Set([...claves, ...visiblesU.map((r: any) => r.clave)])));
                                } else {
                                  const visSet = new Set(visiblesU.map((r: any) => r.clave));
                                  setClaves(claves.filter(k => !visSet.has(k)));
                                }
                              }}
                              className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                              title="Seleccionar / deseleccionar todos los visibles"
                            />
                          ) : (
                            <span title="Todas las unidades incluidas en el cobro completo" className="text-emerald-700 text-xs font-bold">✓</span>
                          )}
                        </th>
                        <th className="text-left py-2 px-3">Local / unidad</th>
                        <th className="text-center px-2">Meses a cobrar</th>
                        <th className="text-left px-2">Desde</th>
                        <th className="text-right px-2">Multas</th>
                        <th className="text-right px-4">Deuda</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {visiblesU.slice(0, 400).map((r: any) => {
                        const va = enCobro.has(r.clave);
                        const lc = mapLineas.get(r.clave) as any;
                        const mismoDueno = porContrib && identidad && normId(r.identidad) === normId(identidad);
                        const maxMesesFila = soloMultas
                          ? (lc?.mesesDeuda ?? ((r.multaMeses || 0) + (r.multasManuales || []).length))
                          : (lc?.mesesDeuda ?? (r.deuda?.meses || 0));
                        const mesActualFila = typeof mesesPorUnidad[r.clave] === 'number'
                          ? mesesPorUnidad[r.clave]
                          : (meses !== '' ? Math.min(Number(meses), maxMesesFila) : maxMesesFila);
                        const dMeses = lc ? lc.meses : mesActualFila;
                        const dMultas = lc ? (lc.multaBs + lc.multasAparteBs) : multasDe(r);
                        const dTotal = lc ? lc.totalBs : (soloMultas ? multasDe(r) : r.totalBs);
                        const seleccionada = porContrib
                          ? (claves.includes(r.clave) || !!mismoDueno)
                          : abonoLocales
                            ? claves.includes(r.clave)
                            : true;

                        const handleRowClick = () => {
                          if (porContrib) {
                            toggle(r.clave);
                          } else if (abonoLocales) {
                            toggle(r.clave);
                          } else {
                            // En cobro completo: al hacer click en un local, se activa el modo abono seleccionando este local
                            setAbonoLocales(true);
                            setClaves([r.clave]);
                          }
                        };

                        return (
                          <tr
                            key={r.clave}
                            onClick={handleRowClick}
                            className={`cursor-pointer transition-colors ${
                              porContrib
                                ? (seleccionada ? 'bg-sky-50 hover:bg-sky-100/70' : 'hover:bg-slate-50 opacity-60')
                                : abonoLocales
                                  ? (seleccionada ? 'bg-emerald-50 hover:bg-emerald-100/70 font-medium' : 'hover:bg-slate-50 opacity-60')
                                  : 'hover:bg-emerald-50/40'
                            }`}
                          >
                            <td className="text-center px-2 py-2">
                              {porContrib ? (
                                <input
                                  type="checkbox"
                                  readOnly
                                  checked={seleccionada}
                                  className="w-4 h-4 accent-sky-600 rounded cursor-pointer"
                                />
                              ) : abonoLocales ? (
                                <input
                                  type="checkbox"
                                  readOnly
                                  checked={seleccionada}
                                  className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                                />
                              ) : (
                                <input
                                  type="checkbox"
                                  readOnly
                                  checked={true}
                                  className="w-4 h-4 accent-emerald-600 rounded cursor-pointer opacity-70"
                                  title="Incluido en cobro completo. Haga click para sumar local por local."
                                />
                              )}
                            </td>
                            <td className={`py-2 px-3 ${!seleccionada ? 'opacity-60' : ''}`}>
                              <div className="font-bold text-slate-900 font-mono text-xs">{r.inmueble || (r.clave === '__SIN_REGISTRAR__' ? 'Declaradas sin registrar' : 'Condominio')}{r.numero ? ` · ${r.numero}` : ''}</div>
                              <div className="text-[11px] text-slate-500">{r.propietario || ''}{r.identidad ? ` · ${r.identidad}` : ''}</div>
                              {r.actividad && <div className="text-[10px] text-violet-700 font-bold truncate max-w-[340px]">{r.actividad}</div>}
                              {r.multasManuales?.map((m: any) => <div key={m.id} className="text-[10px] text-red-700">• Multa: {m.concepto} (Bs {fmtBs(m.montoBs)})</div>)}
                              {(() => {
                                const convUnit = (cobro?.convenios || []).find((cv: any) => {
                                  const idClean = (cv.identidad || '').replace(/\D/g, '');
                                  const rIdClean = (r.identidad || '').replace(/\D/g, '');
                                  const inmCode = (r.inmueble || '').replace(/\D/g, '');
                                  const numClean = (cv.numero || '').replace(/\D/g, '');
                                  return (idClean.length >= 4 && idClean === rIdClean) || (inmCode.length >= 3 && numClean.includes(inmCode));
                                });
                                if (!convUnit) return null;
                                const cuotasPend = (convUnit.convenios_cuotas || []).filter((q: any) => (q.estado || '').toLowerCase().includes('pend')).length;
                                return (
                                  <div className="mt-1.5 flex items-center gap-1.5 flex-wrap" onClick={e => e.stopPropagation()}>
                                    <span className="bg-orange-100 text-orange-950 border border-orange-300 px-2 py-0.5 rounded font-extrabold text-[10px] flex items-center gap-1 shadow-2xs">
                                      📋 Convenio: {convUnit.numero} ({cuotasPend || convUnit.cuotas} cuotas pend.)
                                    </span>
                                    <a
                                      href={`/admin/caja?cedula=${encodeURIComponent(r.identidad || '')}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-0.5 rounded font-bold text-[10px] transition-colors shadow-2xs"
                                      title="Cobrar cuota de convenio en Caja General"
                                    >
                                      Cobrar en Caja General ↗
                                    </a>
                                  </div>
                                );
                              })()}
                            </td>
                            <td className="text-center px-2 py-1.5" onClick={e => e.stopPropagation()}>
                              {maxMesesFila > 0 ? (
                                <div className="inline-flex items-center justify-center gap-1">
                                  <select
                                    value={mesActualFila}
                                    onChange={e => {
                                      e.stopPropagation();
                                      const nuevo = Number(e.target.value);
                                      setMesesPorUnidad(prev => ({ ...prev, [r.clave]: nuevo }));
                                      if (abonoLocales && !claves.includes(r.clave)) {
                                        setClaves(prev => [...prev, r.clave]);
                                      } else if (porContrib && !claves.includes(r.clave)) {
                                        setClaves(prev => [...prev, r.clave]);
                                      }
                                    }}
                                    className={`text-xs font-bold py-1 px-1.5 rounded-md border cursor-pointer transition-colors ${
                                      typeof mesesPorUnidad[r.clave] === 'number'
                                        ? 'bg-amber-600 text-white border-amber-700 shadow-xs ring-1 ring-amber-400'
                                        : 'bg-amber-50 text-amber-900 border-amber-300 hover:border-amber-400'
                                    }`}
                                    title={`Escoja cuántos meses cancelar para este hijo/unidad (total deuda: ${maxMesesFila} meses)`}
                                  >
                                    {Array.from({ length: maxMesesFila }, (_, idx) => idx + 1).map(n => (
                                      <option key={n} value={n} className="bg-white text-slate-800 font-medium">
                                        {n === maxMesesFila ? `${n} (Todos)` : `${n} ${n === 1 ? 'mes' : 'meses'}`}
                                      </option>
                                    ))}
                                  </select>
                                  {typeof mesesPorUnidad[r.clave] === 'number' && (
                                    <button
                                      type="button"
                                      onClick={e => {
                                        e.stopPropagation();
                                        setMesesPorUnidad(prev => {
                                          const next = { ...prev };
                                          delete next[r.clave];
                                          return next;
                                        });
                                      }}
                                      className="text-xs text-slate-400 hover:text-red-600 font-bold px-1"
                                      title="Restablecer al valor global de meses"
                                    >
                                      ✕
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-400 text-xs">—</span>
                              )}
                            </td>
                            <td className="px-2 text-xs text-slate-600">
                              {lc && lc.periodos?.length > 0 ? (
                                soloMultas ? lc.periodos.map(fmtPeriodo).join(', ') : fmtPeriodo(lc.periodos[0])
                              ) : (
                                soloMultas ? (() => {
                                  const mEnAseo = (r.deuda?.porMes || []).filter((m: any) => m.multaBs > 0).length;
                                  const mRem = Math.max(0, (r.multaMeses || 0) - mEnAseo);
                                  if (mRem > 0) {
                                    const prevs = periodosMultasPrevias(r.pendienteDesde, mRem);
                                    if (prevs[0]) return fmtPeriodo(prevs[0]);
                                  }
                                  const prim = (r.deuda?.porMes || []).find((m: any) => m.multaBs > 0);
                                  if (prim && r.periodos?.[prim.n - 1]) return fmtPeriodo(r.periodos[prim.n - 1]);
                                  return r.periodos?.[0] ? fmtPeriodo(r.periodos[0]) : '—';
                                })() : (r.periodos?.[0] ? fmtPeriodo(r.periodos[0]) : '—')
                              )}
                            </td>
                            <td className="px-2 text-right text-xs tabular-nums text-red-600">{dMultas > 0 ? fmtBs(dMultas) : '—'}</td>
                            <td className={`px-4 text-right font-bold tabular-nums ${seleccionada ? 'text-red-700' : 'text-slate-400'}`}>Bs {fmtBs(dTotal)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {visiblesU.length > 400 && <div className="px-4 py-2 text-xs text-slate-500">Mostrando 400 de {visiblesU.length}. Use el filtro.</div>}
                </div>
              </div>
            )}
          </div>

          {/* ══ DERECHA: resumen y pago ══ */}
          <div className="space-y-4">
            <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-lg space-y-3 sticky top-4">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-black uppercase tracking-wider text-white/60 flex items-center gap-2"><Receipt className="w-4 h-4" /> A cobrar</div>
                {calculando && <RefreshCw className="w-4 h-4 animate-spin text-white/60" />}
              </div>
              <div className="text-4xl font-black tabular-nums">Bs {formatBs(totalConImpuestos)}</div>

              {/* Si es abono de locales, mostrar claramente Deuda Total y Lo Que Falta */}
              {abonoLocales && (base?.totales?.totalBs || 0) > totalConImpuestos + 0.05 && (
                <div className="bg-white/10 rounded-xl p-3 border border-amber-400/40 mt-2 space-y-1.5">
                  <div className="flex justify-between text-xs text-white/80">
                    <span>Deuda Total Condominio:</span>
                    <span className="font-mono font-bold text-white">Bs {formatBs(base?.totales?.totalBs || 0)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-emerald-300">
                    <span>Monto Abonado Hoy:</span>
                    <span className="font-mono font-bold">Bs {formatBs(totalConImpuestos)}</span>
                  </div>
                  <div className="flex justify-between text-xs font-black text-amber-300 pt-1.5 border-t border-white/10">
                    <span>🔴 FALTA POR PAGAR:</span>
                    <span className="font-mono text-sm font-black text-amber-200">
                      Bs {formatBs(Math.max(0, (base?.totales?.totalBs || 0) - totalConImpuestos))}
                    </span>
                  </div>
                </div>
              )}
              
              {saldoFavorActivo > 0 && (
                <div className="bg-emerald-500/20 border border-emerald-400/50 p-2 rounded-lg flex justify-between items-center mt-2">
                  <div className="flex flex-col">
                    <span className="text-emerald-300 font-bold text-[10px] uppercase tracking-wider">Saldo a Favor Disp.</span>
                    <span className="text-emerald-100 font-mono font-bold text-sm">Bs. {formatBs(saldoFavorActivo)}</span>
                  </div>
                  <label className="text-[10px] flex items-center gap-1 text-emerald-200 cursor-pointer font-bold bg-emerald-900/40 px-2 py-1 rounded">
                    <input type="checkbox" checked={useSaldoFavor} onChange={e => setUseSaldoFavor(e.target.checked)} className="accent-emerald-500" />
                    Aplicar Abono
                  </label>
                </div>
              )}
              {descuentoSaldoFavor > 0 && (
                <>
                  <div className="flex justify-between items-center text-emerald-300 font-medium text-sm pt-2">
                    <span>Saldo a Favor Aplicado:</span>
                    <span className="font-mono font-bold">- Bs. {formatBs(descuentoSaldoFavor)}</span>
                  </div>
                  <div className="flex justify-between items-center text-emerald-200/70 font-medium text-xs pt-1">
                    <span>Quedan disponibles:</span>
                    <span className="font-mono">Bs. {formatBs(Math.max(0, saldoFavorActivo - descuentoSaldoFavor))}</span>
                  </div>
                </>
              )}
              {descuentoSaldoFavor > 0 && (
                <div className="flex justify-between items-center text-white font-black text-xl pt-2 border-t border-white/20 mt-2">
                  <span>NETO A PAGAR:</span>
                  <span className="font-mono">Bs. {formatBs(totalNetoAbonable)}</span>
                </div>
              )}
              
              <div className="text-xs text-white/70">{cobro.lineas.length} renglón(es) · hasta {cobro.totales.meses} mes(es) · tasa Euro Bs {formatBs(cobro.estado.tasa)} · UCD Bs {formatBs(valorUCD(cobro.estado.tasa))}</div>
              <div className="text-xs space-y-1 border-t border-white/10 pt-3">
                <div className="flex justify-between"><span className="text-white/70">Aseo</span><b className="tabular-nums">Bs {fmtBs(cobro.totales.baseBs)}</b></div>
                <div className="flex justify-between"><span className="text-white/70">Multas</span><b className="tabular-nums">Bs {fmtBs(cobro.totales.multaBs)}</b></div>
                {cobro.totales.ivaBs > 0 && <div className="flex justify-between"><span className="text-white/70">IVA 16%</span><b className="tabular-nums">Bs {fmtBs(cobro.totales.ivaBs)}</b></div>}
                {cobro.totales.retencionBs > 0 && <div className="flex justify-between text-violet-300"><span>Retención IVA (75%)</span><b className="tabular-nums">− Bs {fmtBs(cobro.totales.retencionBs)}</b></div>}
              </div>

              <div className="border-t border-white/10 pt-3 space-y-2">
                <div className="text-[11px] font-black uppercase tracking-wider text-white/60">Método de pago (Abonos)</div>
                {pagosAgregados.map((p, i) => (
                  <div key={i} className="flex justify-between items-center bg-white/5 rounded-lg px-2.5 py-1.5 text-xs border border-white/10">
                    <div>
                      <div className="font-bold">{p.metodo} {p.banco ? `- ${p.banco}` : ''}</div>
                      {p.bancoDestino && ['Transferencia', 'Deposito'].includes(p.metodo) && <div className="text-[10px] text-sky-200">A: {p.bancoDestino}</div>}
                      <div className="text-white/60 font-mono">Ref: {p.referencia || 'N/A'} {p.comprobante ? '📎' : ''}</div>
                      <div className="text-[10px] text-slate-300">
                        F. Trans.: {p.fechaTransaccion?.split('-').reverse().join('/') || p.fecha?.split('-').reverse().join('/')} · F. Ingreso Caja: {p.fechaIngresoCaja?.split('-').reverse().join('/') || new Date().toLocaleDateString('es-VE')}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="font-bold tabular-nums text-emerald-400">Bs {fmtBs(p.monto)}</div>
                      <button onClick={() => quitarPago(i)} className="text-red-400 hover:text-red-300 cursor-pointer"><X className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))}
                {faltaPagar < -0.05 && (
                  <div className="bg-emerald-500/20 border border-emerald-500/50 rounded-xl p-3 text-center mb-2">
                    <p className="text-emerald-300 text-xs font-bold uppercase tracking-wide">Genera Saldo a Favor</p>
                    <p className="text-emerald-400 text-base font-black">Bs {fmtBs(Math.abs(faltaPagar))}</p>
                  </div>
                )}
                
                {faltaPagar > 0.05 && pagosAgregados.length > 0 && (
                  <div className="bg-amber-500/20 border border-amber-400/50 rounded-xl p-3 text-center mb-2">
                    <p className="text-amber-200 text-xs font-bold uppercase tracking-wide">🔴 Falta por pagar para completar este cobro</p>
                    <p className="text-amber-300 text-base font-black">Bs {fmtBs(faltaPagar)}</p>
                  </div>
                )}

                {faltaPagar > 0.05 && (
                  <div className="bg-white/5 rounded-xl p-3 border border-white/10 space-y-2 mt-2">
                    <div className="flex gap-2">
                      <select value={metodoAct} onChange={e => setMetodoAct(e.target.value)} className="flex-1 rounded-lg bg-slate-800 border border-white/20 px-2 py-1.5 text-xs outline-none text-white">
                        {METODOS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    <div className="flex bg-slate-800 rounded-lg p-1">
                      <input type="text" inputMode="decimal" placeholder="0,00" value={montoAct} onChange={e => {
                        setMontoAct(formatLocalNumberInput(e.target.value));
                      }} onBlur={e => {
                         const p = parseLocalFloat(e.target.value);
                         if (p > 0) setMontoAct(fmtBs(p));
                      }} className="w-full bg-transparent outline-none text-right font-mono text-white placeholder:text-white/40 text-xs px-2" />
                      <button onClick={() => {
                        let rest = faltaPagar;
                        if (rest > 0) setMontoAct(fmtBs(rest));
                      }} className="px-2 border-l border-white/10 text-xs font-bold text-sky-400 hover:text-sky-300">TODO</button>
                    </div>
                    </div>
                    <>
                      {['Transferencia', 'Deposito'].includes(metodoAct) && (
                        <div className="mb-2">
                          <span className="text-[10px] font-semibold text-white/60 mb-0.5 block">Cuenta Bancaria Receptora (Alcaldía / IAMEC)</span>
                          <select value={bancoDestinoAct} onChange={e => setBancoDestinoAct(e.target.value)} className="w-full rounded-lg bg-slate-800 border border-sky-400/50 px-2 py-1.5 text-xs outline-none text-white font-semibold">
                            <option value="BANCAMIGA - 0172 - 0717">Bancamiga (0172) - 01720110711101340717 (IAMEC BANCAMIGA)</option>
                            <option value="BANESCO - 0134 - 8636">Banesco (0134) - 01341089590001008636 (IAMEC)</option>
                            <option value="BANCO DE VENEZUELA - 0102">Banco de Venezuela (0102)</option>
                            <option value="BANCO MERCANTIL - 0105">Banco Mercantil (0105)</option>
                            <option value="BANCO PROVINCIAL - 0108">Banco Provincial (0108)</option>
                          </select>
                        </div>
                      )}
                      <select value={bancoAct} onChange={e => setBancoAct(e.target.value)} className="w-full rounded-lg bg-slate-800 border border-white/20 px-2 py-1.5 text-xs outline-none text-white">
                        <option value="">Seleccione banco</option>
                        {LISTA_BANCOS.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                      <input type="text" placeholder="Referencia (8 dígitos)" maxLength={8} value={referenciaAct} onChange={e => setReferenciaAct(e.target.value.replace(/\D/g, '').slice(0, 8))} className="w-full rounded-lg bg-slate-800 border border-white/20 px-2 py-1.5 text-xs outline-none font-mono text-white placeholder:text-white/40" />
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[10px] font-semibold text-white/60 mb-0.5 block">F. Transacción (Banco)</span>
                          <input type="date" value={fechaTransaccionAct} onChange={e => { setFechaTransaccionAct(e.target.value); setFechaAct(e.target.value); }} className="w-full rounded-lg bg-slate-800 border border-white/20 px-2 py-1.5 text-xs outline-none text-white [color-scheme:dark]" />
                        </div>
                        <div>
                          <span className="text-[10px] font-semibold text-white/60 mb-0.5 block">F. Ingreso a Caja</span>
                          <input type="date" value={fechaIngresoCajaAct} onChange={e => setFechaIngresoCajaAct(e.target.value)} className="w-full rounded-lg bg-slate-800 border border-white/20 px-2 py-1.5 text-xs outline-none text-white [color-scheme:dark]" />
                        </div>
                      </div>
                      {['Transferencia', 'Deposito'].includes(metodoAct) && (
                        <label className="block w-full text-center py-1.5 border border-dashed border-white/30 rounded-lg text-xs text-white/70 hover:bg-white/10 cursor-pointer overflow-hidden text-ellipsis whitespace-nowrap px-2">
                          {comprobanteAct ? comprobanteAct.name : (metodoAct === 'Transferencia' ? 'Subir comprobante (Obligatorio)' : 'Subir comprobante')}
                          <input type="file" className="hidden" accept="image/*,.pdf" onChange={e => setComprobanteAct(e.target.files?.[0] || null)} />
                        </label>
                      )}
                    </>
                    <button onClick={agregarPago} className="w-full py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"><Layers className="w-3 h-3" /> Añadir Abono</button>
                  </div>
                )}
              </div>

              {/* Facturas digitales que se van a emitir */}
              {cobro.facturas?.length > 0 && (
                <div className="border-t border-white/10 pt-3 space-y-1.5">
                  <div className="text-[11px] font-black uppercase tracking-wider text-white/60 flex items-center gap-2"><FileText className="w-4 h-4" /> Factura(s) digital(es): {cobro.facturas.length}</div>
                  {cobro.facturas.slice(0, 8).map((f: any, i: number) => {
                    const totalFacturaFiscal = f.totalBrutoBs || (f.totalBs + (f.retencionBs || 0));
                    const retencion = f.retencionBs || 0;
                    return (
                      <div key={i} className="flex justify-between gap-2 text-xs bg-white/5 rounded-lg px-2.5 py-1.5">
                        <div className="min-w-0">
                          <div className="font-bold truncate">{f.nombre}</div>
                          <div className="font-mono text-white/60">{f.identidad} · {f.lineas.length} renglón(es)</div>
                          {retencion > 0 && (
                            <div className="text-[10px] text-emerald-300">
                              Factura: Bs {fmtBs(totalFacturaFiscal)} · Ret. 75%: -Bs {fmtBs(retencion)}
                            </div>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <b className="tabular-nums block">Bs {fmtBs(totalFacturaFiscal)}</b>
                          {retencion > 0 && (
                            <div className="text-[10px] text-sky-300">A pagar: Bs {fmtBs(f.totalBs)}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {cobro.facturas.length > 8 && <div className="text-[11px] text-white/60">… y {cobro.facturas.length - 8} más.</div>}
                </div>
              )}
              {sinSeleccion && (
                <div className="rounded-xl bg-sky-400/15 border border-sky-300/40 text-sky-100 text-xs p-2.5">
                  {porContrib ? 'Escriba la cédula del contribuyente o marque sus locales.' : 'Marque los locales que desea incluir en este abono al condominio.'}
                </div>
              )}

              {/* Nota de crédito que le quedará al contribuyente */}
              {cobro.lineas?.length > 0 && (faltaPagar < -0.05 || (saldoFavorActivo > 0 && descuentoSaldoFavor > 0)) && (
                <div id="nota-credito-quedara" className="rounded-xl bg-amber-400/15 border border-amber-300/40 text-amber-100 text-xs p-2.5 space-y-1">
                  {faltaPagar < -0.05 && (
                    <div className="flex justify-between gap-2"><span className="font-bold">Nota de crédito por excedente</span><b className="tabular-nums">Bs {fmtBs(Math.abs(faltaPagar))}</b></div>
                  )}
                  <div className="flex justify-between gap-2"><span>Saldo a favor que le quedará</span><b className="tabular-nums">Bs {fmtBs(Math.max(0, saldoFavorActivo - descuentoSaldoFavor) + (faltaPagar < -0.05 ? Math.abs(faltaPagar) : 0))}</b></div>
                </div>
              )}

              {/* Información de Convenio si la unidad en cobro lo tiene */}
              {(() => {
                const convsEnCobro = (cobro?.convenios || []).filter((cv: any) => {
                  const idClean = (cv.identidad || '').replace(/\D/g, '');
                  const numClean = (cv.numero || '').replace(/\D/g, '');
                  return cobro.lineas.some((l: any) => {
                    const lIdClean = (l.identidad || '').replace(/\D/g, '');
                    const lInmClean = (l.inmueble || '').replace(/\D/g, '');
                    return (idClean.length >= 4 && idClean === lIdClean) || (lInmClean.length >= 3 && numClean.includes(lInmClean));
                  });
                });
                if (convsEnCobro.length === 0) return null;
                return (
                  <div className="rounded-xl bg-orange-500/15 border border-orange-400/40 text-orange-200 text-xs p-3 space-y-1.5 mb-2">
                    <div className="font-extrabold flex items-center gap-1.5 text-orange-300">
                      <span>📋</span>
                      <span>Convenio de Pago Activo ({convsEnCobro.map((c: any) => c.numero).join(', ')})</span>
                    </div>
                    <p className="text-[11px] text-orange-200/90 leading-tight">
                      Este propietario tiene un convenio formalizado. Las cuotas se cobran por Caja General.
                    </p>
                    <a
                      href={`/admin/caja?cedula=${encodeURIComponent(convsEnCobro[0].identidad || '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-300 hover:text-white underline pt-0.5"
                    >
                      Ir a Caja General para cobrar cuotas →
                    </a>
                  </div>
                );
              })()}

              {activa ? (
                <button id="btn-cobrar-condominio" onClick={cobrar} disabled={cobrando || calculando || !cobro.lineas.length || faltaPagar > 0.05}
                  className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-black text-base flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50">
                  {cobrando ? <RefreshCw className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />} {faltaPagar > 0.05 ? `Falta Bs ${fmtBs(faltaPagar)}` : `Registrar Cobro`}
                </button>
              ) : (
                <>
                  <div className="rounded-xl bg-amber-400/15 border border-amber-300/40 text-amber-200 text-xs p-2.5 flex gap-2"><ShieldAlert className="w-4 h-4 shrink-0" /> Modo prueba: puede revisar el cálculo y el recibo, pero no se registra ningún pago.</div>
                  <button id="btn-recibo-prueba" onClick={verReciboPrueba} disabled={!cobro.lineas.length} className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 font-black text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50">
                    <Printer className="w-4 h-4" /> Ver recibo de prueba
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ RECIBO ══ */}
      {recibo && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 print:static print:bg-white print:p-0">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto print:shadow-none print:max-h-none print:rounded-none">
            <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 print:hidden">
              <div className="font-extrabold flex items-center gap-2">{recibo.prueba ? <FlaskConical className="w-5 h-5 text-amber-600" /> : <CheckCircle2 className="w-5 h-5 text-emerald-600" />} {recibo.prueba ? 'Recibo de prueba' : 'Pago registrado'}</div>
              <div className="flex gap-2">
                <button onClick={() => window.print()} className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"><Printer className="w-4 h-4" /> Imprimir</button>
                <button onClick={() => setRecibo(null)} className="p-1.5 text-slate-500 hover:text-slate-900 cursor-pointer"><X className="w-5 h-5" /></button>
              </div>
            </div>
            <div className="p-6 text-sm space-y-6" id="recibo-condominio">
              {(recibo.partes?.length ? recibo.partes : [{ reciboRef: recibo.reciboRef, identidad: recibo.cobro.condo.identidad, nombre: recibo.cobro.condo.nombre, monto: recibo.monto }]).map((p: any, i: number) => {
                const f = recibo.cobro.facturas?.[i];
                const ls = f ? recibo.cobro.lineas.filter((l: any) => f.lineas.includes(l.clave)) : recibo.cobro.lineas;
                const tt = (k: string) => ls.reduce((a: number, l: any) => a + (Number(l[k]) || 0), 0);
                const n = recibo.partes?.length || 1;
                return (
                  <div key={i} className={`space-y-3 ${i > 0 ? 'pt-6 border-t-2 border-dashed border-slate-300 print:break-before-page' : ''}`}>
                    {recibo.prueba && <div className="text-center font-black text-amber-700 border-2 border-amber-400 rounded-lg py-1">PRUEBA — NO ES UN PAGO REGISTRADO</div>}
                    <div className="flex justify-between items-start">
                      <div><div className="font-black text-lg">Alcaldía de Naguanagua · Aseo Urbano</div><div className="text-xs text-slate-500">Recibo de pago · {recibo.cobro.condo.nombre}{n > 1 ? ` · parte ${i + 1} de ${n}` : ''}</div></div>
                      <div className="text-right text-xs">
                        <div className="font-mono font-bold">{p.reciboRef}</div>
                        <div>Emisión: {recibo.fecha.toLocaleString('es-VE')}</div>
                        <div className="text-[10px] text-slate-500">F. Transacción: {recibo.fechaTransaccion || fechaTransaccionAct || new Date().toISOString().slice(0, 10)}</div>
                        <div className="text-[10px] text-slate-500">F. Ingreso Caja: {recibo.fechaIngresoCaja || fechaIngresoCajaAct || new Date().toISOString().slice(0, 10)}</div>
                      </div>
                    </div>
                    <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs">
                      <div className="text-[10px] uppercase font-bold text-slate-500">Factura a nombre de</div>
                      <div className="font-bold text-sm">{p.nombre}</div>
                      <div className="font-mono">{p.identidad}{recibo.cobro.modo === 'CONTRIBUYENTE' ? ` · en ${recibo.cobro.condo.codigo}` : ` · ${recibo.cobro.condo.codigo}`}</div>
                    </div>
                    <table className="w-full text-xs">
                      <thead className="border-b border-slate-300"><tr><th className="text-left py-1">Local / unidad</th><th className="text-left">Períodos</th><th className="text-center">Meses</th><th className="text-right">Monto Bs</th></tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {ls.slice(0, 300).map((l: any) => (
                          <tr key={l.clave}><td className="py-1 font-mono">{l.inmueble || 'Condominio'}{l.numero ? ` · ${l.numero}` : ''}{l.actividad ? <div className="font-sans text-[10px] text-slate-500">{l.actividad}</div> : null}</td><td>{rango(l.periodos)}{l.multasAparteBs > 0 ? <div className="text-[10px] text-red-700">+ multas Bs {fmtBs(l.multasAparteBs)}</div> : null}</td><td className="text-center">{l.meses}</td><td className="text-right tabular-nums">{fmtBs(l.totalBs)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                    {ls.length > 300 && <div className="text-[11px] text-slate-500">… y {ls.length - 300} unidades más.</div>}
                    <div className="ml-auto max-w-xs text-xs space-y-0.5">
                      <div className="flex justify-between"><span>Aseo</span><span className="tabular-nums">{fmtBs(tt('baseBs'))}</span></div>
                      <div className="flex justify-between"><span>Multas</span><span className="tabular-nums">{fmtBs(tt('multaBs') + tt('multasAparteBs'))}</span></div>
                      {tt('ivaBs') > 0 && <div className="flex justify-between"><span>IVA 16%</span><span className="tabular-nums">{fmtBs(tt('ivaBs'))}</span></div>}
                      {tt('ivaBs') > 0 && <div className="flex justify-between font-bold text-slate-800 border-t border-slate-200 pt-0.5"><span>Total Factura Fiscal</span><span className="tabular-nums">Bs {fmtBs(tt('baseBs') + tt('multaBs') + tt('multasAparteBs') + tt('ivaBs'))}</span></div>}
                      {tt('retencionBs') > 0 && <div className="flex justify-between text-emerald-700"><span>Retención IVA</span><span className="tabular-nums">− {fmtBs(tt('retencionBs'))}</span></div>}
                      <div className="flex justify-between font-black text-base border-t border-slate-300 pt-1"><span>Total</span><span className="tabular-nums">Bs {fmtBs(p.monto)}</span></div>
                    </div>
                  </div>
                );
              })}
              {(recibo.partes?.length || 0) > 1 && <div className="rounded-lg bg-sky-50 border border-sky-200 p-2.5 text-xs text-sky-900">Un solo pago de <b>Bs {fmtBs(recibo.monto)}</b> repartido en {recibo.partes.length} facturas (una por dueño).</div>}
              {((recibo.saldoFavorGenerado > 0) || ((recibo.montoRecibido || 0) > (recibo.monto || 0) + 0.01)) && (
                <div className="rounded-xl bg-emerald-50 border-2 border-emerald-400 p-4 text-xs text-emerald-950 space-y-2 shadow-xs">
                  <div className="flex items-center justify-between font-black text-emerald-900 uppercase tracking-wide">
                    <span className="flex items-center gap-1.5 text-sm"><CheckCircle2 className="w-5 h-5 text-emerald-600" /> Nota de Crédito / Saldo a Favor Generado</span>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-200 text-emerald-900 border border-emerald-500 shadow-xs">VIGENTE</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 pt-2 border-t border-emerald-200 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-500 font-bold uppercase block">Monto Pagado / Recibido</span>
                      <span className="font-bold text-slate-800 text-sm">Bs {fmtBs(recibo.montoRecibido || (recibo.monto + recibo.saldoFavorGenerado))}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 font-bold uppercase block">Total Deuda Cancelada</span>
                      <span className="font-bold text-slate-800 text-sm">Bs {fmtBs(recibo.monto)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-emerald-700 font-bold uppercase block">Nota de Crédito Acreditada</span>
                      <span className="font-black text-emerald-700 text-base">Bs {fmtBs(recibo.saldoFavorGenerado || ((recibo.montoRecibido || 0) - (recibo.monto || 0)))}</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-emerald-800 italic pt-0.5">
                    Este excedente ha sido acreditado exitosamente como Nota de Crédito y Saldo a Favor, disponible para descontarse en el próximo recibo.
                  </p>
                </div>
              )}
              <div className="text-xs text-slate-600">Forma de pago: <b>{recibo.metodo}</b>{recibo.banco ? ` · ${recibo.banco}` : ''}{recibo.referencia ? ` · Ref. ${recibo.referencia}` : ''} · Tasa Euro Bs {fmtBs(recibo.cobro.estado.tasa)}</div>
              {!recibo.prueba && <div className="text-[11px] text-slate-500">Las facturas digitales quedan listas en Facturación Electrónica.</div>}
            </div>
          </div>
        </div>
      )}

      {/* ══ INTERRUPTOR ══ */}
      {isNotaModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-lg">
              <h3 className="font-bold text-slate-800">Generar Nota de Crédito Manual</h3>
              <button onClick={() => setIsNotaModalOpen(false)} className="text-slate-500 hover:text-slate-700 font-bold">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Monto (Bs)</label>
                <input 
                  type="text" 
                  inputMode="decimal"
                  value={notaManualMonto} 
                  onChange={e => setNotaManualMonto(formatLocalNumberInput(e.target.value))}
                  onBlur={e => {
                    const p = parseLocalFloat(e.target.value);
                    if (p > 0) setNotaManualMonto(formatLocalNumberInput(p.toFixed(2).replace('.', ',')));
                  }}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-slate-800" 
                  placeholder="Ej. 1.000,00" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Motivo / Referencia Origen (8 caracteres)</label>
                <input type="text" maxLength={8} value={notaManualRef} onChange={e => setNotaManualRef(e.target.value.slice(0, 8))}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="Ej. 12345678" />
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 bg-slate-50 rounded-b-lg flex justify-end gap-3">
              <button onClick={() => setIsNotaModalOpen(false)} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded">Cancelar</button>
              <button onClick={handleCrearNotaManual} className="px-4 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded shadow-sm">Generar Nota</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL EDITAR NOTA DE CRÉDITO ══ */}
      {notaEditando && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-xl">
              <div className="flex items-center gap-2">
                <span className="text-base">✏️</span>
                <h3 className="font-bold text-slate-800 text-sm">Editar Nota de Crédito Manual</h3>
              </div>
              <button 
                onClick={() => setNotaEditando(null)} 
                disabled={guardandoEditNota}
                className="text-slate-400 hover:text-slate-700 font-bold text-lg"
              >
                &times;
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900">
                Al modificar el monto, el <strong>saldo a favor / abono</strong> del condominio se ajustará automáticamente por la diferencia.
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Monto de la Nota (Bs)</label>
                <input 
                  type="text" 
                  inputMode="decimal"
                  value={notaEditMonto} 
                  onChange={e => setNotaEditMonto(formatLocalNumberInput(e.target.value))}
                  onBlur={e => {
                    const p = parseLocalFloat(e.target.value);
                    if (p > 0) setNotaEditMonto(formatLocalNumberInput(p.toFixed(2).replace('.', ',')));
                  }}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-800" 
                  placeholder="Ej. 1.000,00" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Referencia / Comprobante Origen</label>
                <input 
                  type="text" 
                  value={notaEditRef} 
                  onChange={e => setNotaEditRef(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none uppercase font-mono" 
                  placeholder="Ej. REF-12345678" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Motivo / Concepto</label>
                <input 
                  type="text" 
                  value={notaEditMotivo} 
                  onChange={e => setNotaEditMotivo(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                  placeholder="Ej. Ajuste de saldo por pago excedente" 
                />
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 bg-slate-50 rounded-b-xl flex justify-end gap-3">
              <button 
                onClick={() => setNotaEditando(null)} 
                disabled={guardandoEditNota}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={handleGuardarEditarNota} 
                disabled={guardandoEditNota}
                className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
              >
                {guardandoEditNota ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalInt && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="font-black text-lg flex items-center gap-2"><Power className="w-5 h-5" /> {activa ? 'Pasar la Caja de Condominios a modo prueba' : 'Activar la Caja de Condominios'}</div>
            {!activa && <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-800">Al activarla, los cobros quedan <b>registrados de verdad</b>: bajan la deuda en Condominios y van a Facturación Electrónica.</div>}
            <input value={motivoInt} onChange={e => setMotivoInt(e.target.value)} placeholder="Motivo (queda en Auditoría)" className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setModalInt(false)} className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold cursor-pointer">Cancelar</button>
              <button onClick={cambiarInterruptor} className={`px-4 py-2 rounded-xl text-xs font-black text-white cursor-pointer ${activa ? 'bg-amber-600' : 'bg-emerald-600'}`}>{activa ? 'Pasar a prueba' : 'Activar'}</button>
            </div>
          </div>
        </div>
      )}
      {/* ══ MODAL ACTUALIZAR DATOS DE CONTACTO (Imagen 2) ══ */}
      {modalContacto && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-amber-300">
            <div className="p-5 border-b border-amber-100 bg-amber-500 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">⚠️</span>
                <h3 className="font-black text-base text-white tracking-wide">Actualizar Datos de Contacto</h3>
              </div>
              <button 
                onClick={() => { setContactoOmitido(true); setModalContacto(false); }} 
                className="text-white/80 hover:text-white font-bold text-lg p-1 cursor-pointer"
              >
                &times;
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-700 font-medium leading-relaxed bg-amber-50 p-3 rounded-xl border border-amber-200">
                El contribuyente o condominio no posee número telefónico ni correo electrónico registrados en el sistema. Por favor actualice sus datos para continuar:
              </p>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Número de Teléfono</label>
                <input 
                  type="text" 
                  value={contactoTelefono} 
                  onChange={e => setContactoTelefono(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 outline-none" 
                  placeholder="Ej. 0414-1234567 / 0241-8971234" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Correo Electrónico</label>
                <input 
                  type="email" 
                  value={contactoCorreo} 
                  onChange={e => setContactoCorreo(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 outline-none" 
                  placeholder="Ej. contribuyente@correo.com" 
                />
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2.5">
              <button 
                type="button"
                onClick={() => { setContactoOmitido(true); setModalContacto(false); }} 
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl cursor-pointer"
              >
                Omitir por ahora
              </button>
              <button 
                type="button"
                onClick={handleGuardarContacto} 
                disabled={guardandoContacto}
                className="px-5 py-2 text-xs font-black text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-xl shadow-sm cursor-pointer"
              >
                {guardandoContacto ? 'Guardando…' : 'Actualizar Datos'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL EDITAR / AGREGAR NOTAS DEL CONDOMINIO ══ */}
      {modalNotas && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-amber-300 animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-amber-200 bg-amber-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <StickyNote className="w-5 h-5 text-amber-100" />
                <div>
                  <h3 className="font-black text-base text-white tracking-wide">Notas del Condominio</h3>
                  <p className="text-[11px] text-amber-100">{c?.nombre} ({c?.codigo})</p>
                </div>
              </div>
              <button 
                onClick={() => setModalNotas(false)} 
                className="text-white/80 hover:text-white font-bold text-xl p-1 cursor-pointer leading-none"
              >
                &times;
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-slate-600 font-medium">
                Estas notas son visibles para cajeros y operadores al gestionar o consultar este condominio:
              </p>
              <textarea 
                rows={5}
                value={notaCondominio}
                onChange={e => setNotaCondominio(e.target.value)}
                placeholder="Escriba aquí observaciones del condominio, acuerdos, teléfonos de la junta, historial..."
                className="w-full border border-slate-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-amber-500 outline-none leading-relaxed"
              />
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2.5">
              <button 
                type="button"
                onClick={() => setModalNotas(false)} 
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button 
                type="button"
                onClick={handleGuardarNota} 
                disabled={guardandoNota}
                className="px-5 py-2 text-xs font-black text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded-xl shadow-sm cursor-pointer"
              >
                {guardandoNota ? 'Guardando…' : 'Guardar Nota'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Link href="/admin/condominios" className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700 hover:text-emerald-900 print:hidden"><ArrowLeft className="w-4 h-4" /> Lista de condominios</Link>
    </div>
  );
}

export default function CajaCondominiosPage() {
  return <Suspense fallback={<div className="p-6 text-slate-500">Cargando…</div>}><Caja /></Suspense>;
}
