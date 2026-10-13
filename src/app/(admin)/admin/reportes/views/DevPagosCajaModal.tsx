'use client';
import React, { useState, useEffect } from 'react';
import { Wrench, PlusCircle, Trash2, Key, X, AlertTriangle, CheckCircle, Search, RefreshCw, Loader2 } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  cajerosDisponibles?: string[];
  onPagoModificado?: () => void;
}

const fmtBs = (n: number) => (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const FORMAS_PAGO = [
  'Debito',
  'TMD',
  'TVD',
  'Credito',
  'Transferencia',
  'Pago Movil',
  'Efectivo',
  'Punto de Venta'
];

export default function DevPagosCajaModal({ isOpen, onClose, cajerosDisponibles = [], onPagoModificado }: Props) {
  const [autenticado, setAutenticado] = useState(false);
  const [clave, setClave] = useState('');
  const [errorClave, setErrorClave] = useState('');
  const [tab, setTab] = useState<'registrar' | 'eliminar'>('registrar');

  // Listado de cajeros
  const [cajeros, setCajeros] = useState<string[]>(cajerosDisponibles);
  const [cargandoCajeros, setCargandoCajeros] = useState(false);

  // Formulario Registrar
  const today = new Date().toISOString().slice(0, 10);
  const [regCajero, setRegCajero] = useState('');
  const [regIdentidad, setRegIdentidad] = useState('');
  const [regContribuyente, setRegContribuyente] = useState('');
  const [regMonto, setRegMonto] = useState('');
  const [regTipo, setRegTipo] = useState('Debito');
  const [regBanco, setRegBanco] = useState('Banesco');
  const [regReferencia, setRegReferencia] = useState('');
  const [regFecha, setRegFecha] = useState(today);
  const [regHora, setRegHora] = useState('12:00');
  const [regNota, setRegNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [msgExito, setMsgExito] = useState('');
  const [msgError, setMsgError] = useState('');

  // Pestaña Eliminar
  const [elimDesde, setElimDesde] = useState(today);
  const [elimHasta, setElimHasta] = useState(today);
  const [elimCajero, setElimCajero] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [pagosEliminar, setPagosEliminar] = useState<any[]>([]);
  const [cargandoLista, setCargandoLista] = useState(false);
  const [pagoSeleccionadoEliminar, setPagoSeleccionadoEliminar] = useState<any | null>(null);
  const [motivoEliminacion, setMotivoEliminacion] = useState('');
  const [eliminando, setEliminando] = useState(false);

  useEffect(() => {
    if (isOpen && autenticado) {
      cargarCajeros();
      if (tab === 'eliminar') {
        cargarPagosParaEliminar();
      }
    }
  }, [isOpen, autenticado, tab]);

  const verificarClave = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (clave === '1756762') {
      setAutenticado(true);
      setErrorClave('');
    } else {
      setErrorClave('Clave de modo desarrollador incorrecta.');
    }
  };

  const cargarCajeros = async () => {
    try {
      setCargandoCajeros(true);
      const res = await fetch('/api/admin/dev/pagos-caja', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pass: '1756762', accion: 'cajeros' }),
      });
      const data = await res.json();
      if (data.cajeros) {
        const union = Array.from(new Set([...cajerosDisponibles, ...data.cajeros])).filter(Boolean).sort();
        setCajeros(union);
        if (!regCajero && union.length > 0) setRegCajero(union[0]);
      }
    } catch (e) {
      console.warn('Error cargando cajeros:', e);
    } finally {
      setCargandoCajeros(false);
    }
  };

  const handleRegistrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsgExito('');
    setMsgError('');

    const montoNum = parseFloat(regMonto);
    if (!regCajero || isNaN(montoNum) || montoNum <= 0 || !regTipo || !regFecha) {
      setMsgError('Por favor complete cajero, tipo, monto y fecha correctamente.');
      return;
    }

    try {
      setGuardando(true);
      let adminUsr = 'dev';
      try { adminUsr = JSON.parse(localStorage.getItem('admin_user_data') || '{}').usuario || 'dev'; } catch {}

      const res = await fetch('/api/admin/dev/pagos-caja', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pass: '1756762',
          accion: 'registrar',
          usuario: adminUsr,
          pago: {
            cajero: regCajero,
            identidad: regIdentidad.trim().toUpperCase(),
            contribuyente: regContribuyente.trim(),
            monto: montoNum,
            tipo: regTipo,
            banco: regBanco,
            referencia: regReferencia.trim() || undefined,
            fecha: regFecha,
            hora: regHora,
            nota: regNota.trim() || undefined
          }
        }),
      });

      const data = await res.json();
      setMsgExito(data.mensaje || `Pago de Bs. ${fmtBs(montoNum)} registrado con éxito para el cajero ${regCajero}.`);
      setRegMonto('');
      setRegReferencia('');
      setRegNota('');
      onPagoModificado?.();
    } catch (err: any) {
      setMsgError(err.message || 'Error al guardar el pago');
    } finally {
      setGuardando(false);
    }
  };

  const cargarPagosParaEliminar = async () => {
    try {
      setCargandoLista(true);
      const res = await fetch('/api/admin/dev/pagos-caja', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pass: '1756762',
          accion: 'listar',
          desde: elimDesde,
          hasta: elimHasta,
          cajero: elimCajero || undefined
        }),
      });
      const data = await res.json();
      if (data.pagos) {
        setPagosEliminar(data.pagos);
      }
    } catch (e: any) {
      console.error('Error listando pagos:', e);
    } finally {
      setCargandoLista(false);
    }
  };

  const ejecutarEliminar = async () => {
    if (!pagoSeleccionadoEliminar) return;
    if (motivoEliminacion.trim().length < 5) {
      alert('Debe indicar un motivo descriptivo (mínimo 5 letras).');
      return;
    }

    try {
      setEliminando(true);
      let adminUsr = 'dev';
      try { adminUsr = JSON.parse(localStorage.getItem('admin_user_data') || '{}').usuario || 'dev'; } catch {}

      const res = await fetch('/api/admin/dev/pagos-caja', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pass: '1756762',
          accion: 'eliminar',
          id: pagoSeleccionadoEliminar.id,
          motivo: motivoEliminacion.trim(),
          usuario: adminUsr
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Error al eliminar pago');

      alert('Pago eliminado del reporte con respaldo en auditoría.');
      setPagoSeleccionadoEliminar(null);
      setMotivoEliminacion('');
      cargarPagosParaEliminar();
      onPagoModificado?.();
    } catch (err: any) {
      alert('Error eliminando pago: ' + err.message);
    } finally {
      setEliminando(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
        {/* Cabecera */}
        <div className="bg-slate-900 px-5 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-lg">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                Modo Dev — Gestión de Reportes de Caja
                <span className="text-[10px] bg-amber-500/30 text-amber-300 font-semibold px-2 py-0.5 rounded-full border border-amber-500/40">
                  DEVELOPER
                </span>
              </h2>
              <p className="text-xs text-slate-400">Registrar o eliminar pagos en corte/reporte de cualquier cajero</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Si no está autenticado, solicitar clave */}
        {!autenticado ? (
          <div className="p-8 text-center space-y-4">
            <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto">
              <Key className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">Autenticación de Modo Dev</h3>
              <p className="text-xs text-slate-500 mt-1">Ingrese la clave de autorización de desarrollador para gestionar reportes.</p>
            </div>
            <form onSubmit={verificarClave} className="max-w-xs mx-auto space-y-3">
              <input
                type="password"
                placeholder="Clave de acceso dev"
                value={clave}
                onChange={e => setClave(e.target.value)}
                autoFocus
                className="w-full px-4 py-2 border border-slate-300 rounded-xl text-center text-sm font-mono focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
              />
              {errorClave && <p className="text-xs text-red-600 font-medium">{errorClave}</p>}
              <button
                type="submit"
                className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl transition-colors shadow-sm"
              >
                Acceder a Modo Dev
              </button>
            </form>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Pestañas */}
            <div className="flex border-b border-slate-200 bg-slate-50 px-5 pt-3 gap-2">
              <button
                onClick={() => setTab('registrar')}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold rounded-t-xl transition-colors ${
                  tab === 'registrar' ? 'bg-white text-blue-700 border-t-2 border-blue-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <PlusCircle className="w-4 h-4 text-emerald-600" />
                Registrar Pago en Reporte
              </button>
              <button
                onClick={() => setTab('eliminar')}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold rounded-t-xl transition-colors ${
                  tab === 'eliminar' ? 'bg-white text-blue-700 border-t-2 border-blue-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Trash2 className="w-4 h-4 text-red-600" />
                Eliminar Pago del Reporte
              </button>
            </div>

            {/* Contenido Pestañas */}
            <div className="p-6 overflow-y-auto flex-1">
              {tab === 'registrar' ? (
                <form onSubmit={handleRegistrar} className="space-y-4">
                  {msgExito && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
                      <span>{msgExito}</span>
                    </div>
                  )}
                  {msgError && (
                    <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                      <span>{msgError}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Cajero */}
                    <div>
                      <label className="text-xs font-bold text-slate-700 mb-1 block">
                        Cajero / Usuario Destino <span className="text-red-500">*</span>
                      </label>
                      <input
                        list="cajeros-list"
                        value={regCajero}
                        onChange={e => setRegCajero(e.target.value)}
                        placeholder="Ej: A-dzara o maria"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                        required
                      />
                      <datalist id="cajeros-list">
                        {cajeros.map(c => <option key={c} value={c} />)}
                      </datalist>
                      <span className="text-[10px] text-slate-400 mt-0.5 block">Seleccione o escriba el identificador del cajero</span>
                    </div>

                    {/* Forma de Pago */}
                    <div>
                      <label className="text-xs font-bold text-slate-700 mb-1 block">
                        Forma de Pago <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={regTipo}
                        onChange={e => setRegTipo(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                      >
                        {FORMAS_PAGO.map(fp => <option key={fp} value={fp}>{fp}</option>)}
                      </select>
                    </div>

                    {/* Monto */}
                    <div>
                      <label className="text-xs font-bold text-slate-700 mb-1 block">
                        Monto en Bolívares (Bs.) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={regMonto}
                        onChange={e => setRegMonto(e.target.value)}
                        placeholder="0.00"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold"
                        required
                      />
                    </div>

                    {/* Banco */}
                    <div>
                      <label className="text-xs font-bold text-slate-700 mb-1 block">Banco / Origen</label>
                      <input
                        value={regBanco}
                        onChange={e => setRegBanco(e.target.value)}
                        placeholder="Ej: Banesco, Venezuela, Punto TMD"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                      />
                    </div>

                    {/* Referencia */}
                    <div>
                      <label className="text-xs font-bold text-slate-700 mb-1 block">Referencia / Aprobación</label>
                      <input
                        value={regReferencia}
                        onChange={e => setRegReferencia(e.target.value)}
                        placeholder="Número de referencia (opcional)"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                      />
                    </div>

                    {/* Identidad */}
                    <div>
                      <label className="text-xs font-bold text-slate-700 mb-1 block">Cédula / RIF</label>
                      <input
                        value={regIdentidad}
                        onChange={e => setRegIdentidad(e.target.value)}
                        placeholder="Ej: J-12345678 o V-12345678"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono uppercase"
                      />
                    </div>

                    {/* Nombre Contribuyente */}
                    <div className="md:col-span-2">
                      <label className="text-xs font-bold text-slate-700 mb-1 block">Nombre / Razón Social Contribuyente</label>
                      <input
                        value={regContribuyente}
                        onChange={e => setRegContribuyente(e.target.value)}
                        placeholder="Nombre de la empresa o persona natural"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                      />
                    </div>

                    {/* Fecha y Hora */}
                    <div>
                      <label className="text-xs font-bold text-slate-700 mb-1 block">
                        Fecha del Reporte <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="date"
                        value={regFecha}
                        onChange={e => setRegFecha(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                        required
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 mb-1 block">Hora</label>
                      <input
                        type="time"
                        value={regHora}
                        onChange={e => setRegHora(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                      />
                    </div>

                    {/* Nota */}
                    <div className="md:col-span-2">
                      <label className="text-xs font-bold text-slate-700 mb-1 block">Nota Dev / Justificación</label>
                      <input
                        value={regNota}
                        onChange={e => setRegNota(e.target.value)}
                        placeholder="Ej: Registro manual por contingencia técnica en taquilla"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      type="submit"
                      disabled={guardando}
                      className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
                    >
                      {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlusCircle className="w-4 h-4" />}
                      Registrar en Reporte de Caja
                    </button>
                  </div>
                </form>
              ) : (
                /* Pestaña Eliminar */
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Desde</label>
                      <input
                        type="date"
                        value={elimDesde}
                        onChange={e => setElimDesde(e.target.value)}
                        className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Hasta</label>
                      <input
                        type="date"
                        value={elimHasta}
                        onChange={e => setElimHasta(e.target.value)}
                        className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Cajero (Opcional)</label>
                      <input
                        value={elimCajero}
                        onChange={e => setElimCajero(e.target.value)}
                        placeholder="Todos"
                        className="w-full px-2 py-1.5 border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <button
                        onClick={cargarPagosParaEliminar}
                        disabled={cargandoLista}
                        className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5"
                      >
                        {cargandoLista ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                        Buscar Pagos
                      </button>
                    </div>
                  </div>

                  {/* Input de filtro local */}
                  <input
                    type="text"
                    value={busqueda}
                    onChange={e => setBusqueda(e.target.value)}
                    placeholder="Filtrar por contribuyente, RIF o referencia..."
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                  />

                  {/* Tabla de resultados */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200 sticky top-0">
                        <tr>
                          <th className="p-2">Fecha</th>
                          <th className="p-2">Cajero</th>
                          <th className="p-2">Contribuyente / RIF</th>
                          <th className="p-2">Forma / Ref</th>
                          <th className="p-2 text-right">Monto</th>
                          <th className="p-2 text-center">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {pagosEliminar.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="p-4 text-center text-slate-400">
                              {cargandoLista ? 'Cargando pagos...' : 'No se encontraron pagos con los filtros indicados.'}
                            </td>
                          </tr>
                        ) : (
                          pagosEliminar
                            .filter(p => {
                              if (!busqueda) return true;
                              const b = busqueda.toLowerCase();
                              return (
                                String(p.identidad || '').toLowerCase().includes(b) ||
                                String(p.referencia || '').toLowerCase().includes(b) ||
                                String(p._det?.contribuyente || p._det?.contribuyente_nombre || '').toLowerCase().includes(b)
                              );
                            })
                            .map(p => {
                              const caj = p._det?.cajero || '-';
                              const nom = p._det?.contribuyente || p._det?.contribuyente_nombre || p.identidad || '-';
                              return (
                                <tr key={p.id} className="hover:bg-slate-50">
                                  <td className="p-2 whitespace-nowrap text-[11px] text-slate-500">
                                    {new Date(p.created_at).toLocaleDateString('es-VE')}
                                  </td>
                                  <td className="p-2 whitespace-nowrap font-medium text-slate-700">{caj}</td>
                                  <td className="p-2 truncate max-w-[140px]" title={nom}>
                                    <div className="font-semibold text-slate-800 truncate">{nom}</div>
                                    <div className="text-[10px] text-slate-400">{p.identidad}</div>
                                  </td>
                                  <td className="p-2 text-[11px]">
                                    <div>{p.tipo}</div>
                                    <div className="text-slate-400 font-mono text-[10px]">{p.referencia}</div>
                                  </td>
                                  <td className="p-2 text-right font-mono font-bold text-slate-800 whitespace-nowrap">
                                    Bs. {fmtBs(p.monto)}
                                  </td>
                                  <td className="p-2 text-center whitespace-nowrap">
                                    <button
                                      onClick={() => setPagoSeleccionadoEliminar(p)}
                                      className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                      title="Eliminar este pago del reporte"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Modal de confirmación de eliminación con motivo */}
                  {pagoSeleccionadoEliminar && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-3">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                        <div>
                          <h4 className="text-xs font-bold text-red-900">Confirmar Eliminación de Pago en Reporte</h4>
                          <p className="text-[11px] text-red-700">
                            Se eliminará el pago de <b>Bs. {fmtBs(pagoSeleccionadoEliminar.monto)}</b> del cajero{' '}
                            <b>{pagoSeleccionadoEliminar._det?.cajero || '-'}</b>. Se guardará un respaldo completo en Auditoría.
                          </p>
                        </div>
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 mb-1 block">
                          Motivo de la eliminación <span className="text-red-600">*</span>
                        </label>
                        <input
                          type="text"
                          value={motivoEliminacion}
                          onChange={e => setMotivoEliminacion(e.target.value)}
                          placeholder="Ej: Pago registrado dos veces por error de operadora"
                          className="w-full px-3 py-2 border border-red-300 rounded-lg text-xs bg-white"
                          autoFocus
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => { setPagoSeleccionadoEliminar(null); setMotivoEliminacion(''); }}
                          className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200 rounded-lg font-medium"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={ejecutarEliminar}
                          disabled={eliminando || motivoEliminacion.trim().length < 5}
                          className="px-4 py-1.5 text-xs bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
                        >
                          {eliminando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          Confirmar y Eliminar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
