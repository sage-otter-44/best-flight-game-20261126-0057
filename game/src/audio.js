// Ridge Runner — Alpine Courier: procedural WebAudio.
// No sound files: the engine is a filtered sawtooth, the wind is filtered
// noise, and the rings, landing and crash are short synthesized notes.

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.windSource = null;
    this.windGain = null;
    this.muted = false;
  }

  /** Call from a user gesture; browsers block audio before one. */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AudioContext = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContext) return;
    this.ctx = new AudioContext();
    // Engine: two detuned saws through a low-pass, pitch follows throttle.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.value = 55.7;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 320;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter);
    osc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.ctx.destination);
    this.engineOsc.start();
    osc2.start();
    this.engineOsc2 = osc2;
    // Wind: looped noise through a band-pass, loudness follows airspeed.
    const len = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    this.windSource = this.ctx.createBufferSource();
    this.windSource.buffer = buffer;
    this.windSource.loop = true;
    const windFilter = this.ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 700;
    windFilter.Q.value = 0.6;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0;
    this.windSource.connect(windFilter);
    windFilter.connect(this.windGain);
    this.windGain.connect(this.ctx.destination);
    this.windSource.start();
  }

  /** Continuous engine + wind levels, called every frame. */
  update(throttle, speed, onGround, running) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const rpm = 42 + throttle * 58 + speed * 0.22;
    this.engineOsc.frequency.setTargetAtTime(rpm, t, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(rpm * 1.012, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(240 + throttle * 900, t, 0.1);
    this.engineGain.gain.setTargetAtTime(running ? (onGround ? 0.05 : 0.045 + throttle * 0.05) : 0, t, 0.1);
    this.windGain.gain.setTargetAtTime(running && !onGround ? Math.min(0.11, speed * 0.0016) : 0, t, 0.15);
  }

  tone(freq, dur, type, vol, when = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  ring() {
    this.tone(880, 0.35, 'sine', 0.22);
    this.tone(1318, 0.5, 'sine', 0.16, 0.07);
  }

  landed() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.18, i * 0.09));
  }

  crash() {
    this.tone(70, 0.7, 'sawtooth', 0.3);
    this.tone(48, 0.9, 'sine', 0.3, 0.05);
  }

  click() {
    this.tone(660, 0.07, 'square', 0.08);
  }
}
