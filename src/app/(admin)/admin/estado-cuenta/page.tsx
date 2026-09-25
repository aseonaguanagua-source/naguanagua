'use client';
import React, { useState, useEffect } from 'react';
import { DataTable } from '@/components/DataTable';
import { FileSpreadsheet, Download, Filter, RefreshCw, Zap, Printer, X, CheckCircle, XCircle } from 'lucide-react';
import { useAppContext } from '@/store/AppContext';
import { supabase } from '@/lib/supabase';
import { logAudit } from '@/lib/audit';
import tarifasData from '@/data/tarifas.json';
import { ReciboImprimible } from '@/components/ReciboImprimible';

export default function EstadoCuentaPage() {
  const { inmuebles } = useAppContext();
  const [tcmmv, setTcmmv] = useState<number | null>(null);
  const [loadingTasa, setLoadingTasa] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedRecibo, setSelectedRecibo] = useState<any>(null);

  // Recibos frescas desde Supabase (no del contexto React que puede estar desactualizado)
  const [facturasDb, setFacturasDb] = useState<any[]>([]);
  const [loadingFacturas, setLoadingFacturas] = useState(false);
  
  const [activeTab, setActiveTab] = useState<'General' | 'PorVerificar' | 'Historial'>('General');
  const [pagosVerificar, setPagosVerificar] = useState<any[]>([]);
  const [pagosHistorial, setPagosHistorial] = useState<any[]>([]);
  const [abonosAprobados, setAbonosAprobados] = useState<any[]>([]);
  const [allPagos, setAllPagos] = useState<any[]>([]);
  const [loadingPagos, setLoadingPagos] = useState(false);

  const [filterStatus, setFilterStatus] = useState('Todos');
  const [actionModal, setActionModal] = useState<{ isOpen: boolean, action: 'Anular' | 'Reversar' | 'Condonar' | 'Eliminar Multa', recibo: any, nota: string }>({ isOpen: false, action: 'Anular', recibo: null, nota: '' });
  
  // Handle both jsonb (object) and text (string) detalles column
  const parseDetalles = (raw: any): any => {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw); } catch(e) { return {}; }
  };

  // Carga fresca de recibos desde Supabase (para que los pagos recientes aparezcan de inmediato)
  const fetchFacturasDb = async () => {
    setLoadingFacturas(true);
    try {
      let all: any[] = [];
      let from = 0;
      const step = 999;
      let more = true;
      while (more) {
        const { data: chunk, error } = await supabase
          .from('facturas')
          .select('*')
          .order('emision', { ascending: true }) // orden consistente en cada chunk
          .range(from, from + step);
        if (error) { console.error('Error cargando chunk:', error); break; }
        if (chunk && chunk.length > 0) {
          all = [...all, ...chunk];
          from += step + 1;
          if (chunk.length < step + 1) more = false; // último chunk parcial
        } else {
          more = false;
        }
      }
      // El array ya viene ordenado por emision asc desde Supabase — no necesitamos re-ordenar.
      // Pero por seguridad lo afirmamos en el cliente también:
      all.sort((a: any, b: any) => {
        const dA = new Date(a.emision || '1900-01-01').getTime();
        const dB = new Date(b.emision || '1900-01-01').getTime();
        return dA - dB; // más antiguos primero
      });
      setFacturasDb(all);
    } catch (e) {
      console.error('Error cargando recibos:', e);
    }
    setLoadingFacturas(false);
  };

  const filteredFacturas = facturasDb.filter((f: any) => {
    if (filterStatus === 'Todos') return true;
    return f.estado === filterStatus;
  });

  const fetchPagos = async () => {
    setLoadingPagos(true);
    try {
      const { data, error } = await supabase
        .from('pagos_reportados')
        .select('*')
        .eq('estado', 'Por Verificar')
        .order('created_at', { ascending: false });
      
      if (data) setPagosVerificar(data);
    } catch (e) {
      console.log('Tabla pagos_reportados no existe a├║n o hubo un error');
    }
    setLoadingPagos(false);
  };

  const fetchHistorial = async () => {
    setLoadingPagos(true);
    try {
      const { data } = await supabase
        .from('pagos_reportados')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(300);
      if (data) setPagosHistorial(data);
    } catch (e) {}
    setLoadingPagos(false);
  };

  const fetchAbonos = async () => {
    try { const { data } = await supabase.from('pagos_reportados').select('*').order('created_at', { ascending: false }).limit(2000); if(data) setAllPagos(data); } catch(e){}
    try {
      const { data } = await supabase
        .from('pagos_reportados')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (data) {
        const abonos = data.filter((p: any) => parseDetalles(p.detalles).es_abono === true);
        setAbonosAprobados(abonos);
      }
    } catch(e) { console.error('fetchAbonos:', e); }
  };

  useEffect(() => {
    fetchAbonos();
    fetchFacturasDb();
  }, []);

  useEffect(() => {
    if (activeTab === 'PorVerificar') fetchPagos();
    if (activeTab === 'Historial') fetchHistorial();
  }, [activeTab]);

  const procesarPago = async (pago: any, accion: 'Aprobar' | 'Rechazar') => {
    if (!confirm(`┬┐Est├ís seguro de ${accion.toUpperCase()} este pago por Bs. ${pago.monto}?`)) return;

    try {
      // 1. Update the pago record
      await supabase.from('pagos_reportados').update({ estado: accion === 'Aprobar' ? 'Aprobado' : 'Rechazado' }).eq('id', pago.id);

      // 2. Parse details
      const detalles = { ...{ recibos: [] as string[], cuotas: [] as any[] }, ...parseDetalles(pago.detalles) };

      // 3. Update related items
      if (accion === 'Rechazar') {
        // Simple revert to Pendiente
        if (detalles.recibos && detalles.recibos.length > 0) {
          await supabase.from('facturas').update({ estado: 'Pendiente' }).in('referencia', detalles.recibos);
        }
        if (detalles.cuotas && detalles.cuotas.length > 0) {
          const { data: convs } = await supabase.from('convenios').select('*');
          if (convs) {
            const convMap = new Map();
            detalles.cuotas.forEach((sc: any) => {
              if (!convMap.has(sc.convId)) convMap.set(sc.convId, { toUpdate: [] });
              convMap.get(sc.convId).toUpdate.push(sc.cuotaId);
            });
            for (const [cId, data] of convMap.entries()) {
              const rawConv = convs.find(c => c.id === cId);
              if (rawConv) {
                let parsed = [];
                try { parsed = JSON.parse(rawConv.detalle_cuotas); } catch(e){}
                parsed.forEach((c: any) => {
                  if (data.toUpdate.includes(c.id)) c.estado = 'Pendiente';
                });
                await supabase.from('convenios').update({ detalle_cuotas: JSON.stringify(parsed) }).eq('id', cId);
              }
            }
          }
        }
      } else if (accion === 'Aprobar') {
        const esAbono = (detalles as any).es_abono === true;

        if (!esAbono) {
          // Pago completo normal
          if (detalles.recibos && detalles.recibos.length > 0) {
            await supabase.from('facturas').update({ estado: 'Pagado' }).in('referencia', detalles.recibos);
          }
          if (detalles.cuotas && detalles.cuotas.length > 0) {
            const { data: convs } = await supabase.from('convenios').select('*');
            if (convs) {
              const convMap = new Map();
              detalles.cuotas.forEach((sc: any) => {
                if (!convMap.has(sc.convId)) convMap.set(sc.convId, { toUpdate: [] });
                convMap.get(sc.convId).toUpdate.push(sc.cuotaId);
              });
              for (const [cId, data] of convMap.entries()) {
                const rawConv = convs.find(c => c.id === cId);
                if (rawConv) {
                  let parsed = [];
                  try { parsed = JSON.parse(rawConv.detalle_cuotas); } catch(e){}
                  parsed.forEach((c: any) => {
                    if (data.toUpdate.includes(c.id)) c.estado = 'Pagado';
                  });
                  await supabase.from('convenios').update({ detalle_cuotas: JSON.stringify(parsed) }).eq('id', cId);
                }
              }
            }
          }
          // Servicios especiales - pago completo
          if ((detalles as any).servicios && (detalles as any).servicios.length > 0) {
            await supabase.from('servicios_especiales').update({ estado: 'Pagado' }).in('referencia', (detalles as any).servicios);
          }
        } else {
          // L├ôGICA DE ABONO (Pago Parcial)
          let dineroDisponible = parseFloat(pago.monto);

          // 1. Process Recibos first
          if (detalles.recibos && detalles.recibos.length > 0) {
            const { data: facturasData } = await supabase.from('facturas').select('*').in('referencia', detalles.recibos).order('emision', { ascending: true });
            if (facturasData) {
              for (const f of facturasData) {
                const montoFac = parseFloat((f.monto || '0').replace(/[^\d.]/g, ''));
                if (dineroDisponible >= montoFac) {
                  dineroDisponible -= montoFac;
                  await supabase.from('facturas').update({ estado: 'Pagado' }).eq('id', f.id);
                } else if (dineroDisponible > 0) {
                  const montoRestante = (montoFac - dineroDisponible).toFixed(2);
                  await supabase.from('facturas').update({ estado: 'Pendiente', monto: `${montoRestante} Bs` }).eq('id', f.id);
                  dineroDisponible = 0;
                } else {
                  await supabase.from('facturas').update({ estado: 'Pendiente' }).eq('id', f.id);
                }
              }
            }
          }

          // 2. Process Cuotas
          if (detalles.cuotas && detalles.cuotas.length > 0) {
            const { data: convs } = await supabase.from('convenios').select('*');
            if (convs) {
              // Extract all selected cuotas to sort them by date across all convenios
              let flatCuotas: any[] = [];
              detalles.cuotas.forEach((sc: any) => {
                const rawConv = convs.find(c => c.id === sc.convId);
                if (rawConv) {
                  let parsed = [];
                  try { parsed = JSON.parse(rawConv.detalle_cuotas); } catch(e){}
                  const cuotaObj = parsed.find((c: any) => c.id === sc.cuotaId);
                  if (cuotaObj) {
                    flatCuotas.push({ ...cuotaObj, convId: sc.convId, rawConv });
                  }
                }
              });

              // Sort by date oldest first
              flatCuotas.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

              // Apply dinero
              const convUpdates = new Map();
              for (const c of flatCuotas) {
                const montoC = parseFloat(c.monto || '0');
                let newEstado = 'Pendiente';
                let newMonto = c.monto;

                if (dineroDisponible >= montoC) {
                  dineroDisponible -= montoC;
                  newEstado = 'Pagado';
                } else if (dineroDisponible > 0) {
                  const montoRestante = (montoC - dineroDisponible).toFixed(2);
                  newEstado = 'Pendiente';
                  newMonto = `${montoRestante}`;
                  dineroDisponible = 0;
                }

                if (!convUpdates.has(c.convId)) {
                  let parsed = [];
                  try { parsed = JSON.parse(c.rawConv.detalle_cuotas); } catch(e){}
                  convUpdates.set(c.convId, parsed);
                }
                const parsedList = convUpdates.get(c.convId);
                const targetCuota = parsedList.find((tc: any) => tc.id === c.id);
                if (targetCuota) {
                  targetCuota.estado = newEstado;
                  targetCuota.monto = newMonto;
                }
              }

              for (const [cId, parsed] of convUpdates.entries()) {
                await supabase.from('convenios').update({ detalle_cuotas: JSON.stringify(parsed) }).eq('id', cId);
              }
            }
          }

          // 3. Servicios Especiales: solo se pagan completos, no hay abono parcial
          if ((detalles as any).servicios && (detalles as any).servicios.length > 0) {
            const { data: servData } = await supabase
              .from('servicios_especiales')
              .select('*')
              .in('referencia', (detalles as any).servicios);
            if (servData) {
              for (const s of servData) {
                const montoS = parseFloat((s.monto || '0').toString().replace(/[^\d.]/g, ''));
                if (dineroDisponible >= montoS - 0.01) {
                  // Alcanza para cubrir el servicio completo
                  dineroDisponible = Math.max(0, dineroDisponible - montoS);
                  await supabase.from('servicios_especiales').update({ estado: 'Pagado' }).eq('id', s.id);
                }
                // Si no alcanza: servicio queda Pendiente INTACTO
              }
            }
          }
        }
      }

      // 4. Handle Saldo a Favor
      if (accion === 'Aprobar' && (detalles as any).saldo_favor > 0) {
        const saldoFavor = parseFloat((detalles as any).saldo_favor);
        
        // Fetch current inmuebles for this taxpayer
        const { data: userInmuebles } = await supabase.from('inmuebles').select('id, saldo_favor_bs').eq('identidad', pago.identidad);
        
        if (userInmuebles && userInmuebles.length > 0) {
          // Add the total saldo_favor to the first property (or distribute it, but usually adding to the first is fine)
          const firstInmueble = userInmuebles[0];
          const newSaldo = parseFloat(firstInmueble.saldo_favor_bs || '0') + saldoFavor;
          await supabase.from('inmuebles').update({ saldo_favor_bs: newSaldo }).eq('id', firstInmueble.id);
        }
      }

      logAudit(`Pago ${accion} (Estado Cuenta)`, { id: pago.id, monto: pago.monto, referencia: pago.referencia, banco: pago.banco, tipo: pago.tipo, identidad: pago.identidad }, 'TRANSFERENCIA');
      alert(`Pago ${accion.toLowerCase()}o exitosamente.`);
      window.location.reload();
    } catch (e: any) {
      alert("Error: " + e.message);
    }
  };

  const handleOpenRecibo = async (row: any, abonoOverride?: any) => {
    let montoNumerico = parseFloat(String(row.monto || '0').replace(/[^\d.]/g, '')) || 0;

    // Calcular monto dinámico igual que Caja (CM- y RECIB-) usando tcmmv actual
    if (tcmmv && tcmmv > 0 && row.referencia && row.estado !== 'Pagado' && row.estado !== 'Abonado') {
      // Obtener identidad de la recibo
      const rowId = (row.identidad || '').replace(/-/g, '').toUpperCase();
      const userInmsForCalc = (inmuebles as any[]).filter((i: any) =>
        (i.identidad || '').replace(/-/g, '').toUpperCase() === rowId
      );
      if (userInmsForCalc.length > 0) {
        if (row.referencia.startsWith('CM-')) {
          // CM- = 1 mes: cant_inmuebles × mmv_mes × tcmmv
          let monthlyMMV = 0;
          userInmsForCalc.forEach((inm: any) => {
            const cant = parseFloat(inm.cant_inmuebles || 1);
            const mmv  = parseFloat(inm.mmv_mes || 0);
            if (mmv > 0) monthlyMMV += cant * mmv;
          });
          if (monthlyMMV > 0) montoNumerico = parseFloat((monthlyMMV * tcmmv).toFixed(2));
        } else if (row.referencia.startsWith('RECIB-')) {
          // RECIB- = deuda acumulada: (deuda_mmv × tcmmv) + deuda_congelada_bs
          let totalDeudaMMV = 0;
          let totalCongelada = 0;
          userInmsForCalc.forEach((inm: any) => {
            totalDeudaMMV += parseFloat(inm.deuda_mmv || 0);
            totalCongelada += parseFloat(inm.deuda_congelada_bs || 0);
          });
          if (totalDeudaMMV > 0 || totalCongelada > 0) montoNumerico = parseFloat(((totalDeudaMMV * tcmmv) + totalCongelada).toFixed(2));
        }
      }
    }
    let montoCancelado: number | undefined = undefined;
    let montoPendiente: number | undefined = undefined;
    let esAbono = false;
    let historialPagos: any[] | undefined = undefined;
    let tasaBcvAplicada: number | undefined = undefined;

    // Obtener mes y año
    let mesTexto = '---';
    if (row.emision) {
      const meses = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
      const parts = row.emision.split('-');
      if (parts.length >= 2) {
        mesTexto = `${meses[parseInt(parts[1]) - 1]} ${parts[0]}`;
      }
    }

    const cajeroActivo = (() => {
      if (typeof window !== 'undefined') {
        const user = localStorage.getItem('adminUser');
        const letra = localStorage.getItem('adminLetra');
        if (user && letra) return `${letra}-${user}`;
        if (user) return user;
      }
      return 'ADMINISTRADOR';
    })();

    // SOLO Punto de Venta y Transferencia (sin Efectivo)
    let formaPagoStr = 'TRANSFERENCIA';
    let bancoReal = '---';
    let referenciaReal = '---';

    // Si viene de abono parcial, usar los datos del abono directamente
    if (abonoOverride) {
      const tipoAbono = abonoOverride.tipo || '';
      formaPagoStr = (tipoAbono === 'Debito' || tipoAbono.toLowerCase().includes('punto')) ? 'PUNTO DE VENTA' : 'TRANSFERENCIA';
      bancoReal = abonoOverride.banco || '---';
      referenciaReal = abonoOverride.referencia || '---';
      // montoCancelado = monto del abono (lo que pagó); montoPendiente = monto recibo actual (saldo que queda)
      montoCancelado = parseFloat(String(abonoOverride.monto || '0').replace(/[^\d.]/g, '')) || 0;
      montoPendiente = montoNumerico; // row.monto = saldo pendiente en la recibo
      montoNumerico = montoCancelado; // el recibo muestra lo que SE CANCELÓ
      esAbono = true;
    } else if (row.referencia) {
      try {
        const { data: pagosData } = await supabase
          .from('pagos_reportados')
          .select('*')
          .eq('identidad', row.identidad)
          .order('created_at', { ascending: false });

        if (pagosData) {
          const pagos = pagosData.filter(p => {
             const d = typeof p.detalles === 'string' ? (() => { try { return JSON.parse(p.detalles); } catch(e) { return {}; } })() : p.detalles;
             return JSON.stringify(d || {}).includes(row.referencia);
          });
          const pago = pagos[0]; // The latest payment
          const det = parseDetalles(pago.detalles);
          const tipoP = pago.tipo || '';
          tasaBcvAplicada = det.tasa_bcv || pago.tasa_bcv || undefined;
          formaPagoStr = (tipoP === 'Debito' || tipoP.toLowerCase().includes('punto')) ? 'PUNTO DE VENTA' : 'TRANSFERENCIA';
          bancoReal = pago.banco || '---';
          referenciaReal = pago.referencia || '---';

          if (det.es_abono === true && row.estado !== 'Pagado') {
            esAbono = true;
            // pago.monto = lo que se canceló; row.monto = saldo pendiente restante
            montoCancelado = parseFloat(String(pago.monto || '0').replace(/[^\d.]/g, '')) || 0;
            montoPendiente = montoNumerico; // saldo que quedó pendiente
            montoNumerico = montoCancelado;
          } else if (row.estado === 'Pagado' && pagos.length === 1 && !det.es_abono) {
            // El monto real cobrado debe reemplazar al monto original de la factura
            montoNumerico = parseFloat(String(pago.monto || '0').replace(/[^\d.]/g, '')) || 0;
          }

          // Build historialPagos if there is more than 1 payment, or if it's an Abono
          if (pagos.length > 1 || (pagos.length === 1 && det.es_abono === true)) {
            let sumTotal = 0;
            historialPagos = pagos.map(p => {
              const pDet = parseDetalles(p.detalles);
              let pTipo = p.tipo || '';
              let pFormaPagoStr = (pTipo === 'Debito' || pTipo.toLowerCase().includes('punto')) ? 'PUNTO DE VENTA' : 'TRANSFERENCIA';
              let pFecha = p.created_at ? new Date(p.created_at).toLocaleDateString('es-VE') : '---';
              if (pDet.fecha_transaccion) {
                // handle YYYY-MM-DD
                const parts = pDet.fecha_transaccion.split('-');
                if (parts.length === 3) pFecha = `${parts[2]}/${parts[1]}/${parts[0]}`;
                else pFecha = pDet.fecha_transaccion;
              }
              const pMonto = parseFloat(String(p.monto || '0').replace(/[^\d.]/g, '')) || 0;
              sumTotal += pMonto;
              return {
                formaPago: pFormaPagoStr,
                banco: p.banco || '---',
                referencia: p.referencia || '---',
                monto: pMonto,
                fecha: pFecha
              };
            }).reverse(); // chronological order

            if (row.estado === 'Pagado') {
              montoNumerico = sumTotal; // The total of the receipt is the sum of all payments for this invoice
              formaPagoStr = 'PAGO MULTIPLE'; // Optional: indicate it was paid in parts
              bancoReal = 'MULTIPLES BANCOS';
              referenciaReal = 'VARIAS REFERENCIAS';
            }
          }
        }
      } catch {
        if (row.estado === 'Pagado') {
          formaPagoStr = 'TRANSFERENCIA';
          bancoReal = 'BANCO CONFIRMADO';
          referenciaReal = Math.floor(Math.random() * 90000000 + 10000000).toString();
        }
      }
    }

    // Cargar datos completos del contribuyente desde inmuebles
    // Fuente de identidad: primero el abono, luego la recibo
    const identidadBusqueda = (abonoOverride?.identidad || row.identidad || '').trim();
    const idLimpio = identidadBusqueda.replace(/-/g, '');

    let codContrib = '---';
    let direccionFiscal = 'NAGUANAGUA, CARABOBO';
    let razonSocial = abonoOverride?.contribuyente || row.contribuyente || '---';
    let rifCiReal = identidadBusqueda || '---';
    try {
      // Construir filtro OR solo con valores no vacíos
      const filtros: string[] = [];
      if (identidadBusqueda) filtros.push(`identidad.eq.${identidadBusqueda}`);
      if (idLimpio && idLimpio !== identidadBusqueda) filtros.push(`identidad.eq.${idLimpio}`);

      if (filtros.length > 0) {
        const { data: inms } = await supabase
          .from('inmuebles')
          .select('contribuyente, cod_cont, direccion, clasificacion, identidad')
          .or(filtros.join(','));
        if (inms && inms.length > 0) {
          const inm = inms[0];
          if (inm.contribuyente) razonSocial = inm.contribuyente;
          // cod_cont puede ser null si el inmueble no tiene codigo asignado aún
          codContrib = inm.cod_cont || identidadBusqueda || '---';
          if (inm.direccion) direccionFiscal = inm.direccion.toUpperCase();
          // RIF siempre debe mostrarse
          rifCiReal = identidadBusqueda || inm.identidad || '---';
        }
      }
    } catch { /* usar fallback */ }

    // ── Construir conceptos con TODOS los meses del contribuyente ──
    // Si el recibo ya fue pagado o es abono, mostrar solo ese mes
    // Si es Pendiente/Por Verificar, mostrar todos los meses pendientes del contribuyente
    const MESES_TXT = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
    const getMesTxt = (emision: string) => {
      if (!emision) return '---';
      const parts = emision.split('-');
      if (parts.length >= 2) return `${MESES_TXT[parseInt(parts[1])-1]} ${parts[0]}`;
      return emision;
    };

    let conceptos: { descripcion: string; precioUnit: number; total: number }[] = [];
    let totalConceptos = montoNumerico;

    if (!esAbono && (row.estado === 'Pendiente' || row.estado === 'Por Verificar' || row.estado === 'Abonado')) {
      // Buscar TODOS los meses pendientes del mismo contribuyente
      try {
        const idBusc = (row.identidad || '').trim();
        const idClean = idBusc.replace(/-/g, '').toUpperCase();
        const { data: todasFacturas } = await supabase
          .from('facturas')
          .select('*')
          .in('estado', ['Pendiente', 'Por Verificar', 'Abonado'])
          .or(`identidad.eq.${idBusc},identidad.eq.${idClean}`)
          .order('emision', { ascending: true });

        if (todasFacturas && todasFacturas.length > 0) {
          // Calcular monto para cada recibo usando tcmmv si está disponible
          const userInmsForAll = (inmuebles as any[]).filter((inm: any) =>
            (inm.identidad || '').replace(/-/g,'').toUpperCase() === idClean
          );
          conceptos = todasFacturas.flatMap((f: any) => {
            let mF = parseFloat(String(f.monto || '0').replace(/[^\d.]/g, '')) || 0;
            let descripcionBase = `Servicio Aseo Residencial/Comercial. Correspondiente al mes de: ${getMesTxt(f.emision)}`;

            if (tcmmv && tcmmv > 0 && userInmsForAll.length > 0 && f.estado !== 'Pagado' && f.estado !== 'Abonado') {
              if (f.referencia?.startsWith('CM-')) {
                let matchedInmuebles = userInmsForAll;
                
                // Extraer el ID del local de la referencia (ej: I-000080 de CM-I-000080-09-2026)
                const match = f.referencia.match(/(I-\d+|C-\d+)/);
                if (match) {
                  const possibleInmId = match[0];
                  const specificInm = userInmsForAll.filter((inm: any) => inm.inmueble === possibleInmId || inm.cod_cont === possibleInmId || inm.Inmueble === possibleInmId);
                  if (specificInm.length > 0) {
                    matchedInmuebles = specificInm;
                    descripcionBase += ` (Local/Inmueble: ${possibleInmId})`;
                  }
                }

                let mmv = 0;
                matchedInmuebles.forEach((inm: any) => {
                  mmv += parseFloat(inm.cant_inmuebles || 1) * parseFloat(inm.mmv_mes || 0);
                });
                if (mmv > 0) mF = parseFloat((mmv * tcmmv).toFixed(2));
              } else if (f.referencia?.startsWith('RECIB-')) {
                let deuda = 0;
                let congelada = 0;
                userInmsForAll.forEach((inm: any) => { deuda += parseFloat(inm.deuda_mmv || 0); congelada += parseFloat(inm.deuda_congelada_bs || 0); });
                if (deuda > 0 || congelada > 0) mF = parseFloat(((deuda * tcmmv) + congelada).toFixed(2));
              }
            }
            return {
              descripcion: descripcionBase,
              precioUnit: mF,
              total: mF
            };
          });
          totalConceptos = conceptos.reduce((s, cp) => s + cp.total, 0);
        }
      } catch(e) { console.warn('Error cargando todos los meses:', e); }
    }

    // Fallback si no se cargaron meses: usar solo el mes del recibo clickeado
    if (conceptos.length === 0) {
      const descripcionConcepto = esAbono
        ? `ABONO PARCIAL - Aseo Residencial/Comercial. Mes: ${mesTexto}`
        : `Servicio Aseo Residencial/Comercial. Correspondiente al mes de: ${mesTexto}`;
      conceptos = [{ descripcion: descripcionConcepto, precioUnit: montoNumerico, total: montoNumerico }];
      totalConceptos = montoNumerico;
    }

    setSelectedRecibo({
      reciboNo: row.referencia ? row.referencia.split('-').pop()?.padStart(7, '0') : '0000001',
      controlWeb: (row.estado === 'Pagado' || esAbono) ? 'WEB-0000001' : '',
      fechaEmision: row.emision || new Date().toISOString().split('T')[0],
      codContribuyente: codContrib,
      tipoContribuyente: inmuebles[0]?.tipo,
      razonSocial,
      domicilioFiscal: direccionFiscal,
      rifCi: rifCiReal,
      caja: cajeroActivo,
      conceptos,
      subTotal: totalConceptos,
      exento: totalConceptos,
      iva: 0,
      total: totalConceptos,
      formaPago: formaPagoStr,
      banco: bancoReal,
      referencia: referenciaReal,
      esAbono,
      montoCancelado,
      montoPendiente,
      historialPagos: typeof historialPagos !== 'undefined' ? historialPagos : undefined,
      tasaBcv: tasaBcvAplicada,
    });
  };

  const handleTest6Meses = () => {
    const meses = ['MARZO 2026', 'ABRIL 2026', 'MAYO 2026', 'JUNIO 2026', 'JULIO 2026', 'AGOSTO 2026'];
    const montoUnitario = 150.00;
    const conceptos = meses.map(mes => ({
      descripcion: `Servicio Aseo Residencial/Comercial. Correspondiente al mes de: ${mes}`,
      precioUnit: montoUnitario,
      total: montoUnitario
    }));

    setSelectedRecibo({
      reciboNo: '0000888',
      controlWeb: 'WEB-0000001',
      fechaEmision: new Date().toISOString().split('T')[0],
      codContribuyente: 'V-12345678',
      razonSocial: 'CONTRIBUYENTE DE PRUEBA (6 MESES)',
      domicilioFiscal: "ZONA TUCACAS (SECTOR NO ESPECIFICADO)",
      rifCi: 'V-12345678',
      caja: "F-OMAR",
      conceptos: conceptos,
      subTotal: montoUnitario * 6,
      exento: montoUnitario * 6,
      iva: 0,
      total: montoUnitario * 6,
      formaPago: 'TRANSFERENCIA',
      banco: 'BANESCO',
      referencia: Math.floor(Math.random() * 90000000 + 10000000).toString()
    });
  };

  useEffect(() => {
    actualizarTasa();
  }, []);

  const actualizarTasa = async () => {
    setLoadingTasa(true);
    try {
      const res = await fetch('/api/bcv');
      const data = await res.json();
      if (data.tcmmv) {
        setTcmmv(data.tcmmv);
      }
    } catch (e) {
      console.error(e);
    }
    setLoadingTasa(false);
  };

  
  const exportarAExcel = async () => {
    try {
      const { exportToExcelWithLogos } = await import('@/lib/excelExport');
      const data = filteredFacturas.map((f: any) => ({
        Referencia: f.referencia,
        Contribuyente: f.contribuyente,
        Identidad: f.identidad,
        Monto: f.monto,
        Emision: f.emision,
        Estado: f.estado
      }));
      await exportToExcelWithLogos(data, "EstadoDeCuenta_" + new Date().toISOString().split('T')[0] + ".xlsx", "EstadoCuenta");
    } catch(e) {
      alert("Error exportando a Excel");
    }
  };

  const enviarCorreosMasivos = () => {
    window.location.href = '/admin/correos';
  };

  const generarFacturacionMensual = async () => {
    if (!tcmmv) {
      alert("Debes actualizar la tasa UCD primero.");
      return;
    }
    
    if (!confirm(`┬┐Generar facturaci├│n usando UCD de ${tcmmv} Bs? Esto recibir├í a los ${inmuebles.length} inmuebles.`)) {
      return;
    }

    setIsGenerating(true);
    
    let noConfigurados: string[] = [];
    const nuevasFacturas = [];
    
    // Obtener mes actual
    const fecha = new Date();
    const emision = fecha.toISOString().split('T')[0];
    fecha.setMonth(fecha.getMonth() + 1);
    const vencimiento = fecha.toISOString().split('T')[0];

    for (let i = 0; i < inmuebles.length; i++) {
      const inm = inmuebles[i];
      const actividad = inm.actividad_principal;
      const clasificacion = inm.clasificacion || 'A';
      
      const tarifasPorActividad = (tarifasData as any)[actividad];
      
      if (!tarifasPorActividad) {
        if (!noConfigurados.includes(actividad)) noConfigurados.push(actividad);
        continue;
      }
      
      const tarifaMMV = tarifasPorActividad[clasificacion] || tarifasPorActividad['A'];
      const montoCalculado = (tarifaMMV * tcmmv).toFixed(2);
      
      nuevasFacturas.push({
        referencia: `FAC-${Date.now().toString().slice(-6)}-${i}`,
        identidad: inm.identidad,
        contribuyente: inm.contribuyente,
        monto: `${montoCalculado} Bs`,
        emision: emision,
        vencimiento: vencimiento,
        estado: 'Pendiente'
      });
    }

    if (noConfigurados.length > 0) {
      alert(`Atenci├│n: Las siguientes actividades no est├ín en la ordenanza y no se facturaron:\n${noConfigurados.join(', ')}`);
    }

    // Insertar masivo (en lotes si es necesario, pero supabase acepta arrays grandes)
    // Para simplificar enviamos de 500 en 500
    for(let i=0; i<nuevasFacturas.length; i+=500){
      const chunk = nuevasFacturas.slice(i, i+500);
      await supabase.from('facturas').insert(chunk);
    }

    alert(`Se han generado ${nuevasFacturas.length} recibos exitosamente.`);
    setIsGenerating(false);
    // Idealmente har├¡amos un refetch del context aqu├¡, o se actualiza en tiempo real
    window.location.reload();
  };

  const handleActionSubmit = async () => {
    if (!actionModal.recibo || !actionModal.nota.trim()) {
      alert("Debes ingresar un comentario obligatorio.");
      return;
    }
    try {
      const nuevoEstado = actionModal.action === 'Condonar' ? 'Condonado' : actionModal.action === 'Anular' ? 'Anulado' : 'Reversado';
      const cajero = (typeof window !== 'undefined' ? localStorage.getItem('adminUser') : null) || 'Administrador';

      // Solo actualizar estado - recibos no tiene columna detalles
      const { error } = await supabase.from('facturas').update({
        estado: nuevoEstado,
      }).eq('id', actionModal.recibo.id);









      if (error) throw error;

      
      try { await supabase.from('audit_logs').insert({ usuario: cajero, accion: `FACTURA_${actionModal.action.toUpperCase()}`, detalles: `Recibo ${actionModal.recibo.referencia} ${nuevoEstado.toLowerCase()}. Motivo: ${actionModal.nota}` }); } catch(ae) {}
      
      alert(`Recibo ${actionModal.action.toLowerCase()}a correctamente.`);
      setActionModal({ isOpen: false, action: 'Anular', recibo: null, nota: '' });
      window.location.reload()
    } catch (e: any) {
      alert("Error: " + e.message);
    }
  };

  const columns = [
    { key: 'referencia', header: 'Nro. Recibo' },
    { key: 'contribuyente', header: 'Contribuyente' },
    { 
      key: 'monto', 
      header: 'Monto',
      render: (row: any) => {
        let monto = Number(parseFloat(String(row.monto || '0').replace(/[^\d.]/g, '')));
        if (row.estado === 'Pagado') {
          const pRel = allPagos.filter(p => {
            const d = typeof p.detalles === 'string' ? (() => { try { return JSON.parse(p.detalles); } catch(e){return {}}})() : p.detalles;
            return JSON.stringify(d || {}).includes(row.referencia);
          });
          if (pRel.length > 1) {
            monto = pRel.reduce((s, p) => s + (parseFloat(String(p.monto || '0').replace(/[^\d.]/g, '')) || 0), 0);
          }
        }
        const ucd = (tcmmv || 0) > 0 ? monto / (tcmmv || 1) : 0;
        return `${ucd.toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2})} UCD`;
      }
    },
    { key: 'estado', header: 'Estado', render: (row: any) => {
      let det: any = {};
      try { det = JSON.parse(row.detalles || '{}'); } catch(e) {}
      return (
        <div>
          <span className={`px-2 py-1 rounded text-xs font-semibold ${
            row.estado === 'Pagado' ? 'bg-green-100 text-green-700' :
            row.estado === 'Pendiente' ? 'bg-yellow-100 text-yellow-700' :
            row.estado === 'Anulado' ? 'bg-red-100 text-red-700' :
            row.estado === 'Reversado' ? 'bg-orange-100 text-orange-700' :
            'bg-slate-100 text-slate-700'
          }`}>{row.estado}</span>
          {det.nota_anulacion && (
            <div className="text-[10px] text-red-600 mt-0.5 max-w-[180px]" title={`${det.accion}: ${det.nota_anulacion}`}>
              ⚠ {det.nota_anulacion}
            </div>
          )}
        </div>
      );
    } },
    { 
      key: 'emision', 
      header: 'F. Emisión',
      render: (row: any) => {
        if (!row.emision) return '---';
        const meses = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
        const parts = row.emision.split('-');
        if (parts.length >= 2) return `${meses[parseInt(parts[1]) - 1]} ${parts[0]}`;
        return row.emision;
      }
    },
    { 
      key: 'vencimiento', 
      header: 'F. Vencimiento',
      render: (row: any) => {
        if (!row.vencimiento) return '---';
        const meses = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
        const parts = row.vencimiento.split('-');
        if (parts.length >= 2) return `${meses[parseInt(parts[1]) - 1]} ${parts[0]}`;
        return row.vencimiento;
      }
    },
    { key: 'actions', header: 'Acciones', render: (row: any) => (
      <div className="flex gap-2">
        <button 
          onClick={() => handleOpenRecibo(row)}
          className="bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-1.5 rounded text-xs flex items-center gap-2 transition-colors font-medium border border-blue-200"
          title="Ver Recibo"
        >
          <Printer size={14} />
        </button>
        {(row.estado === 'Pendiente' || row.estado === 'Pagado') && (
          <>
            <button 
              onClick={() => setActionModal({ isOpen: true, action: 'Reversar', recibo: row, nota: '' })}
              className="bg-orange-50 text-orange-600 hover:bg-orange-100 px-3 py-1.5 rounded text-xs transition-colors font-medium border border-orange-200"
              title="Reversar Recibo"
            >
              Reversar
            </button>
            <button 
              onClick={() => setActionModal({ isOpen: true, action: 'Anular', recibo: row, nota: '' })}
              className="bg-red-50 text-red-600 hover:bg-red-100 px-3 py-1.5 rounded text-xs transition-colors font-medium border border-red-200"
              title="Anular Recibo"
            >
              Anular
            </button>
            <button 
              onClick={() => setActionModal({ isOpen: true, action: 'Condonar', recibo: row, nota: '' })}
              className="bg-purple-50 text-purple-600 hover:bg-purple-100 px-3 py-1.5 rounded text-xs transition-colors font-medium border border-purple-200"
              title="Condonar Deuda"
            >
              Condonar
            </button>
          </>
        )}
        {row.estado === 'Por Verificar' && (
          <button 
            onClick={() => setActiveTab('PorVerificar')}
            className="bg-orange-50 text-orange-600 hover:bg-orange-100 px-3 py-1.5 rounded text-xs transition-colors font-medium border border-orange-200 flex items-center gap-1"
            title="Ir a verificar transferencias"
          >
            <CheckCircle size={14} /> Verificar
          </button>
        )}
      </div>
    ) }
  ];

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto p-6">
      
      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button 
          onClick={() => setActiveTab('General')}
          className={`px-6 py-3 font-semibold text-sm transition-colors ${activeTab === 'General' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Estado de Cuenta General
        </button>
        <button 
          onClick={() => setActiveTab('PorVerificar')}
          className={`px-6 py-3 font-semibold text-sm transition-colors ${activeTab === 'PorVerificar' ? 'border-b-2 border-orange-600 text-orange-700' : 'text-slate-500 hover:text-slate-700'} flex items-center gap-2`}
        >
          Pagos por Verificar
          {pagosVerificar.length > 0 && activeTab !== 'PorVerificar' && (
            <span className="bg-orange-500 text-white text-[10px] px-2 py-0.5 rounded-full">{pagosVerificar.length}</span>
          )}
        </button>
        <button 
          onClick={() => setActiveTab('Historial')}
          className={`px-6 py-3 font-semibold text-sm transition-colors ${activeTab === 'Historial' ? 'border-b-2 border-indigo-600 text-indigo-700' : 'text-slate-500 hover:text-slate-700'} flex items-center gap-2`}
        >
          Historial de Pagos
        </button>
      </div>

      {activeTab === 'General' && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-slate-700" />
            <h1 className="text-lg font-semibold text-slate-800 uppercase tracking-wide">
              Estado de Cuenta General
            </h1>
          </div>
          {/* Filtro por estado */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="Todos">Todos los estados</option>
            <option value="Pagado">Pagado</option>
            <option value="Pendiente">Pendiente</option>
            <option value="Por Verificar">Por Verificar</option>
            <option value="Anulado">Anulado</option>
            <option value="Reversado">Reversado</option>
          </select>
          <span className="text-xs text-slate-500 font-medium">
            {loadingFacturas ? 'Cargando...' : `${filteredFacturas.length} registros`}
          </span>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {/* Botón Refrescar recibos */}
          <button
            onClick={fetchFacturasDb}
            disabled={loadingFacturas}
            className="bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300 px-3 py-2 rounded text-sm font-medium transition-colors flex items-center gap-2"
            title="Refrescar lista de recibos"
          >
            <RefreshCw size={14} className={loadingFacturas ? 'animate-spin' : ''} />
            Refrescar
          </button>

          <div className="bg-slate-100 px-3 py-1.5 rounded-lg flex items-center gap-2 border border-slate-200">
            <span className="text-xs font-medium text-slate-500">UCD (UCD):</span>
            <span className="text-sm font-bold text-slate-800">
              {tcmmv ? `${tcmmv} Bs` : '---'}
            </span>
            <button 
              onClick={actualizarTasa}
              disabled={loadingTasa}
              className="ml-2 text-slate-400 hover:text-blue-600 transition-colors"
              title="Actualizar Tasa desde BCV"
            >
              <RefreshCw size={14} className={loadingTasa ? 'animate-spin' : ''} />
            </button>
          </div>

          <button 
            onClick={handleTest6Meses}
            className="bg-purple-600 text-white hover:bg-purple-700 px-4 py-2 rounded text-sm font-medium transition-colors shadow-sm"
          >
            Prueba 6 Meses
          </button>
          
          <button 
            onClick={generarFacturacionMensual}
            disabled={isGenerating || !tcmmv}
            className="bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 px-4 py-2 rounded text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
          >
            <Zap className="w-4 h-4" /> 
            {isGenerating ? 'Generando...' : 'Generar Emisión de recibos'}
          </button>
          <button 
            onClick={exportarAExcel}
            className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 rounded text-sm font-medium transition-colors shadow-sm flex items-center gap-2"
          >
            <Download className="w-4 h-4" /> Exportar a Excel
          </button>
          <button 
            onClick={enviarCorreosMasivos}
            className="bg-indigo-600 text-white hover:bg-indigo-700 px-4 py-2 rounded text-sm font-medium transition-colors shadow-sm flex items-center gap-2"
          >
            Envío Masivo Correos
          </button>
          </div>
        </div>
        
        {/* ACTION MODAL */}
        {actionModal.isOpen && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
              <div className="flex justify-between items-center mb-4">
                <h2 className={`text-xl font-bold ${actionModal.action === 'Anular' ? 'text-red-700' : 'text-orange-700'}`}>
                  {actionModal.action} Recibo
                </h2>
                <button 
                  onClick={() => setActionModal({ isOpen: false, action: 'Anular', recibo: null, nota: '' })} 
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X size={20} />
                </button>
              </div>
              
              <div className="bg-slate-50 p-4 rounded-lg mb-4 text-sm text-slate-700">
                <p><strong>Nro. Recibo:</strong> {actionModal.recibo.referencia}</p>
                <p><strong>Contribuyente:</strong> {actionModal.recibo.contribuyente}</p>
                <p><strong>Monto:</strong> {actionModal.recibo.monto}</p>
              </div>

              <div className="space-y-3">
                <label className="block text-sm font-semibold text-slate-700">
                  Comentario / Motivo (Obligatorio) *
                </label>
                <textarea 
                  value={actionModal.nota}
                  onChange={(e) => setActionModal(prev => ({ ...prev, nota: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px] resize-none"
                  placeholder={`Por favor describe por qu├⌐ se est├í ${actionModal.action.toLowerCase()}ndo esta recibo...`}
                />
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button 
                  onClick={() => setActionModal({ isOpen: false, action: 'Anular', recibo: null, nota: '' })} 
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleActionSubmit}
                  className={`px-4 py-2 text-sm font-bold text-white rounded-lg transition-colors shadow-sm ${
                    actionModal.action === 'Anular' ? 'bg-red-600 hover:bg-red-700' : 'bg-orange-600 hover:bg-orange-700'
                  }`}
                >
                  Confirmar {actionModal.action}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Desglose anual de deuda */}
        {filterStatus === 'Todos' || filterStatus === 'Pendiente' ? (() => {
          const pendientes = facturasDb.filter((f: any) => f.estado === 'Pendiente');
          const yearsMap: Record<string, {total: number, count: number}> = {};
          pendientes.forEach((f: any) => {
            const key = f.emision ? f.emision.substring(0, 4) : 'Sin Año';
            const monto = parseFloat((f.monto || '0').toString().replace(/[^\d.]/g, ''));
            if (!yearsMap[key]) yearsMap[key] = { total: 0, count: 0 };
            yearsMap[key].total += monto;
            yearsMap[key].count += 1;
          });
          const yearsArray = Object.entries(yearsMap).sort(([a], [b]) => a.localeCompare(b));
          const totalPendiente = pendientes.reduce((acc: number, f: any) => acc + parseFloat((f.monto || '0').toString().replace(/[^\d.]/g, '')), 0);
          const fmt = (v: number) => v.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          if (yearsArray.length === 0) return null;
          return (
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm mb-4 overflow-hidden">
              <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">Desglose Anual de Deuda Pendiente</span>
                <span className="text-xs font-bold text-red-600">Total: {fmt((tcmmv || 0) > 0 ? totalPendiente / (tcmmv || 1) : 0)} UCD</span>
              </div>
              <div className="p-3 flex flex-wrap gap-2">
                {yearsArray.map(([year, { total, count }]) => {
                  return (
                    <div key={year} className="flex flex-col items-center bg-red-50 border border-red-200 rounded-lg px-4 py-2 min-w-[120px]">
                      <span className="text-xs font-bold text-red-500 uppercase">AÑO {year}</span>
                      <span className="text-sm font-bold text-slate-800">{fmt((tcmmv || 0) > 0 ? total / (tcmmv || 1) : 0)} UCD</span>
                      <span className="text-[10px] text-slate-400">{count} recibo{count > 1 ? 's' : ''}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })() : null}

        <DataTable data={filteredFacturas} columns={columns} itemsPerPage={10} />

        {/* Abonos Realizados Removed per user request */}

      </>
      )}

      {activeTab === 'PorVerificar' && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200">
          <div className="bg-orange-50 px-4 py-3 border-b border-orange-200 flex items-center justify-between">
            <h3 className="font-bold text-orange-800">Transferencias / Pagos Pendientes de Verificaci├│n</h3>
            <button onClick={fetchPagos} className="text-orange-600 hover:text-orange-800 text-xs flex items-center gap-1 font-medium">
              <RefreshCw size={12} /> Actualizar
            </button>
          </div>
          <div className="p-0 overflow-x-auto">
            {loadingPagos ? (
              <div className="p-8 text-center text-slate-500">Cargando pagos...</div>
            ) : pagosVerificar.length === 0 ? (
              <div className="p-10 text-center">
                <CheckCircle size={40} className="mx-auto text-emerald-300 mb-3" />
                <p className="text-slate-400 font-medium">No hay pagos pendientes de verificaci├│n.</p>
              </div>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Fecha</th>
                    <th className="px-4 py-3 font-semibold">Identidad</th>
                    <th className="px-4 py-3 font-semibold">Banco / Tipo</th>
                    <th className="px-4 py-3 font-semibold">Referencia</th>
                    <th className="px-4 py-3 font-semibold">Monto (Bs)</th>
                    <th className="px-4 py-3 font-semibold">Recibos / Cuotas</th>
                    <th className="px-4 py-3 font-semibold text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagosVerificar.map((pago: any) => {
                    const detalles = parseDetalles(pago.detalles);
                    const fechaStr = pago.created_at ? new Date(pago.created_at).toLocaleDateString('es-VE', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : '--';
                    const recibos: string[] = detalles.recibos || [];
                    const cuotas: any[] = detalles.cuotas || [];
                    const compNombre = detalles.comprobante_nombre || '';
                    const compUrl = detalles.comprobante_url || '';
                    const fechaTrans = detalles.fecha_transaccion || '';
                    
                    return (
                    <tr key={pago.id} className="hover:bg-orange-50/30 transition-colors">
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                        <div>{fechaStr}</div>
                        {fechaTrans && <div className="text-[10px] text-orange-500 font-medium">Transac: {fechaTrans}</div>}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-slate-800">{pago.identidad}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-700">{pago.banco || '--'}</div>
                        <span className="text-[10px] text-slate-400">{pago.tipo}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-sm text-slate-600">{pago.referencia || '--'}</td>
                      <td className="px-4 py-3">
                        <span className="font-bold text-emerald-600 text-base">Bs. {parseFloat(pago.monto||'0').toLocaleString('es-VE',{minimumFractionDigits:2})}</span>
                        {detalles.saldo_favor > 0 && (
                          <div className="text-[10px] text-orange-600 font-semibold mt-0.5">+Saldo favor: {detalles.saldo_favor} Bs</div>
                        )}
                        {compNombre && (
                          <div className="text-[10px] text-blue-500 mt-0.5">≡ƒôÄ {compNombre}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 max-w-[200px]">
                        {recibos.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-1">
                            {recibos.slice(0,4).map((r: string, i: number) => (
                              <span key={i} className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-mono">{r}</span>
                            ))}
                            {recibos.length > 4 && <span className="text-[10px] text-slate-400">+{recibos.length-4} m├ís</span>}
                          </div>
                        )}
                        {cuotas.length > 0 && (
                          <div className="text-[10px] text-orange-600 font-medium">{cuotas.length} cuota(s) de convenio</div>
                        )}
                        {recibos.length === 0 && cuotas.length === 0 && <span className="text-xs text-slate-400">ΓÇö</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-center gap-2 whitespace-nowrap">
                          <button 
                            onClick={() => procesarPago(pago, 'Aprobar')}
                            className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 px-3 py-1.5 rounded flex items-center gap-1 text-xs font-bold transition-colors border border-emerald-200"
                          >
                            <CheckCircle size={13} /> Aprobar
                          </button>
                          <button 
                            onClick={() => procesarPago(pago, 'Rechazar')}
                            className="bg-red-100 text-red-700 hover:bg-red-200 px-3 py-1.5 rounded flex items-center gap-1 text-xs font-bold transition-colors border border-red-200"
                          >
                            <XCircle size={13} /> Rechazar
                          </button>
                          {compUrl && (
                            <a 
                              href={compUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="bg-blue-100 text-blue-700 hover:bg-blue-200 px-3 py-1.5 rounded flex items-center gap-1 text-xs font-bold transition-colors border border-blue-200"
                              title="Ver comprobante de transferencia"
                            >
                              ≡ƒô╖ Comprobante
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ===== HISTORIAL DE PAGOS ===== */}
      {activeTab === 'Historial' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-indigo-50 px-6 py-4 border-b border-indigo-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-indigo-800">Historial de Pagos Realizados</h2>
              <p className="text-xs text-indigo-600 mt-0.5">Incluye solo pagos completos (excluye abonos)</p>
            </div>
            <button onClick={fetchHistorial} className="text-indigo-400 hover:text-indigo-600 transition-colors" title="Refrescar">
              <RefreshCw size={16} className={loadingPagos ? 'animate-spin' : ''} />
            </button>
          </div>
          {loadingPagos ? (
            <p className="p-8 text-center text-slate-400 text-sm">Cargando historial...</p>
          ) : pagosHistorial.length === 0 ? (
            <p className="p-8 text-center text-slate-400 text-sm">No hay pagos registrados.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left" style={{minWidth:'950px'}}>
                <thead className="bg-indigo-50 text-indigo-700 font-medium text-[11px] uppercase">
                  <tr>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Contribuyente</th>
                    <th className="px-4 py-3">Monto (Bs)</th>
                    <th className="px-4 py-3">Método de Pago</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Cajero / Operador</th>
                    <th className="px-4 py-3">Meses Pagados</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Referencia</th>
                  </tr>
                </thead>
                <tbody>
                  {pagosHistorial.filter((p: any) => parseDetalles(p.detalles).es_abono !== true).map((pago: any, idx: number) => {
                    const det = parseDetalles(pago.detalles);
                    const esAbono = det.es_abono === true;
                    const metodo = pago.tipo === 'Debito' ? 'Punto de Venta' : pago.tipo || '---';
                    const cajeroNombre = det.cajero || det.usuario || det.operador || pago.cajero || '—';
                    // Meses pagados: extraer períodos de las referencias en detalles.recibos
                    const MESES_ABR = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
                    const getMesAbr = (ref: string) => {
                      // Formato referencia: CM-X-000000-MM-YYYY
                      const parts = ref?.split('-') || [];
                      if (parts.length >= 5) {
                        const mm = parseInt(parts[parts.length - 2]);
                        const yyyy = parts[parts.length - 1];
                        if (!isNaN(mm) && mm >= 1 && mm <= 12) return `${MESES_ABR[mm-1]}-${yyyy}`;
                      }
                      return null;
                    };
                    const recibosRefs: string[] = det.recibos || [];
                    const mesesPagados = recibosRefs.map(getMesAbr).filter(Boolean) as string[];
                    return (
                      <tr key={idx} className={`border-b border-slate-100 last:border-0 hover:bg-indigo-50/30 ${esAbono ? 'bg-amber-50/30' : ''}`}>
                        <td className="px-4 py-3 text-slate-500 text-xs">{pago.created_at ? new Date(pago.created_at).toLocaleDateString('es-VE') : '---'}</td>
                        <td className="px-4 py-3 font-medium text-slate-700">{pago.identidad}</td>
                        <td className="px-4 py-3 font-bold text-slate-800">Bs. {Number(pago.monto || 0).toLocaleString('es-VE', {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded text-[11px] font-semibold ${
                            metodo === 'Punto de Venta' ? 'bg-blue-100 text-blue-700' :
                            metodo === 'Transferencia' ? 'bg-purple-100 text-purple-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>{metodo}</span>
                        </td>
                        <td className="px-4 py-3">
                          {esAbono ? (
                            <span className="px-2 py-1 rounded text-[11px] font-bold bg-amber-100 text-amber-700">ABONO PARCIAL</span>
                          ) : (
                            <span className="px-2 py-1 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-700">PAGO COMPLETO</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[11px] font-semibold">{cajeroNombre}</span>
                        </td>
                        <td className="px-4 py-3">
                          {mesesPagados.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {mesesPagados.map((m, i) => (
                                <span key={i} className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded text-[10px] font-mono font-semibold">{m}</span>
                              ))}
                            </div>
                          ) : <span className="text-slate-400 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded text-[11px] font-bold ${
                            pago.estado === 'Aprobado' ? 'bg-emerald-100 text-emerald-800' :
                            pago.estado === 'Por Verificar' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>{pago.estado}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs font-mono">{pago.referencia || '---'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {selectedRecibo && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50 rounded-t-lg print:hidden">
              <h3 className="font-semibold text-slate-800">Vista Previa del Recibo</h3>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => window.print()}
                  className="bg-slate-800 text-white hover:bg-slate-700 px-4 py-2 rounded text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <Printer size={16} /> Imprimir
                </button>
                <button 
                  onClick={() => setSelectedRecibo(null)}
                  className="text-slate-400 hover:text-slate-600 p-2"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            
            {/* Contenedor imprimible */}
            <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 140px)' }}>
              
              <div id="recibo-print-area">
                <style dangerouslySetInnerHTML={{__html: `
                  @media print {
                    body * { visibility: hidden; }
                    #recibo-print-area, #recibo-print-area * { visibility: visible; }
                    #recibo-print-area { position: absolute; left: 0; top: 0; width: 100%; }
                  }
                `}} />
                <ReciboImprimible data={selectedRecibo} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

