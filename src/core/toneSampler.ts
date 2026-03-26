/**
 * Tone Sampler - Pre-generated clean Morse tone samples
 *
 * Uses pre-generated AudioBuffer with proper envelope shaping
 * to avoid distortion and clicks that occur with real-time synthesis.
 */

export interface ToneConfig {
  /** Tone frequency in Hz */
  frequency: number;
  /** Sample rate */
  sampleRate: number;
  /** Tone amplitude (0-1) */
  amplitude: number;
}

export class ToneSampler {
  private audioContext: AudioContext | null = null;
  private ditBuffer: AudioBuffer | null = null;
  private dahBuffer: AudioBuffer | null = null;
  private silenceBuffer: AudioBuffer | null = null;
  private config: ToneConfig;
  private dotDuration: number = 0.06; // seconds
  private dashDuration: number = 0.18; // seconds
  private intraCharGap: number = 0.06; // seconds
  private envelopeRatio: number = 0.15; // 15% of dot duration for envelope

  constructor(config: Partial<ToneConfig> = {}) {
    this.config = {
      frequency: config.frequency ?? 700,
      sampleRate: config.sampleRate ?? 48000, // Use standard 48kHz for better quality
      amplitude: config.amplitude ?? 0.8,
    };
  }

  /**
   * Initialize the AudioContext and generate tone buffers
   * Must be called after user interaction (browser policy)
   */
  async initialize(): Promise<void> {
    if (this.audioContext) return;

    // Use 48kHz for better audio quality and more samples at high WPM
    this.audioContext = new AudioContext({ sampleRate: 48000 });

    // Generate clean tone buffers
    await this.generateBuffers();
  }

  /**
   * Generate pre-computed tone buffers with proper envelope
   */
  private async generateBuffers(): Promise<void> {
    if (!this.audioContext) return;

    // Explicitly clear old buffers before creating new ones —
    // AudioBuffer objects may be retained by the AudioContext internals
    // until they are no longer referenced, so we null them out first.
    this.ditBuffer = null;
    this.dahBuffer = null;
    this.silenceBuffer = null;

    const { sampleRate, amplitude } = this.config;

    // Adaptive envelope - 15% of dot duration, but min 3ms, max 10ms
    const envelopeTime = Math.max(0.003, Math.min(0.01, this.dotDuration * this.envelopeRatio));
    const envelopeSamples = Math.floor(envelopeTime * sampleRate);

    // Ensure minimum buffer size for reliable playback
    const minSamples = Math.max(256, envelopeSamples * 2);

    // Generate dit buffer (1 unit) - minimum size for reliable playback
    const ditSamples = Math.max(minSamples, Math.ceil(this.dotDuration * sampleRate));
    this.ditBuffer = this.audioContext.createBuffer(1, ditSamples, sampleRate);
    this.fillToneBuffer(this.ditBuffer, envelopeSamples, amplitude);

    // Generate dah buffer (3 units)
    const dahSamples = Math.max(minSamples, Math.ceil(this.dashDuration * sampleRate));
    this.dahBuffer = this.audioContext.createBuffer(1, dahSamples, sampleRate);
    this.fillToneBuffer(this.dahBuffer, envelopeSamples, amplitude);

    // Generate silence buffer for intra-character gap (1 unit)
    const silenceSamples = Math.max(minSamples, Math.ceil(this.intraCharGap * sampleRate));
    this.silenceBuffer = this.audioContext.createBuffer(1, silenceSamples, sampleRate);
    // Silence buffer is already zeros
  }

  /**
   * Fill an AudioBuffer with a clean sine wave + envelope
   */
  private fillToneBuffer(buffer: AudioBuffer, envelopeSamples: number, amplitude: number): void {
    const channelData = buffer.getChannelData(0);
    const numSamples = buffer.length;
    const omega = (2 * Math.PI * this.config.frequency) / this.config.sampleRate;

    // Ensure envelope doesn't exceed half the buffer
    const safeEnvelopeSamples = Math.min(envelopeSamples, Math.floor(numSamples / 2));

    for (let i = 0; i < numSamples; i++) {
      // Generate sine wave
      let sample = Math.sin(omega * i) * amplitude;

      // Apply envelope (smooth attack/decay using cosine curve for click-free transitions)
      if (safeEnvelopeSamples > 0) {
        if (i < safeEnvelopeSamples) {
          // Smooth attack using cosine curve
          const env = 0.5 * (1 - Math.cos(Math.PI * i / safeEnvelopeSamples));
          sample *= env;
        } else if (i >= numSamples - safeEnvelopeSamples) {
          // Smooth decay using cosine curve
          const decayPos = i - (numSamples - safeEnvelopeSamples);
          const env = 0.5 * (1 + Math.cos(Math.PI * decayPos / safeEnvelopeSamples));
          sample *= env;
        }
      }

      channelData[i] = sample;
    }
  }

  /**
   * Get the dit (dot) audio buffer
   */
  getDitBuffer(): AudioBuffer | null {
    return this.ditBuffer;
  }

  /**
   * Get the dah (dash) audio buffer
   */
  getDahBuffer(): AudioBuffer | null {
    return this.dahBuffer;
  }

  /**
   * Get the intra-character silence buffer
   */
  getSilenceBuffer(): AudioBuffer | null {
    return this.silenceBuffer;
  }

  /**
   * Get the dot duration in seconds
   */
  getDotDuration(): number {
    return this.dotDuration;
  }

  /**
   * Get the dah duration in seconds
   */
  getDashDuration(): number {
    return this.dashDuration;
  }

  /**
   * Get the intra-character gap duration in seconds
   */
  getIntraCharGap(): number {
    return this.intraCharGap;
  }

  /**
   * Update timing based on WPM
   */
  setWPM(wpm: number): void {
    // PARIS standard: 50 units per minute at 1 WPM
    this.dotDuration = 1.2 / wpm;
    this.dashDuration = 3 * this.dotDuration;
    this.intraCharGap = this.dotDuration;

    // Regenerate buffers with new timing
    if (this.audioContext) {
      this.generateBuffers();
    }
  }

  /**
   * Update tone frequency
   */
  setFrequency(hz: number): void {
    this.config.frequency = hz;

    // Regenerate buffers with new frequency
    if (this.audioContext) {
      this.generateBuffers();
    }
  }

  /**
   * Update amplitude/volume
   */
  setAmplitude(amplitude: number): void {
    this.config.amplitude = Math.max(0, Math.min(1, amplitude));

    // Regenerate buffers with new amplitude
    if (this.audioContext) {
      this.generateBuffers();
    }
  }

  /**
   * Get the AudioContext (for creating new buffers if needed)
   */
  getAudioContext(): AudioContext | null {
    return this.audioContext;
  }

  /**
   * Check if initialized
   */
  isReady(): boolean {
    return this.ditBuffer !== null && this.dahBuffer !== null;
  }
}

/** Default tone sampler instance */
export const defaultToneSampler = new ToneSampler();
