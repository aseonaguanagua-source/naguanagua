const fs = require('fs');

// ── 1. Create TransferenciaAlarm.tsx ──
const componentPath = 'c:/Users/david/Desktop/tucacas/global_green_tucacas/src/components/TransferenciaAlarm.tsx';

const componentContent = `'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { BellRing, X, CheckCircle, ChevronRight } from 'lucide-react';

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

// Genera sonido de alarma usando Web Audio API (sin archivos externos)
function playAlarmSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const playBeep = (freq: number, start: number, duration: number, vol: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
      gain.gain.setValueAtTime(0, ctx.currentTime + start);
      gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + start + 0.01);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + start + duration);
      osc.type = 'sine';
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration + 0.05);
    };
    // Secuencia de alarma: 3 pitidos dobles
    playBeep(880, 0.0,  0.15, 0.4);
    playBeep(660, 0.17, 0.15, 0.4);
    playBeep(880, 0.45, 0.15, 0.4);
    playBeep(660, 0.62, 0.15, 0.4);
    playBeep(880, 0.90, 0.15, 0.4);
    playBeep(660, 1.07, 0.15, 0.4);
  } catch (e) {
    console.warn('Audio no disponible:', e);
  }
}

export default function TransferenciaAlarm() {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [visible, setVisible] = useState(false);
  const [pulsing, setPulsing] = useState(false);
  const seenIds = useRef<Set<string>>(new Set());
  const alarmInterval = useRef<NodeJS.Timeout | null>(null);

  const triggerAlarm = useCallback((pago: Alerta) => {
    if (seenIds.current.has(pago.id)) return;
    seenIds.current.add(pago.id);

    setAlertas(prev => [pago, ...prev].slice(0, 10));
    setVisible(true);
    setPulsing(true);

    // Reproducir sonido inmediatamente y repetir cada 8s hasta que se cierre
    playAlarmSound();
    if (alarmInterval.current) clearInterval(alarmInterval.current);
    alarmInterval.current = setInterval(playAlarmSound, 8000);

    setTimeout(() => setPulsing(false), 3000);
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    if (alarmInterval.current) {
      clearInterval(alarmInterval.current);
      alarmInterval.current = null;
    }
  }, []);

  useEffect(() => {
    // Suscripción Realtime a nuevas transferencias
    const channel = supabase
      .channel('transferencias-alarm')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'pagos_reportados',
          filter: 'tipo=eq.Transferencia',
        },
        (payload) => {
          const pago = payload.new as any;
          if (pago.estado === 'Por Verificar' || !pago.estado) {
            triggerAlarm({
              id: pago.id?.toString() || Date.now().toString(),
              identidad: pago.identidad || '---',
              monto: pago.monto || '0',
              banco: pago.banco || 'Transferencia',
              referencia: pago.referencia || '---',
              created_at: pago.created_at || new Date().toISOString(),
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (alarmInterval.current) clearInterval(alarmInterval.current);
    };
  }, [triggerAlarm]);

  if (!visible || alertas.length === 0) {
    // Botón flotante indicador cuando hay alertas previas no conciliadas
    return alertas.length > 0 ? (
      <button
        onClick={() => setVisible(true)}
        className="fixed bottom-6 right-6 z-50 bg-orange-500 hover:bg-orange-600 text-white rounded-full p-3 shadow-lg flex items-center gap-2 transition-all"
        title="Ver transferencias pendientes"
      >
        <BellRing className="w-5 h-5 animate-bounce" />
        <span className="text-xs font-bold pr-1">{alertas.length}</span>
      </button>
    ) : null;
  }

  return (
    <div className="fixed top-4 right-4 z-[9999] w-[380px] max-w-[95vw] space-y-2">
      {/* Encabezado */}
      <div className={\`bg-orange-600 text-white rounded-xl shadow-2xl overflow-hidden border-2 \${pulsing ? 'border-yellow-300 animate-pulse' : 'border-orange-400'}\`}>
        <div className="px-4 py-3 flex items-center gap-3">
          <div className="bg-white/20 rounded-full p-2">
            <BellRing className={\`w-5 h-5 \${pulsing ? 'animate-bounce' : ''}\`} />
          </div>
          <div className="flex-1">
            <div className="font-black text-sm tracking-wide">⚠ TRANSFERENCIA PENDIENTE</div>
            <div className="text-orange-100 text-[11px]">Requiere conciliación bancaria</div>
          </div>
          <button
            onClick={dismiss}
            className="bg-white/10 hover:bg-white/20 rounded-full p-1.5 transition-colors"
            title="Cerrar alarma"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Lista de alertas */}
        <div className="bg-orange-50 max-h-[300px] overflow-y-auto">
          {alertas.map((a, i) => (
            <div key={a.id} className={\`px-4 py-3 border-b border-orange-100 last:border-0 \${i === 0 ? 'bg-yellow-50' : 'bg-white'}\`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {i === 0 && <span className="text-[10px] bg-red-500 text-white rounded px-1.5 py-0.5 font-bold shrink-0">NUEVA</span>}
                    <span className="font-bold text-slate-800 text-sm truncate">{a.identidad}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 space-x-2">
                    <span>{a.banco}</span>
                    <span>·</span>
                    <span>Ref: <span className="font-mono font-semibold">{a.referencia}</span></span>
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
        <div className="px-4 py-2 bg-orange-600 flex items-center justify-between">
          <button
            onClick={() => { dismiss(); window.location.href = '/admin/estado-cuenta?tab=PorVerificar'; }}
            className="flex items-center gap-1 text-white text-xs font-bold hover:text-yellow-200 transition-colors"
          >
            Ir a verificar <ChevronRight className="w-3 h-3" />
          </button>
          <button
            onClick={() => { setAlertas([]); dismiss(); }}
            className="flex items-center gap-1 text-orange-200 text-xs hover:text-white transition-colors"
          >
            <CheckCircle className="w-3 h-3" /> Limpiar todo
          </button>
        </div>
      </div>
    </div>
  );
}
`;

fs.writeFileSync(componentPath, componentContent, 'utf8');
console.log('✅ TransferenciaAlarm.tsx creado');

// ── 2. Update admin layout to include the alarm component ──
const layoutPath = 'c:/Users/david/Desktop/tucacas/global_green_tucacas/src/app/(admin)/layout.tsx';
let layout = fs.readFileSync(layoutPath, 'utf8');

layout = layout.replace(
  `import Sidebar from "@/components/Sidebar";`,
  `import Sidebar from "@/components/Sidebar";
import TransferenciaAlarm from "@/components/TransferenciaAlarm";`
);

layout = layout.replace(
  `      </AppProvider>`,
  `        <TransferenciaAlarm />
      </AppProvider>`
);

fs.writeFileSync(layoutPath, layout, 'utf8');
console.log('✅ Admin layout actualizado con TransferenciaAlarm');
