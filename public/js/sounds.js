// AIM — synthesized sound effects via Web Audio API.
// No MP3 files required; this keeps the deploy lean.

let ctx = null;
let muted = localStorage.getItem("aim.muted") === "1";

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}

function envelope(gainNode, peak, attack, hold, release) {
  const t = ac().currentTime;
  gainNode.gain.setValueAtTime(0, t);
  gainNode.gain.linearRampToValueAtTime(peak, t + attack);
  gainNode.gain.linearRampToValueAtTime(peak, t + attack + hold);
  gainNode.gain.linearRampToValueAtTime(0, t + attack + hold + release);
  return t + attack + hold + release;
}

function tone(freq, type, gain, attack, hold, release, when = 0) {
  const a = ac();
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(g).connect(a.destination);
  const start = a.currentTime + when;
  osc.start(start);
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(gain, start + attack);
  g.gain.linearRampToValueAtTime(gain, start + attack + hold);
  g.gain.linearRampToValueAtTime(0, start + attack + hold + release);
  osc.stop(start + attack + hold + release + 0.05);
}

function noise(duration, gain) {
  const a = ac();
  const bufferSize = a.sampleRate * duration;
  const buf = a.createBuffer(1, bufferSize, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const g = a.createGain();
  src.connect(g).connect(a.destination);
  g.gain.setValueAtTime(gain, a.currentTime);
  g.gain.linearRampToValueAtTime(0, a.currentTime + duration);
  src.start();
}

export const Sounds = {
  isMuted: () => muted,
  setMuted(v) {
    muted = !!v;
    localStorage.setItem("aim.muted", muted ? "1" : "0");
  },
  toggle() {
    this.setMuted(!muted);
    return muted;
  },

  signon() {
    if (muted) return;
    // Door creak: pitch sweep
    const a = ac();
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = "sawtooth";
    osc.connect(g).connect(a.destination);
    const t = a.currentTime;
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.linearRampToValueAtTime(120, t + 0.5);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.05);
    g.gain.linearRampToValueAtTime(0.04, t + 0.45);
    g.gain.linearRampToValueAtTime(0, t + 0.55);
    osc.start(t);
    osc.stop(t + 0.6);
    // Welcome chime
    setTimeout(() => {
      tone(880, "sine", 0.12, 0.02, 0.08, 0.18);
      tone(1320, "sine", 0.10, 0.02, 0.08, 0.18, 0.12);
    }, 500);
  },

  signoff() {
    if (muted) return;
    const a = ac();
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = "sawtooth";
    osc.connect(g).connect(a.destination);
    const t = a.currentTime;
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.linearRampToValueAtTime(80, t + 0.4);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.05);
    g.gain.linearRampToValueAtTime(0, t + 0.45);
    osc.start(t);
    osc.stop(t + 0.5);
  },

  message() {
    if (muted) return;
    tone(1760, "sine", 0.14, 0.005, 0.05, 0.10);
    tone(2640, "sine", 0.10, 0.005, 0.05, 0.10, 0.06);
  },

  send() {
    if (muted) return;
    // Brief swoosh
    noise(0.06, 0.04);
  },

  error() {
    if (muted) return;
    tone(220, "square", 0.10, 0.005, 0.12, 0.10);
  },
};
