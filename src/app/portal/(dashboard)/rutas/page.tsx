'use client';
import { CalendarDays, Map, Clock, AlertCircle, Truck, Search, Filter } from 'lucide-react';
import { useState, useMemo } from 'react';
import { RUTAS_NAGUANAGUA } from '@/data/rutasNaguanagua';

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

function normalizarTexto(s: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function rutaPasaEnDia(frecuencia: string, dia: string): boolean {
  const fNorm = normalizarTexto(frecuencia);
  const dNorm = normalizarTexto(dia);
  if (fNorm.startsWith('diario')) return true;

  const mapaAbrev: Record<string, string> = {
    lun: 'lunes',
    mar: 'martes',
    mie: 'miercoles',
    jue: 'jueves',
    vie: 'viernes',
    sab: 'sabado',
    dom: 'domingo',
  };

  const partesDias = fNorm.split(' ')[0].split('-');
  return partesDias.some((abrev) => mapaAbrev[abrev] === dNorm || abrev === dNorm);
}

export default function RutasPage() {
  const [diaSeleccionado, setDiaSeleccionado] = useState<string>('TODOS');
  const [busquedaSector, setBusquedaSector] = useState<string>('');
  const [filtroTurno, setFiltroTurno] = useState<'TODOS' | 'Diurno' | 'Nocturno'>('TODOS');

  const rutasProcesadas = useMemo(() => {
    return RUTAS_NAGUANAGUA.map((r: any, idx: number) => {
      const freq = String(r.frecuencia || '');
      const matchTurno = freq.match(/\((.*)\)/);
      const turno = matchTurno && matchTurno[1] ? matchTurno[1] : 'Diurno';
      const diasActivos = DIAS.filter((d) => rutaPasaEnDia(freq, d));
      return {
        uid: `${r.id || idx}-${idx}`,
        id: r.id,
        nombre: String(r.nombre || r.id || `Ruta ${idx + 1}`),
        codigoCorto: String(r.nombre || '').replace(/^Ruta\s*/i, '') || r.id,
        frecuencia: freq,
        turno,
        sectores: String(r.sectores || ''),
        vehiculo: String(r.vehiculo || 'Compactador'),
        estado: String(r.estado || 'Activa'),
        diasActivos,
      };
    });
  }, []);

  const rutasFiltradas = useMemo(() => {
    const q = normalizarTexto(busquedaSector.trim());
    return rutasProcesadas.filter((r) => {
      if (diaSeleccionado !== 'TODOS' && !r.diasActivos.includes(diaSeleccionado)) {
        return false;
      }
      if (filtroTurno !== 'TODOS' && normalizarTexto(r.turno) !== normalizarTexto(filtroTurno)) {
        return false;
      }
      if (q) {
        const hay = normalizarTexto(`${r.nombre} ${r.id} ${r.sectores} ${r.frecuencia}`);
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rutasProcesadas, diaSeleccionado, filtroTurno, busquedaSector]);

  const conteoPorDia = useMemo(() => {
    const map: Record<string, number> = {};
    DIAS.forEach((d) => {
      map[d] = rutasProcesadas.filter((r) => r.diasActivos.includes(d)).length;
    });
    return map;
  }, [rutasProcesadas]);

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <div className="bg-gradient-to-r from-[#0d2a1e] via-[#123828] to-[#0f172a] rounded-2xl p-5 text-white shadow-lg border border-emerald-500/30">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-lime-400/20 text-lime-300 border border-lime-400/30 mb-2">
              🚛 Cronograma Oficial IAMEC · {rutasProcesadas.length} Rutas Activas
            </span>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight">
              Rutas y Horarios de Recolección
            </h1>
            <p className="text-xs sm:text-sm text-emerald-100/80 mt-1">
              Consulta todas las rutas del municipio Naguanagua, busca tu urbanización o filtra por día de la semana.
            </p>
          </div>

          {/* Buscador rápido por sector o ruta */}
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-emerald-300 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={busquedaSector}
              onChange={(e) => setBusquedaSector(e.target.value)}
              placeholder="Buscar sector, urbanización o ruta..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-emerald-200/60 text-xs sm:text-sm font-medium outline-none focus:border-lime-400"
            />
          </div>
        </div>

        {/* Selector de Días */}
        <div className="mt-4 pt-3.5 border-t border-white/10 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setDiaSeleccionado('TODOS')}
            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
              diaSeleccionado === 'TODOS'
                ? 'bg-[#c8e64c] text-slate-900 shadow-md'
                : 'bg-white/10 text-slate-200 hover:bg-white/20'
            }`}
          >
            Todas las Rutas ({rutasProcesadas.length})
          </button>
          {DIAS.map((dia) => (
            <button
              key={dia}
              type="button"
              onClick={() => setDiaSeleccionado(dia)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                diaSeleccionado === dia
                  ? 'bg-emerald-500 text-white shadow-md ring-2 ring-lime-300/60'
                  : 'bg-white/10 text-slate-200 hover:bg-white/20'
              }`}
            >
              <span>{dia}</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/25 text-lime-300 font-black">
                {conteoPorDia[dia] || 0}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Filtro de Turno + Resumen */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
          <Filter className="w-4 h-4 text-emerald-600" />
          <span>
            Mostrando <strong className="text-emerald-700">{rutasFiltradas.length}</strong> de {rutasProcesadas.length} rutas
            {diaSeleccionado !== 'TODOS' ? ` · Día: ${diaSeleccionado}` : ''}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {(['TODOS', 'Diurno', 'Nocturno'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFiltroTurno(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                filtroTurno === t
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {t === 'TODOS' ? 'Todos los Turnos' : `Turno ${t}`}
            </button>
          ))}
        </div>
      </div>

      {/* Listado de Rutas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {rutasFiltradas.map((r) => (
          <div
            key={r.uid}
            className="bg-white border border-slate-200 hover:border-emerald-400 rounded-2xl p-4 shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-3"
          >
            <div>
              <div className="flex items-start justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-col items-center justify-center shrink-0">
                    <Truck className="w-5 h-5 text-emerald-700" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-black text-slate-800 text-sm sm:text-base">
                        {r.nombre}
                      </h3>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                        {r.id}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-emerald-700 flex items-center gap-1 mt-0.5">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{r.frecuencia}</span>
                    </p>
                  </div>
                </div>

                <span
                  className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full shrink-0 ${
                    normalizarTexto(r.turno).includes('nocturno')
                      ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                      : 'bg-amber-50 text-amber-800 border border-amber-200'
                  }`}
                >
                  {normalizarTexto(r.turno).includes('nocturno') ? '🌙 Nocturno' : '☀️ Diurno'}
                </span>
              </div>

              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                <div className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Map className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Sectores y Comunidades Atendidas:</span>
                </div>
                <p className="text-xs sm:text-sm text-slate-700 font-medium leading-relaxed">
                  {r.sectores}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
              <div className="flex flex-wrap gap-1">
                {r.diasActivos.map((d) => (
                  <span
                    key={d}
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                      diaSeleccionado === d
                        ? 'bg-emerald-600 text-white'
                        : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    }`}
                  >
                    {d.slice(0, 3)}
                  </span>
                ))}
              </div>
              <span className="text-[11px] font-bold text-slate-500">
                🚛 {r.vehiculo} · <span className="text-emerald-600">{r.estado}</span>
              </span>
            </div>
          </div>
        ))}
      </div>

      {rutasFiltradas.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-500">
          <CalendarDays className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p className="font-bold text-slate-700">No se encontraron rutas con ese filtro</p>
          <p className="text-xs mt-1">Intenta seleccionar &ldquo;Todas las Rutas&rdquo; o buscar otro nombre de sector.</p>
          <button
            type="button"
            onClick={() => {
              setDiaSeleccionado('TODOS');
              setFiltroTurno('TODOS');
              setBusquedaSector('');
            }}
            className="mt-4 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 cursor-pointer"
          >
            Ver todas las rutas
          </button>
        </div>
      )}

      {/* Nota informativa */}
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-900 leading-relaxed">
          <strong>Recomendación IAMEC:</strong> Los horarios de recolección pueden variar ligeramente según las condiciones operativas. Por favor disponga los desechos en bolsas bien cerradas antes del paso de la unidad compactadora.
        </p>
      </div>
    </div>
  );
}
