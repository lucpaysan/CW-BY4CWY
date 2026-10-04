/**
 * Goertzel Algorithm Implementation
 *
 * The Goertzel algorithm is a specialized DFT (Discrete Fourier Transform)
 * algorithm that is more efficient than FFT when you need to detect the
 * energy at a specific frequency or a small number of frequencies.
 */

export interface GoertzelConfig {
  sampleRate: number;
  targetFreq: number;
  windowSize: number;
}

export interface GoertzelResult {
  magnitude: number;
  magnitudeDb: number;
  isDetected: boolean;
}

export function calculateGoertzelCoefficient(
  targetFreq: number,
  sampleRate: number
): number {
  const normalizedFreq = targetFreq / sampleRate;
  const w = 2 * Math.PI * normalizedFreq;
  return 2.0 * Math.cos(w);
}

export class GoertzelFilter {
  private targetFreq: number;
  private windowSize: number;
  private coefficient: number;
  private history: Float32Array;
  private historyIndex: number;
  private sPrev: number = 0;
  private sPrev2: number = 0;
  private sampleCount: number = 0;
  private hammingWindow: Float32Array;

  constructor(config: GoertzelConfig) {
    this.targetFreq = config.targetFreq;
    this.windowSize = config.windowSize;
    this.coefficient = calculateGoertzelCoefficient(config.targetFreq, config.sampleRate);
    this.history = new Float32Array(config.windowSize);
    this.historyIndex = 0;
    this.hammingWindow = this.computeHammingWindow(config.windowSize);
  }

  private computeHammingWindow(size: number): Float32Array {
    const window = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      window[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (size - 1));
    }
    return window;
  }

  processSample(sample: number): void {
    const windowedSample = sample * this.hammingWindow[this.historyIndex];
    this.history[this.historyIndex] = windowedSample;

    const s = windowedSample + this.coefficient * this.sPrev - this.sPrev2;
    this.sPrev2 = this.sPrev;
    this.sPrev = s;

    this.historyIndex = (this.historyIndex + 1) % this.windowSize;
    this.sampleCount++;
  }

  processSamples(samples: Float32Array, offset: number = 0, length?: number): void {
    const end = length !== undefined ? offset + length : samples.length;
    for (let i = offset; i < end; i++) {
      this.processSample(samples[i]);
    }
  }

  reset(): void {
    this.sPrev = 0;
    this.sPrev2 = 0;
    this.sampleCount = 0;
    this.historyIndex = 0;
    this.history.fill(0);
  }

  computeMagnitude(): number {
    // 标准 Goertzel 功率公式：power = s1² + s2² − coeff·s1·s2
    //
    // ⚠️ 早先写成 `sPrev * Math.sin(this.coefficient / 2)` ——
    //    coefficient 是 2cos(ω)，coefficient/2 = cos(ω)，
    //    对它求 sin 是无意义的（幅度失真，isDetected 判据不可靠）。
    //    这个公式完全不需要 sin 项。
    const s1 = this.sPrev;
    const s2 = this.sPrev2;
    return s1 * s1 + s2 * s2 - this.coefficient * s1 * s2;
  }

  getResult(threshold: number = 0.0): GoertzelResult {
    const magnitude = this.computeMagnitude();
    const magnitudeDb = 10 * Math.log10(magnitude + 1e-10);
    return {
      magnitude,
      magnitudeDb,
      isDetected: magnitude > threshold,
    };
  }

  isWindowComplete(): boolean {
    return this.sampleCount >= this.windowSize;
  }

  get targetFrequency(): number {
    return this.targetFreq;
  }

  get currentSampleCount(): number {
    return this.sampleCount;
  }
}

export class MultiFrequencyGoertzel {
  private filters: Map<number, GoertzelFilter> = new Map();
  private sampleRate: number;
  private windowSize: number;
  private frequencies: number[] = [];

  constructor(
    sampleRate: number,
    windowSize: number,
    frequencies: number[] = []
  ) {
    this.sampleRate = sampleRate;
    this.windowSize = windowSize;
    if (frequencies.length > 0) {
      this.addFrequencies(frequencies);
    }
  }

  addFrequencies(frequencies: number[]): void {
    for (const freq of frequencies) {
      if (!this.filters.has(freq)) {
        this.filters.set(freq, new GoertzelFilter({
          sampleRate: this.sampleRate,
          targetFreq: freq,
          windowSize: this.windowSize,
        }));
        this.frequencies.push(freq);
      }
    }
    this.frequencies.sort((a, b) => a - b);
  }

  processSample(sample: number): void {
    for (const filter of this.filters.values()) {
      filter.processSample(sample);
    }
  }

  processSamples(samples: Float32Array): void {
    for (let i = 0; i < samples.length; i++) {
      this.processSample(samples[i]);
    }
  }

  getAllResults(threshold: number = 0.0): Map<number, GoertzelResult> {
    const results = new Map<number, GoertzelResult>();
    for (const [freq, filter] of this.filters) {
      results.set(freq, filter.getResult(threshold));
    }
    return results;
  }

  getMaxFrequency(minMagnitude: number = 0.0): { frequency: number; magnitude: number } | null {
    let maxFreq = 0;
    let maxMag = minMagnitude;

    for (const [freq, filter] of this.filters) {
      const result = filter.getResult();
      if (result.magnitude > maxMag) {
        maxMag = result.magnitude;
        maxFreq = freq;
      }
    }

    return maxFreq > 0 ? { frequency: maxFreq, magnitude: maxMag } : null;
  }

  reset(): void {
    for (const filter of this.filters.values()) {
      filter.reset();
    }
  }

  get frequenciesDetected(): number[] {
    return this.frequencies;
  }
}
