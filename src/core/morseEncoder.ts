/**
 * Morse Code Encoder
 * Converts text to Morse code audio with adjustable speed and Farnsworth timing
 */

// Morse code alphabet: A-Z, 0-9, prosigns
const MORSE_CODE: Record<string, string> = {
  // Letters
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
  // Numbers
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
  // Punctuation
  "=": "-...-",
  "/": "-..-.",
  ".": ".-.-.-",
  ",": "--..--",
  "?": "..--..",
  "-": "-....-",
  "(": "-.--.",
  ")": "-.--.-",
  // Prosigns (mapped to special characters for decoder compatibility)
  AR: ".-.-",
  AS: ".-...",
  BK: "-...-.",
  BT: "-...-",  // Same as =
  CL: "-.-..-..",
  CT: "-.-.-",
  DO: "-..---",
  ERR: "........",
  KA: "-.-.-",
  KN: "-.--.",
  SK: "...-.-",
  SN: "...-.",
  SOS: "...---...",
  UR: "...--.",  // Same as SN
};

export interface EncoderConfig {
  /** Words per minute (standard: 20 WPM) */
  wpm: number;
  /** Farnsworth character spacing multiplier (1.0 = standard, 3.0 = extra spacing) */
  farnsworth: number;
  /** Tone frequency in Hz (standard: 700 Hz) */
  toneHz: number;
  /** Sample rate for audio generation */
  sampleRate: number;
}

export interface MorseSymbol {
  type: "tone" | "silence";
  duration: number; // in seconds
}

// Standard PARIS timing at 1 WPM = 50 dot units per minute
// 1 word "PARIS" = 50 units
// dot = 1 unit
// dash = 3 units
// intra-character gap = 1 unit
// inter-character gap = 3 units
// word gap = 7 units

export class MorseEncoder {
  private config: EncoderConfig;

  constructor(config: Partial<EncoderConfig> = {}) {
    this.config = {
      wpm: config.wpm ?? 20,
      farnsworth: config.farnsworth ?? 1.0,
      toneHz: config.toneHz ?? 700,
      sampleRate: config.sampleRate ?? 3200,
    };
  }

  setConfig(config: Partial<EncoderConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): EncoderConfig {
    return { ...this.config };
  }

  /** Get duration of one dot in seconds */
  private get dotDuration(): number {
    // PARIS standard: 50 units per minute at 1 WPM
    // dot = 1 unit
    return 1.2 / this.config.wpm; // seconds
  }

  /** Get duration of one dash in seconds */
  private get dashDuration(): number {
    return 3 * this.dotDuration;
  }

  /** Get intra-character gap duration (between dots/dashes within same character) */
  private get intraCharGap(): number {
    return 1 * this.dotDuration;
  }

  /** Get inter-character gap duration (between characters in a word) */
  private get interCharGap(): number {
    return 3 * this.dotDuration * this.config.farnsworth;
  }

  /** Get word gap duration (between words) */
  private get wordGap(): number {
    return 7 * this.dotDuration * this.config.farnsworth;
  }

  /** Convert text to Morse code sequence */
  textToMorse(text: string): string {
    const upper = text.toUpperCase();
    const morseParts: string[] = [];

    for (const char of upper) {
      if (char === " ") {
        // Word separator - will be handled by interCharGap + wordGap
        continue;
      }
      if (MORSE_CODE[char]) {
        morseParts.push(MORSE_CODE[char]);
      }
      // Unknown characters are skipped
    }

    return morseParts.join(" ");
  }

  /** Convert text to a sequence of Morse symbols (tone/silence intervals) */
  textToSymbols(text: string): MorseSymbol[] {
    const symbols: MorseSymbol[] = [];
    let lastWasChar = false;

    for (let i = 0; i < text.length; i++) {
      const char = text.toUpperCase()[i];

      if (char === " ") {
        // Word gap
        if (lastWasChar) {
          symbols.push({ type: "silence", duration: this.wordGap });
          lastWasChar = false;
        }
        continue;
      }

      const morse = MORSE_CODE[char];
      if (!morse) continue;

      // Add inter-character gap if this isn't the first character
      if (lastWasChar) {
        symbols.push({ type: "silence", duration: this.interCharGap });
      }

      // Convert morse pattern to symbols
      for (let j = 0; j < morse.length; j++) {
        const element = morse[j];

        // Add intra-character gap between elements of same character
        if (j > 0) {
          symbols.push({ type: "silence", duration: this.intraCharGap });
        }

        if (element === ".") {
          symbols.push({ type: "tone", duration: this.dotDuration });
        } else if (element === "-") {
          symbols.push({ type: "tone", duration: this.dashDuration });
        }
      }

      lastWasChar = true;
    }

    return symbols;
  }

  /**
   * Generate Morse audio buffer from text
   * @param text - Input text to encode
   * @param fadeDuration - Optional fade in/out duration in seconds (for click-free audio)
   * @returns Float32Array audio samples
   */
  generateAudio(text: string, fadeDuration: number = 0.005): Float32Array {
    const symbols = this.textToSymbols(text);
    if (symbols.length === 0) {
      return new Float32Array(0);
    }

    // Use 48kHz for high quality
    const sampleRate = 48000;

    // Calculate total duration
    const totalDuration = symbols.reduce((sum, s) => sum + s.duration, 0);
    const totalSamples = Math.ceil(totalDuration * sampleRate);

    const audio = new Float32Array(totalSamples);
    let sampleIndex = 0;

    // Pre-compute angular frequency for tone generation
    const omega = (2 * Math.PI * this.config.toneHz) / sampleRate;

    // Fade samples - ensure minimum size for reliable playback
    const minFadeSamples = Math.max(48, Math.floor(fadeDuration * sampleRate));

    for (const symbol of symbols) {
      const symbolSamples = Math.round(symbol.duration * sampleRate);

      if (symbol.type === "tone") {
        // Generate sine wave with smooth cosine envelope
        for (let i = 0; i < symbolSamples && sampleIndex < totalSamples; i++, sampleIndex++) {
          // Generate sine wave
          let amplitude = Math.sin(omega * sampleIndex);

          // Apply smooth cosine envelope for click-free transitions
          const envSamples = Math.min(minFadeSamples, Math.floor(symbolSamples / 2));
          if (envSamples > 0) {
            if (i < envSamples) {
              // Smooth attack using cosine curve
              const env = 0.5 * (1 - Math.cos(Math.PI * i / envSamples));
              amplitude *= env;
            } else if (i >= symbolSamples - envSamples) {
              // Smooth decay using cosine curve
              const decayPos = i - (symbolSamples - envSamples);
              const env = 0.5 * (1 + Math.cos(Math.PI * decayPos / envSamples));
              amplitude *= env;
            }
          }

          audio[sampleIndex] = amplitude;
        }
      } else {
        // Silence
        sampleIndex += symbolSamples;
      }
    }

    return audio;
  }

  /**
   * Generate Morse code preview (text representation with timing info)
   */
  getPreview(text: string): {
    morse: string;
    duration: number;
    wpm: number;
  } {
    return {
      morse: this.textToMorse(text),
      duration: this.textToSymbols(text).reduce((sum, s) => sum + s.duration, 0),
      wpm: this.config.wpm,
    };
  }
}

/** Default encoder instance */
export const defaultEncoder = new MorseEncoder();
