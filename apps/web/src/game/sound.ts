import { useSyncExternalStore } from 'react';

/**
 * "Bureau d'expédition" sound palette (design-system §9), synthesised with Web Audio — no
 * audio files to download. Low volume, off by default (a phone may be on silent and the web
 * cannot tell); haptics only when the camp is planted and when the stamp lands.
 */
export type Cue = 'seal' | 'stamp' | 'paper' | 'falseTrail';

const KEY = 'meridian.sound';
const listeners = new Set<() => void>();
let ctx: AudioContext | null = null;

const enabled = () => {
  try {
    return localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
};

export function setSound(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l());
  if (on) play('paper');
}

export function useSound(): boolean {
  return useSyncExternalStore((l) => {
    listeners.add(l);
    return () => listeners.delete(l);
  }, enabled);
}

function noise(ac: AudioContext, seconds: number): AudioBufferSourceNode {
  const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * seconds), ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  return src;
}

function envelope(ac: AudioContext, peak: number, attack: number, decay: number): GainNode {
  const g = ac.createGain();
  const t = ac.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(ac.destination);
  return g;
}

export function play(cue: Cue) {
  if (!enabled()) return;
  try {
    ctx ??= new AudioContext();
    const ac = ctx;
    if (ac.state === 'suspended') void ac.resume();
    if (cue === 'paper') {
      // Paper unfolding: band-passed noise, a soft rustle.
      const src = noise(ac, 0.25);
      const f = ac.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 2400;
      f.Q.value = 0.8;
      src.connect(f).connect(envelope(ac, 0.05, 0.03, 0.2));
      src.start();
    } else if (cue === 'seal') {
      // Wax seal pressed: a low, damped thump.
      const o = ac.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(140, ac.currentTime);
      o.frequency.exponentialRampToValueAtTime(60, ac.currentTime + 0.18);
      o.connect(envelope(ac, 0.18, 0.005, 0.2));
      o.start();
      o.stop(ac.currentTime + 0.25);
    } else if (cue === 'stamp') {
      // Rubber stamp: a dry knock with a short burst of grit.
      const src = noise(ac, 0.08);
      const f = ac.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1400;
      src.connect(f).connect(envelope(ac, 0.22, 0.002, 0.07));
      src.start();
      const o = ac.createOscillator();
      o.frequency.value = 95;
      o.connect(envelope(ac, 0.12, 0.002, 0.09));
      o.start();
      o.stop(ac.currentTime + 0.12);
    } else {
      // False trail: a quill scratching a line through.
      const src = noise(ac, 0.35);
      const f = ac.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.setValueAtTime(3000, ac.currentTime);
      f.frequency.linearRampToValueAtTime(5000, ac.currentTime + 0.3);
      src.connect(f).connect(envelope(ac, 0.04, 0.02, 0.3));
      src.start();
    }
  } catch {
    /* audio unavailable */
  }
}

/** Haptics: planting the camp and the stamp only (design-system §9). */
export function haptic(kind: 'plant' | 'stamp') {
  try {
    navigator.vibrate?.(kind === 'plant' ? 12 : [6, 30, 10]);
  } catch {
    /* unsupported */
  }
}
