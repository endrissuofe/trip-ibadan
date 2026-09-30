// Audio system: synthesised with WebAudio (no downloads). Engine, road noise,
// braking, collisions, horn, UI clicks. Navigation voice lives in Navigation.
export class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private engA!: OscillatorNode; private engB!: OscillatorNode; private engGain!: GainNode; private engFilter!: BiquadFilterNode;
  private road!: GainNode; private roadFilter!: BiquadFilterNode;
  private brake!: GainNode;
  private hornGain!: GainNode;
  private beepGain!: GainNode;
  private reversing = false;
  private noiseBuf!: AudioBuffer;
  volume = 0.8;
  private gear = 1;

  /** Must be called from a user gesture. */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain(); this.master.gain.value = this.volume; this.master.connect(ctx.destination);
    // noise buffer
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    // engine: two detuned saws through a lowpass
    this.engFilter = ctx.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 600; this.engFilter.Q.value = 2;
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    this.engA = ctx.createOscillator(); this.engA.type = 'sawtooth';
    this.engB = ctx.createOscillator(); this.engB.type = 'square';
    const bGain = ctx.createGain(); bGain.gain.value = 0.35;
    this.engA.connect(this.engFilter); this.engB.connect(bGain).connect(this.engFilter);
    this.engFilter.connect(this.engGain).connect(this.master);
    this.engA.start(); this.engB.start();
    // road/tyre noise
    const rn = ctx.createBufferSource(); rn.buffer = this.noiseBuf; rn.loop = true;
    this.roadFilter = ctx.createBiquadFilter(); this.roadFilter.type = 'bandpass'; this.roadFilter.frequency.value = 400; this.roadFilter.Q.value = 0.6;
    this.road = ctx.createGain(); this.road.gain.value = 0;
    rn.connect(this.roadFilter).connect(this.road).connect(this.master); rn.start();
    // brake hiss
    const bn = ctx.createBufferSource(); bn.buffer = this.noiseBuf; bn.loop = true;
    const bf = ctx.createBiquadFilter(); bf.type = 'highpass'; bf.frequency.value = 2500;
    this.brake = ctx.createGain(); this.brake.gain.value = 0;
    bn.connect(bf).connect(this.brake).connect(this.master); bn.start();
    // horn: two square tones, slightly flat, like a real car/bus horn pair
    this.hornGain = ctx.createGain(); this.hornGain.gain.value = 0;
    const hf = ctx.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 1800;
    for (const f of [392, 494]) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f; o.connect(hf); o.start(); }
    hf.connect(this.hornGain).connect(this.master);
    // reverse warning beeper
    this.beepGain = ctx.createGain(); this.beepGain.gain.value = 0;
    const bo = ctx.createOscillator(); bo.type = 'sine'; bo.frequency.value = 1150; bo.connect(this.beepGain).connect(this.master); bo.start();
  }

  /** Reverse gear engaged: intermittent beep (driven from drive()). */
  setReversing(on: boolean) { this.reversing = on; }

  setVolume(v: number) { this.volume = v; if (this.ctx) this.master.gain.value = v; }


  /** Per-frame engine/road update. */
  drive(kmh: number, throttle: number, braking: number, offroad: boolean, running: boolean, heavy: boolean) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const speed = Math.abs(kmh);
    // simple gearbox so revs rise and drop
    const gearTop = [0, 22, 45, 70, 100, 140, 999];
    while (this.gear < 6 && speed > gearTop[this.gear]) this.gear++;
    while (this.gear > 1 && speed < gearTop[this.gear - 1] - 6) this.gear--;
    const lo = gearTop[this.gear - 1], hi = gearTop[this.gear] === 999 ? 180 : gearTop[this.gear];
    const rpm = running ? 850 + ((speed - lo) / (hi - lo)) * 3200 * (0.7 + 0.3 * throttle) : 0;
    const base = (heavy ? 0.022 : 0.03) * rpm;
    this.engA.frequency.setTargetAtTime(Math.max(20, base), t, 0.05);
    this.engB.frequency.setTargetAtTime(Math.max(20, base * 0.5), t, 0.05);
    this.engFilter.frequency.setTargetAtTime(300 + rpm * 0.25 + throttle * 500, t, 0.08);
    this.engGain.gain.setTargetAtTime(running ? 0.07 + throttle * 0.08 : 0, t, 0.1);
    this.road.gain.setTargetAtTime(Math.min(0.28, speed / 400) + (offroad ? 0.15 : 0), t, 0.1);
    this.roadFilter.frequency.setTargetAtTime(offroad ? 180 : 300 + speed * 4, t, 0.1);
    this.brake.gain.setTargetAtTime(braking > 0.5 && speed > 25 ? 0.05 * braking : 0, t, 0.05);
    const beep = this.reversing && running && t % 0.9 < 0.45;
    this.beepGain.gain.setTargetAtTime(beep ? 0.05 : 0, t, 0.01);
  }

  silence() { if (this.ctx) { const t = this.ctx.currentTime; this.engGain.gain.setTargetAtTime(0, t, 0.1); this.road.gain.setTargetAtTime(0, t, 0.1); this.brake.gain.setTargetAtTime(0, t, 0.05); this.hornGain.gain.setTargetAtTime(0, t, 0.02); this.beepGain.gain.setTargetAtTime(0, t, 0.02); } }

  horn(on: boolean) { if (this.ctx) this.hornGain.gain.setTargetAtTime(on ? 0.09 : 0, this.ctx.currentTime, 0.015); }

  crash(kmh: number) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900 + Math.min(3000, kmh * 60);
    const g = ctx.createGain(); const peak = Math.min(0.8, 0.15 + kmh / 60);
    g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5 + kmh / 80);
    src.connect(f).connect(g).connect(this.master); src.start(t); src.stop(t + 1.5);
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.3);
    const og = ctx.createGain(); og.gain.setValueAtTime(peak * 0.8, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(og).connect(this.master); o.start(t); o.stop(t + 0.4);
  }

  click() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.frequency.value = 880; g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.08);
  }

  /** Indicator relay tick. */
  tick() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'square'; o.frequency.value = 1800; g.gain.setValueAtTime(0.03, t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.03);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.04);
  }

  chime() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [660, 880].forEach((f, i) => { const o = this.ctx!.createOscillator(), g = this.ctx!.createGain(); o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t + i * 0.12); g.gain.exponentialRampToValueAtTime(0.08, t + i * 0.12 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 0.35); o.connect(g).connect(this.master); o.start(t + i * 0.12); o.stop(t + i * 0.12 + 0.4); });
  }
}
