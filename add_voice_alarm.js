const fs = require('fs');
const path = 'c:/Users/david/Desktop/tucacas/global_green_tucacas/src/components/TransferenciaAlarm.tsx';
let c = fs.readFileSync(path, 'utf8');

// Replace the playAlarm function with the new version that includes voice
const oldFn = `  // ── Reproducir alarma usando AudioContext pre-desbloqueado ──
  const playAlarm = useCallback(() => {
    if (silenced) return;
    try {
      // Intentar con el contexto guardado primero
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

      // Alarma: 3 pitidos dobles urgentes
      playTone(1046, 0.00, 0.12);
      playTone(784,  0.14, 0.12);
      playTone(1046, 0.40, 0.12);
      playTone(784,  0.54, 0.12);
      playTone(1046, 0.80, 0.12);
      playTone(784,  0.94, 0.12);
    } catch (e) {
      console.warn('Error reproduciendo alarma:', e);
    }
  }, [silenced]);`;

const newFn = `  // ── Voz con SpeechSynthesis ──
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
        ? \`Atención. Transferencia pendiente por conciliar. Contribuyente: \${alerta.identidad}. Monto: \${montoFmt} bolívares.\`
        : 'Atención. Transferencia pendiente por conciliar.';
      setTimeout(() => speakAlert(mensaje), 1300);
    } catch (e) {
      console.warn('Error reproduciendo alarma:', e);
    }
  }, [silenced, speakAlert]);`;

// Try CRLF first, then LF
if (c.includes(oldFn.replace(/\n/g, '\r\n'))) {
  c = c.replace(oldFn.replace(/\n/g, '\r\n'), newFn);
  console.log('Replaced with CRLF match');
} else if (c.includes(oldFn)) {
  c = c.replace(oldFn, newFn);
  console.log('Replaced with LF match');
} else {
  // Fallback: find and replace using a known anchor
  const anchor = `  const triggerAlarm = useCallback((pago: Alerta) => {`;
  const anchorIdx = c.indexOf(anchor);
  if (anchorIdx === -1) { console.log('❌ Cannot find anchor'); process.exit(1); }
  
  // Find start of playAlarm
  const playAlarmMarker = `  // ── Reproducir alarma usando AudioContext`;
  const startIdx = c.indexOf(playAlarmMarker);
  if (startIdx === -1) { console.log('❌ Cannot find playAlarm start'); process.exit(1); }
  
  c = c.substring(0, startIdx) + newFn + '\n\n' + c.substring(anchorIdx);
  console.log('Replaced using anchor fallback');
}

// Update triggerAlarm to pass alerta to playAlarm
c = c.replace(
  '    playAlarm();\n    if (alarmInterval.current) clearInterval(alarmInterval.current);\n    alarmInterval.current = setInterval(playAlarm, 8000);',
  '    playAlarm(pago);\n    if (alarmInterval.current) clearInterval(alarmInterval.current);\n    alarmInterval.current = setInterval(() => playAlarm(pago), 8000);'
);

// Update "Probar sonido" button to also test voice
c = c.replace(
  `onClick={() => { unlockAudio(); setTimeout(playAlarm, 100); }}`,
  `onClick={() => { unlockAudio(); setTimeout(() => playAlarm(undefined), 100); }}`
);

fs.writeFileSync(path, c, 'utf8');
console.log('✅ Voz agregada a la alarma de transferencias');
