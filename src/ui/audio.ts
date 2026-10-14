/**
 * Tiny synthesized sound effects. Generating tones with oscillators avoids
 * shipping audio files, and the context is only created after a user gesture
 * because browsers refuse to start audio before one.
 */
export class Sound {
  private ctx: AudioContext | null = null;
  muted = false;

  /** Call from a user gesture (key press, click, tap). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
    } catch {
      this.ctx = null;
    }
  }

  private tone(
    type: OscillatorType,
    from: number,
    to: number,
    duration: number,
    volume: number,
    delay = 0,
  ): void {
    const ctx = this.ctx;
    if (this.muted || ctx?.state !== 'running') return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(to, t0 + duration);
    // Short attack and exponential release avoid audible clicks.
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  eat(): void {
    this.tone('triangle', 520, 900, 0.09, 0.12);
  }

  die(): void {
    this.tone('sawtooth', 320, 70, 0.45, 0.08);
  }

  win(): void {
    [523, 659, 784, 1047].forEach((f, i) => {
      this.tone('triangle', f, f, 0.16, 0.1, i * 0.12);
    });
  }

  start(): void {
    this.tone('sine', 330, 660, 0.12, 0.08);
  }
}
