'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { BellRing, X, CheckCircle, ChevronRight, Volume2, VolumeX } from 'lucide-react';


interface Alerta {
  id: string;
  identidad: string;
  monto: string;
  banco: string;
  referencia: string;
  created_at: string;
}

export default function TransferenciaAlarm() {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [visible, setVisible] = useState(false);
  const [pulsing, setPulsing] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [silenced, setSilenced] = useState(false);
  const [connected, setConnected] = useState(false);

  const seenIds = useRef<Set<string>>(new Set());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const alarmInterval = useRef<NodeJS.Timeout | null>(null);
  const lastCheckRef = useRef<string>(new Date().toISOString());

  // ── Crear y desbloquear AudioContext en la primera interacción del usuario ──
  const unlockAudio = useCallback(() => {
    if (audioUnlocked) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      // Reproducir silencio para desbloquear
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
      audioCtxRef.current = ctx;
      setAudioUnlocked(true);
    } catch (e) {
      console.warn('No se pudo desbloquear audio:', e);
    }
  }, [audioUnlocked]);

  // Desbloquear en cualquier interacción del usuario
  useEffect(() => {
    const events = ['click', 'keydown', 'touchstart', 'mousedown'];
    const handler = () => { unlockAudio(); };
    events.forEach(e => document.addEventListener(e, handler, { once: false }));
    return () => events.forEach(e => document.removeEventListener(e, handler));
  }, [unlockAudio]);

  // ── Notificaciones sin sonido permanentemente a petición del usuario ──
  const speakAlert = useCallback((_texto: string) => {
    return;
  }, []);

  const playAlarm = useCallback((_alerta?: Alerta) => {
    return;
  }, []);

  const triggerAlarm = useCallback((pago: Alerta) => {
    if (seenIds.current.has(pago.id)) return;
    seenIds.current.add(pago.id);

    setAlertas(prev => [pago, ...prev].slice(0, 15));
    setVisible(true);
    setPulsing(true);
    setTimeout(() => setPulsing(false), 3000);
  }, []);

  const stopAlarm = useCallback(() => {
    if (alarmInterval.current) {
      clearInterval(alarmInterval.current);
      alarmInterval.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    stopAlarm();
  }, [stopAlarm]);

  // ── Supabase Realtime (sin filtro para máxima compatibilidad) ──
  useEffect(() => {
    const channel = supabase
      .channel('transferencias-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pagos_reportados' },
        (payload) => {
          const pago = payload.new as any;
          // Filtrar solo transferencias aprobadas
          if (
            pago.tipo === 'Transferencia' &&
            pago.estado === 'Aprobado'
          ) {
            triggerAlarm({
              id: String(pago.id || Date.now()),
              identidad: pago.identidad || '---',
              monto: pago.monto || '0',
              banco: pago.banco || 'Transferencia',
              referencia: pago.referencia || '---',
              created_at: pago.created_at || new Date().toISOString(),
            });
          }
        }
      )
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED');
      });

    return () => { supabase.removeChannel(channel); };
  }, [triggerAlarm]);

  // ── Polling fallback cada 30s por si Realtime falla ──
  useEffect(() => {
    const poll = async () => {
      try {
        const { data } = await supabase
          .from('pagos_reportados')
          .select('id, identidad, monto, banco, referencia, created_at')
          .eq('tipo', 'Transferencia')
          .eq('estado', 'Aprobado')
          .gt('created_at', lastCheckRef.current)
          .order('created_at', { ascending: false })
          .limit(5);

        if (data && data.length > 0) {
          lastCheckRef.current = new Date().toISOString();
          data.forEach((pago: any) => {
            triggerAlarm({
              id: String(pago.id),
              identidad: pago.identidad || '---',
              monto: pago.monto || '0',
              banco: pago.banco || 'Transferencia',
              referencia: pago.referencia || '---',
              created_at: pago.created_at || new Date().toISOString(),
            });
          });
        }
      } catch (e) {}
    };

    const interval = setInterval(poll, 30000);
    return () => clearInterval(interval);
  }, [triggerAlarm]);

  // ── UI ──
  return (
    <>
      {/* Solo aparece cuando hay notificaciones pendientes (no estorba en pantalla).
          Silenciar y Probar sonido están dentro del panel de notificaciones. */}
      {alertas.length > 0 && !visible && (
        <div className="fixed bottom-6 right-6 z-50">
          <button
            onClick={() => { setVisible(true); unlockAudio(); }}
            className="bg-orange-500 hover:bg-orange-600 text-white rounded-full px-3 py-2 shadow-lg flex items-center gap-2 transition-all"
            title={connected ? 'Notificaciones en vivo' : 'Reconectando…'}
          >
            <BellRing className="w-4 h-4 animate-bounce" />
            <span className="text-xs font-bold">{alertas.length} pendiente{alertas.length > 1 ? 's' : ''}</span>
          </button>
        </div>
      )}

      {/* Panel de alarma */}
      {visible && alertas.length > 0 && (
        <div className="fixed top-4 right-4 z-[9999] w-[400px] max-w-[95vw]">
          <div className={`rounded-xl shadow-2xl overflow-hidden border-2 ${pulsing ? 'border-yellow-300' : 'border-orange-400'}`}>
            {/* Header */}
            <div className={`bg-orange-600 px-4 py-3 flex items-center gap-3 ${pulsing ? 'animate-pulse' : ''}`}>
              <div className="bg-white/20 rounded-full p-2">
                <BellRing className="w-5 h-5 text-white animate-bounce" />
              </div>
              <div className="flex-1">
                <div className="font-black text-white text-sm">✅ TRANSFERENCIA APROBADA</div>
                <div className="text-orange-100 text-[11px]">La transferencia ha sido conciliada con éxito</div>
              </div>
              <button onClick={dismiss} className="bg-white/20 hover:bg-white/30 rounded-full p-1.5 transition-colors">
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            {/* Lista */}
            <div className="bg-white max-h-[280px] overflow-y-auto divide-y divide-orange-50">
              {alertas.map((a, i) => (
                <div key={a.id} className={`px-4 py-3 ${i === 0 ? 'bg-yellow-50' : ''}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        {i === 0 && <span className="text-[9px] bg-red-500 text-white rounded px-1.5 py-0.5 font-black shrink-0 animate-pulse">NUEVA</span>}
                        <span className="font-bold text-slate-800 text-sm truncate">{a.identidad}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 space-x-1">
                        <span>{a.banco}</span>
                        <span>·</span>
                        <span className="font-mono font-semibold">Ref: {a.referencia}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-black text-emerald-700 text-sm">Bs. {Number(a.monto).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</div>
                      <div className="text-[10px] text-slate-400">{new Date(a.created_at).toLocaleTimeString('es-VE')}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="bg-orange-50 border-t border-orange-100 px-4 py-2.5 flex items-center justify-between gap-2">
              <a
                href="/admin/estado-cuenta"
                onClick={dismiss}
                className="flex items-center gap-1 text-orange-700 text-xs font-bold hover:text-orange-900 transition-colors"
              >
                Ver detalles <ChevronRight className="w-3 h-3" />
              </a>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { unlockAudio(); setTimeout(() => playAlarm(undefined), 100); }}
                  className="text-slate-400 hover:text-slate-600 text-[11px] flex items-center gap-1"
                  title="Probar sonido de alarma"
                >
                  <BellRing className="w-3 h-3" /> Probar
                </button>
                <button
                  onClick={() => { setSilenced(s => !s); }}
                  className="text-slate-400 hover:text-slate-600 text-[11px] flex items-center gap-1"
                >
                  {silenced ? <><Volume2 className="w-3 h-3" /> Activar</> : <><VolumeX className="w-3 h-3" /> Silenciar</>}
                </button>
                <button
                  onClick={() => { setAlertas([]); dismiss(); }}
                  className="flex items-center gap-1 text-slate-400 hover:text-slate-600 text-[11px]"
                >
                  <CheckCircle className="w-3 h-3" /> Limpiar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
