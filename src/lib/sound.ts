/**
 * Aviso sonoro del descanso con Web Audio.
 * El contexto de audio solo puede arrancar tras un gesto del usuario, así que se
 * prepara al marcar una serie y el pitido se programa en ese mismo momento.
 */
let ctx: AudioContext | undefined;
let scheduled: OscillatorNode[] = [];

export function primeAudio(): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = undefined;
  }
}

export function cancelBeep(): void {
  for (const osc of scheduled) {
    try {
      osc.stop();
      osc.disconnect();
    } catch {
      /* ya había terminado */
    }
  }
  scheduled = [];
}

/** Programa tres pitidos cortos dentro de `inSeconds` segundos. */
export function scheduleBeep(inSeconds: number): void {
  cancelBeep();
  if (!ctx) return;
  const t0 = ctx.currentTime + Math.max(0, inSeconds);
  for (const [offset, freq] of [
    [0, 880],
    [0.22, 880],
    [0.44, 1320],
  ]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const start = t0 + offset;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.4, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.2);
    scheduled.push(osc);
  }
}
