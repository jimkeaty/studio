// ── Competition Audio Engine ──────────────────────────────────────────────
// Web Audio API-based sound system with swappable audio packs.
// Designed for browser-only usage — gracefully no-ops in SSR.

import type { AudioPack } from './types';

// ── Helpers ───────────────────────────────────────────────────────────────

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.AudioContext !== 'undefined';
}

/**
 * Create a white-noise AudioBuffer (1 second at the context sample rate).
 */
function createWhiteNoise(ctx: AudioContext, duration: number = 1): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = sampleRate * duration;
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

/**
 * Play a sine tone at the given frequency and duration through a gain envelope.
 */
function playSineTone(
  ctx: AudioContext,
  dest: AudioNode,
  freq: number,
  startTime: number,
  duration: number,
  volume: number = 0.15,
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(gain);
  gain.connect(dest);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

// ── CompetitionAudioEngine ────────────────────────────────────────────────

export class CompetitionAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private pack: AudioPack;
  muted: boolean = false;

  // Persistent nodes for ambient / engine loops
  private ambientSource: AudioBufferSourceNode | null = null;
  private ambientGain: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;

  constructor(pack: AudioPack = 'none') {
    this.pack = pack;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  init(): void {
    if (!isBrowser()) return;
    if (this.ctx) return; // already initialised
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : 1;
    this.masterGain.connect(this.ctx.destination);
  }

  destroy(): void {
    this.stopAmbient();
    this.stopEngine();
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
      this.masterGain = null;
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.masterGain) {
      this.masterGain.gain.value = m ? 0 : 1;
    }
  }

  setPack(pack: AudioPack): void {
    this.stopAmbient();
    this.stopEngine();
    this.pack = pack;
  }

  // ── Guard ──────────────────────────────────────────────────────────────

  private get ready(): boolean {
    return this.ctx !== null && this.masterGain !== null && this.pack !== 'none';
  }

  private ensureResumed(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  // ── Generic sound triggers ─────────────────────────────────────────────

  playCountdownBeep(): void {
    if (!this.ready) return;
    this.ensureResumed();
    const ctx = this.ctx!;
    const dest = this.masterGain!;
    const now = ctx.currentTime;

    if (this.pack === 'nascar_engine') {
      // Crisp sine beep at 800 Hz, 0.15s
      playSineTone(ctx, dest, 800, now, 0.15, 0.2);
    } else if (this.pack === 'golf_clean') {
      // Soft chime-like tone at C5 (523 Hz) with fast decay
      playSineTone(ctx, dest, 523, now, 0.2, 0.1);
    }
  }

  playGoBeep(): void {
    if (!this.ready) return;
    this.ensureResumed();
    const ctx = this.ctx!;
    const dest = this.masterGain!;
    const now = ctx.currentTime;

    if (this.pack === 'nascar_engine') {
      // Higher, longer sine beep at 1200 Hz, 0.4s
      playSineTone(ctx, dest, 1200, now, 0.4, 0.25);
    } else if (this.pack === 'golf_clean') {
      // Two gentle ascending chimes
      playSineTone(ctx, dest, 523, now, 0.2, 0.1);
      playSineTone(ctx, dest, 659, now + 0.22, 0.25, 0.1);
    }
  }

  playVictory(): void {
    if (!this.ready) return;
    this.ensureResumed();
    const ctx = this.ctx!;
    const dest = this.masterGain!;
    const now = ctx.currentTime;

    if (this.pack === 'nascar_engine') {
      // Ascending fanfare C5-E5-G5-C6 with crowd burst
      const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
      notes.forEach((freq, i) => {
        playSineTone(ctx, dest, freq, now + i * 0.2, 0.35, 0.2);
      });
      // Crowd burst after fanfare
      setTimeout(() => this.playCrowd(1.5), 800);
    } else if (this.pack === 'golf_clean') {
      // Gentle ascending C-E-G-C with polite applause
      const notes = [523, 659, 784, 1047];
      notes.forEach((freq, i) => {
        playSineTone(ctx, dest, freq, now + i * 0.25, 0.4, 0.08);
      });
      setTimeout(() => this.playClap(1.2), 1000);
    }
  }

  playAchievement(level: 'small' | 'medium' | 'large'): void {
    if (!this.ready) return;
    this.ensureResumed();
    const ctx = this.ctx!;
    const dest = this.masterGain!;
    const now = ctx.currentTime;

    if (this.pack === 'nascar_engine') {
      // Quick ascending tones — more notes for bigger achievements
      const toneMap: Record<string, number[]> = {
        small: [600, 800],
        medium: [500, 700, 900],
        large: [500, 650, 800, 1000, 1200],
      };
      const tones = toneMap[level];
      tones.forEach((freq, i) => {
        playSineTone(ctx, dest, freq, now + i * 0.08, 0.12, 0.18);
      });
    } else if (this.pack === 'golf_clean') {
      if (level === 'small') {
        // Birdie: two soft ascending tones
        playSineTone(ctx, dest, 784, now, 0.25, 0.06);
        playSineTone(ctx, dest, 988, now + 0.15, 0.3, 0.06);
      } else if (level === 'medium') {
        // Birdie+: slightly richer
        playSineTone(ctx, dest, 784, now, 0.25, 0.07);
        playSineTone(ctx, dest, 988, now + 0.15, 0.3, 0.07);
        playSineTone(ctx, dest, 1175, now + 0.3, 0.35, 0.05);
      } else {
        // Eagle: three ascending crystal tones
        playSineTone(ctx, dest, 784, now, 0.3, 0.08);
        playSineTone(ctx, dest, 988, now + 0.2, 0.3, 0.08);
        playSineTone(ctx, dest, 1319, now + 0.4, 0.4, 0.06);
      }
    }
  }

  playPenalty(): void {
    if (!this.ready) return;
    this.ensureResumed();
    const ctx = this.ctx!;
    const dest = this.masterGain!;
    const now = ctx.currentTime;

    if (this.pack === 'nascar_engine') {
      // Low descending buzz
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(100, now + 0.3);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (this.pack === 'golf_clean') {
      // Single low soft tone
      playSineTone(ctx, dest, 262, now, 0.4, 0.06);
    }
  }

  playCrowd(duration: number = 2): void {
    if (!this.ready) return;
    this.ensureResumed();
    const ctx = this.ctx!;
    const dest = this.masterGain!;
    const now = ctx.currentTime;

    // White noise through bandpass for crowd feel
    const noiseBuffer = createWhiteNoise(ctx, duration);
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = this.pack === 'nascar_engine' ? 1000 : 800;
    bandpass.Q.value = 0.8;

    const gain = ctx.createGain();
    const vol = this.pack === 'nascar_engine' ? 0.15 : 0.06;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.1);
    gain.gain.setValueAtTime(vol, now + duration - 0.3);
    gain.gain.linearRampToValueAtTime(0, now + duration);

    source.connect(bandpass);
    bandpass.connect(gain);
    gain.connect(dest);
    source.start(now);
    source.stop(now + duration);
  }

  playAmbient(): void {
    if (!this.ready) return;
    this.stopAmbient();
    this.ensureResumed();
    const ctx = this.ctx!;
    const dest = this.masterGain!;

    if (this.pack === 'golf_clean') {
      // Very soft white noise (wind / nature ambience)
      const noiseBuffer = createWhiteNoise(ctx, 4);
      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer;
      source.loop = true;

      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 600;
      lowpass.Q.value = 0.5;

      const gain = ctx.createGain();
      gain.gain.value = 0.02; // very subtle

      source.connect(lowpass);
      lowpass.connect(gain);
      gain.connect(dest);
      source.start();

      this.ambientSource = source;
      this.ambientGain = gain;
    } else if (this.pack === 'nascar_engine') {
      // Low crowd murmur
      const noiseBuffer = createWhiteNoise(ctx, 4);
      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer;
      source.loop = true;

      const bandpass = ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.value = 1000;
      bandpass.Q.value = 1;

      const gain = ctx.createGain();
      gain.gain.value = 0.04;

      source.connect(bandpass);
      bandpass.connect(gain);
      gain.connect(dest);
      source.start();

      this.ambientSource = source;
      this.ambientGain = gain;
    }
  }

  stopAmbient(): void {
    if (this.ambientSource) {
      try {
        this.ambientSource.stop();
      } catch {
        // already stopped
      }
      this.ambientSource.disconnect();
      this.ambientSource = null;
    }
    if (this.ambientGain) {
      this.ambientGain.disconnect();
      this.ambientGain = null;
    }
  }

  // ── NASCAR-specific ────────────────────────────────────────────────────

  startEngine(): void {
    if (!this.ready || this.pack !== 'nascar_engine') return;
    this.stopEngine();
    this.ensureResumed();
    const ctx = this.ctx!;
    const dest = this.masterGain!;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 80; // idle RPM

    const gain = ctx.createGain();
    gain.gain.value = 0.06;

    // Low-pass to soften the sawtooth edge
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 400;
    lp.Q.value = 1;

    osc.connect(lp);
    lp.connect(gain);
    gain.connect(dest);
    osc.start();

    this.engineOsc = osc;
    this.engineGain = gain;
  }

  /**
   * Set engine pitch based on a 0-1 percentage. 0 = idle (80 Hz), 1 = full (280 Hz).
   */
  setEngineSpeed(pct: number): void {
    if (!this.engineOsc || !this.ctx) return;
    const clamped = Math.max(0, Math.min(1, pct));
    const freq = 80 + clamped * 200; // 80 → 280 Hz
    this.engineOsc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.1);
    // Volume also increases slightly with speed
    if (this.engineGain) {
      const vol = 0.06 + clamped * 0.06; // 0.06 → 0.12
      this.engineGain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.1);
    }
  }

  stopEngine(): void {
    if (this.engineOsc) {
      try {
        this.engineOsc.stop();
      } catch {
        // already stopped
      }
      this.engineOsc.disconnect();
      this.engineOsc = null;
    }
    if (this.engineGain) {
      this.engineGain.disconnect();
      this.engineGain = null;
    }
  }

  playScreech(): void {
    if (!this.ready || this.pack !== 'nascar_engine') return;
    this.ensureResumed();
    const ctx = this.ctx!;
    const dest = this.masterGain!;
    const now = ctx.currentTime;

    // Sawtooth sweep 2000 Hz → 500 Hz
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(2000, now);
    osc.frequency.exponentialRampToValueAtTime(500, now + 0.3);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 400;

    osc.connect(hp);
    hp.connect(gain);
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  // ── Golf-specific ──────────────────────────────────────────────────────

  playClap(duration: number = 1): void {
    if (!this.ready || this.pack !== 'golf_clean') return;
    this.ensureResumed();
    const ctx = this.ctx!;
    const dest = this.masterGain!;
    const now = ctx.currentTime;

    // Polite golf clap — filtered noise at low volume with envelope
    const noiseBuffer = createWhiteNoise(ctx, duration);
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2000;
    bp.Q.value = 0.5;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.04, now + 0.05);
    // Gentle swell then fade
    gain.gain.setValueAtTime(0.04, now + duration * 0.6);
    gain.gain.linearRampToValueAtTime(0, now + duration);

    source.connect(bp);
    bp.connect(gain);
    gain.connect(dest);
    source.start(now);
    source.stop(now + duration);
  }

  playChime(): void {
    if (!this.ready || this.pack !== 'golf_clean') return;
    this.ensureResumed();
    const ctx = this.ctx!;
    const dest = this.masterGain!;
    const now = ctx.currentTime;

    // Single subtle chime — leaderboard change
    playSineTone(ctx, dest, 1047, now, 0.5, 0.05); // C6
  }
}

// ── CompetitionCommentator (speech synthesis) ─────────────────────────────

export class CompetitionCommentator {
  private queue: string[] = [];
  private speaking: boolean = false;
  enabled: boolean = true;

  /**
   * Enqueue a line to be spoken. Lines are played sequentially so they
   * don't overlap.
   */
  say(text: string): void {
    if (!this.enabled) return;
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    this.queue.push(text);
    if (!this.speaking) {
      this.processQueue();
    }
  }

  /**
   * Cancel all pending and current speech.
   */
  cancel(): void {
    this.queue = [];
    this.speaking = false;
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }

  private processQueue(): void {
    if (this.queue.length === 0) {
      this.speaking = false;
      return;
    }

    if (typeof window === 'undefined' || !window.speechSynthesis) {
      this.queue = [];
      this.speaking = false;
      return;
    }

    this.speaking = true;
    const text = this.queue.shift()!;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 0.8;

    utterance.onend = () => {
      this.processQueue();
    };

    utterance.onerror = () => {
      // On error, proceed to the next item rather than blocking the queue
      this.processQueue();
    };

    window.speechSynthesis.speak(utterance);
  }
}
