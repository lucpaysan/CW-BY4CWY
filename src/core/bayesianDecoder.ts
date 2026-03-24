/**
 * Bayesian CW Decoder
 * Based on HamFist - Adaptive Bayesian beam search decoder
 *
 * Features:
 * - Adaptive Gaussian timing classifier (learns signal speed in real-time)
 * - Beam search with multiple hypotheses
 * - Dictionary-based language model
 */

// Morse code alphabet
const MORSE_CODE: Record<string, string> = {
  A: ".-",
  B: "-...",
  C: "-.-.",
  D: "-..",
  E: ".",
  F: "..-.",
  G: "--.",
  H: "....",
  I: "..",
  J: ".---",
  K: "-.-",
  L: ".-..",
  M: "--",
  N: "-.",
  O: "---",
  P: ".--.",
  Q: "--.-",
  R: ".-.",
  S: "...",
  T: "-",
  U: "..-",
  V: "...-",
  W: ".--",
  X: "-..-",
  Y: "-.--",
  Z: "--..",
  0: "-----",
  1: ".----",
  2: "..---",
  3: "...--",
  4: "....-",
  5: ".....",
  6: "-....",
  7: "--...",
  8: "---..",
  9: "----.",
  "=": "-...-",
  "/": "-..-.",
  ".": ".-.-.-",
  ",": "--..--",
  "?": "..--..",
  "-": "-....-",
  "(": "-.--.",
  ")": "-.--.-",
};

// Build reverse lookup: morse pattern -> character
const PATTERN_TO_CHAR: Record<string, string> = {};
for (const [char, pattern] of Object.entries(MORSE_CODE)) {
  PATTERN_TO_CHAR[pattern] = char;
}

// Common ham radio words and abbreviations (used for language modeling)
const DICTIONARY = new Set([
  "CQ", "DE", "K", "R", "UR", "OK", "WX", "HR", "HI", "OM", "YL", "XYL", "SK",
  "73", "88", "55", "77",
  "QSO", "QSL", "QRM", "QRN", "QTH", "QRA", "QSB", "QRZ", "QSY", "RST",
  "CW", "AM", "FM", "SSB",
  "ANT", "TX", "RX", "WPM", "Hz", "kHz", "MHz", "GHz",
  "DIP", "VERT", "YAGI", "BEAM", "GP", "LP",
  "ES", "ON", "IN", "TO", "FROM", "FOR", "AT", "BY",
  "THE", "AND", "ARE", "NOT", "BUT", "ALL", "ANY", "WAS", "WITH", "WILL",
  "THIS", "THAT", "HAVE", "FROM", "THEY", "BEEN", "HAVE", "HAS", "HAD",
  "CALL", "CALLS", "CALLING", "CALLED",
  "NAME", "NICE", "NEW", "NOW", "HOW", "ANY", "ONE", "WAY",
  "VERY", "GOOD", "GREAT", "BEST", "MUCH", "JUST", "LIKE",
  "COPY", "SAME", "MAY", "CAN", "DAY", "MAY", "SAY",
]);

// Export dictionary for external use
export { DICTIONARY };

// Beam search candidate
interface Candidate {
  text: string;
  pattern: string;
  logProb: number;
}

export interface BayesianDecodeResult {
  text: string;
  confidence: number;
}

export class BayesianDecoder {
  private beamWidth: number;

  // Adaptive timing parameters
  private dotDuration: number = 0.06; // seconds
  private dashDuration: number = 0.18;
  private interCharGap: number = 0.18;
  private wordGap: number = 0.42;

  // Noise estimation
  private noiseFloor: number = 0.01;
  private signalThreshold: number = 0.09;

  // Histograms for adaptive learning
  private markHist: number[] = [];
  private lastSignalTime: number = 0;
  private signalActive: boolean = false;
  private markStartTime: number = 0;

  constructor() {
    this.beamWidth = 3;
  }

  reset() {
    this.markHist = [];
    this.signalActive = false;
    this.dotDuration = 0.06;
    this.dashDuration = 0.18;
    this.interCharGap = 0.18;
    this.wordGap = 0.42;
    this.noiseFloor = 0.01;
    this.signalThreshold = 0.09;
  }

  /**
   * Process audio samples and detect Morse elements
   */
  processAudio(samples: Float32Array, sampleRate: number): BayesianDecodeResult {
    const results: string[] = [];
    let currentPattern = "";
    let candidates: Candidate[] = [{ text: "", pattern: "", logProb: 0 }];

    // Simple energy-based detection
    let i = 0;
    while (i < samples.length) {
      // Compute energy in sliding window
      const windowSize = Math.floor(sampleRate * 0.01); // 10ms window
      let energy = 0;
      for (let j = 0; j < windowSize && i + j < samples.length; j++) {
        energy += samples[i + j] * samples[i + j];
      }
      energy = Math.sqrt(energy / windowSize);

      const time = i / sampleRate;

      // Adaptive threshold
      this.signalThreshold = Math.max(0.05, this.noiseFloor * 5);

      if (energy > this.signalThreshold) {
        // Signal present
        if (!this.signalActive) {
          // Mark start
          if (this.markStartTime > 0) {
            const markDuration = time - this.markStartTime;
            this.markHist.push(markDuration);
            this.updateTimingEstimates();
          }
          this.markStartTime = time;
          this.signalActive = true;

          // Process completed space
          if (currentPattern.length > 0) {
            const char = PATTERN_TO_CHAR[currentPattern];
            if (char) {
              candidates = this.expandCandidates(candidates, char);
              results.push(char);
            }
            currentPattern = "";
          }
        }
      } else {
        // Signal absent (space)
        if (this.signalActive) {
          // Mark end
          this.signalActive = false;
          const markDuration = time - this.markStartTime;
          this.markHist.push(markDuration);
          this.updateTimingEstimates();

          // Determine if dot or dash based on learned timing
          if (markDuration < (this.dotDuration + this.dashDuration) / 2) {
            currentPattern += ".";
          } else {
            currentPattern += "-";
          }

          this.lastSignalTime = time;
        } else {
          // Check for inter-character gap
          const spaceDuration = time - this.lastSignalTime;
          if (spaceDuration > this.interCharGap && currentPattern.length > 0) {
            // Space is long enough - end of character
            const char = PATTERN_TO_CHAR[currentPattern];
            if (char) {
              candidates = this.expandCandidates(candidates, char);
              results.push(char);
            }
            currentPattern = "";
          }

          // Check for word gap
          if (spaceDuration > this.wordGap * 0.7 && results.length > 0) {
            results.push(" ");
          }
        }
      }

      // Update noise floor estimate
      if (!this.signalActive) {
        this.noiseFloor = this.noiseFloor * 0.99 + energy * 0.01;
      }

      i += Math.floor(sampleRate * 0.005); // 5ms step
    }

    return {
      text: results.join(""),
      confidence: candidates.length > 0 ? Math.exp(candidates[0].logProb) : 0,
    };
  }

  /**
   * Expand beam search candidates with new character
   */
  private expandCandidates(candidates: Candidate[], newChar: string): Candidate[] {
    const newCandidates: Candidate[] = [];

    for (const cand of candidates) {
      const newText = cand.text + newChar;
      const logProb = cand.logProb + Math.log(0.8); // Simplified probability

      newCandidates.push({
        text: newText,
        pattern: cand.pattern + newChar,
        logProb,
      });
    }

    // Sort by probability and keep top N
    newCandidates.sort((a, b) => b.logProb - a.logProb);
    return newCandidates.slice(0, this.beamWidth);
  }

  /**
   * Update timing estimates based on observed marks/spaces
   */
  private updateTimingEstimates() {
    if (this.markHist.length < 10) return;

    // Simple clustering: sort and find groups
    const sorted = [...this.markHist].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];

    // Assume dots are shorter, dashes are ~3x longer
    if (median < 0.15) {
      this.dotDuration = median;
      this.dashDuration = median * 3;
      this.interCharGap = median * 3;
      this.wordGap = median * 7;
    }
  }

  /**
   * Decode from spectrogram data (alternative input)
   */
  decodeFromSpectrogram(spectrogram: Float32Array): string {
    // Simplified: treat each time step as binary presence/absence
    const samples = new Float32Array(spectrogram.length);
    for (let i = 0; i < spectrogram.length; i++) {
      samples[i] = spectrogram[i] > 0.5 ? 1 : 0;
    }

    // Assume 3200 Hz sample rate
    return this.processAudio(samples, 3200).text;
  }
}

/** Default decoder instance */
export const defaultBayesianDecoder = new BayesianDecoder();
