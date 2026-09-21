'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { BellRing, X, CheckCircle, ChevronRight, Volume2, VolumeX } from 'lucide-react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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

  // ── Voz con SpeechSynthesis ──
  const speakAlert = useCallback((texto: string) => {
    if (silenced) return;
    try {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(texto);
      utter.lang = 'es-VE';
      utter.rate = 0.92;
      utter.pitch = 1.0;
      utter.volume = 1.0;
      // Precargar voces y elegir española
      const setVoice = () => {
        const voces = window.speechSynthesis.getVoices();
        const vozEs = voces.find(v => v.lang.startsWith('es')) || null;
        if (vozEs) utter.voice = vozEs;
        window.speechSynthesis.speak(utter);
      };
      if (window.speechSynthesis.getVoices().length > 0) {
        setVoice();
      } else {
        window.speechSynthesis.onvoiceschanged = setVoice;
      }
    } catch (e) {
      console.warn('SpeechSynthesis no disponible:', e);
    }
  }, [silenced]);

  // ── Reproducir alarma: pitidos + voz ──
  const playAlarm = useCallback((alerta?: Alerta) => {
    if (silenced) return;
    try {
      let ctx = audioCtxRef.current;
      if (!ctx || ctx.state === 'closed') {
        ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioCtxRef.current = ctx;
      }
      if (ctx.state === 'suspended') ctx.resume();

      const playTone = (freq: number, start: number, dur: number, vol = 0.5) => {
        const osc = ctx!.createOscillator();
        const gain = ctx!.createGain();
        osc.connect(gain);
        gain.connect(ctx!.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx!.currentTime + start);
        gain.gain.setValueAtTime(0, ctx!.currentTime + start);
        gain.gain.linearRampToValueAtTime(vol, ctx!.currentTime + start + 0.02);
        gain.gain.linearRampToValueAtTime(0, ctx!.currentTime + start + dur);
        osc.start(ctx!.currentTime + start);
        osc.stop(ctx!.currentTime + start + dur + 0.05);
      };

      // Pitidos urgentes
      playTone(1046, 0.00, 0.12);
      playTone(784,  0.14, 0.12);
      playTone(1046, 0.40, 0.12);
      playTone(784,  0.54, 0.12);
      playTone(1046, 0.80, 0.12);
      playTone(784,  0.94, 0.12);

      // Voz después de los pitidos
      const montoFmt = alerta
        ? Number(alerta.monto).toLocaleString('es-VE', { minimumFractionDigits: 2 })
        : '';
      const mensaje = alerta
        ? `Atención. Transferencia aprobada. Contribuyente: ${alerta.identidad}. Monto: ${montoFmt} bolívares.`
        : 'Atención. Transferencia aprobada.';
      setTimeout(() => speakAlert(mensaje), 1300);
    } catch (e) {
      console.warn('Error reproduciendo alarma:', e);
    }
  }, [silenced, speakAlert]);

  const triggerAlarm = useCallback((pago: Alerta) => {
    if (seenIds.current.has(pago.id)) return;
    seenIds.current.add(pago.id);

    setAlertas(prev => [pago, ...prev].slice(0, 15));
    setVisible(true);
    setPulsing(true);
    setTimeout(() => setPulsing(false), 3000);

    playAlarm(pago);
    if (alarmInterval.current) clearInterval(alarmInterval.current);
    alarmInterval.current = setInterval(() => playAlarm(pago), 8000);
  }, [playAlarm]);

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
      {/* Indicador de conexión + botón de silencio (siempre visible) */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
        {/* Botón silenciar/activar */}
        <button
          onClick={() => { setSilenced(s => !s); unlockAudio(); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold shadow transition-all ${
            silenced
              ? 'bg-slate-200 text-slate-500 hover:bg-slate-300'
              : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
          }`}
          title={silenced ? 'Activar alarma' : 'Silenciar alarma'}
        >
          {silenced ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
          {silenced ? 'Alarma silenciada' : 'Alarma activa'}
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-yellow-400'} animate-pulse`} />
        </button>

        {/* Botón probar sonido */}
        <button
          onClick={() => { unlockAudio(); setTimeout(() => playAlarm(undefined), 100); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-600 hover:bg-blue-100 shadow transition-all"
          title="Probar sonido de alarma"
        >
          <BellRing className="w-3 h-3" /> Probar sonido
        </button>

        {/* Badge de alertas pendientes */}
        {alertas.length > 0 && !visible && (
          <button
            onClick={() => { setVisible(true); unlockAudio(); }}
            className="bg-orange-500 hover:bg-orange-600 text-white rounded-full px-3 py-2 shadow-lg flex items-center gap-2 transition-all"
          >
            <BellRing className="w-4 h-4 animate-bounce" />
            <span className="text-xs font-bold">{alertas.length} pendiente{alertas.length > 1 ? 's' : ''}</span>
          </button>
        )}
      </div>

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
