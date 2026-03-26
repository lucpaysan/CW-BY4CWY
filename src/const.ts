export const ENGLISH_CONFIG = {
  MODEL_FILE: "model_en.onnx",
  VOCABULARY: [
    "[UNK]",
    "/",
    "0",
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "?",
    "A",
    "B",
    "C",
    "D",
    "E",
    "F",
    "G",
    "H",
    "I",
    "J",
    "K",
    "L",
    "M",
    "N",
    "O",
    "P",
    "Q",
    "R",
    "S",
    "T",
    "U",
    "V",
    "W",
    "X",
    "Y",
    "Z",
    "SK",
    "BT",
    "HH",
    "KN",
    "AR",
    "BK",
    "UR",
    " ",
  ],
  ABBREVIATION: {
    "SK": "SK",
    "BT": "BT",
    "HH": "HH",
    "KN": "KN",
    "AR": "AR",
    "BK": "BK",
    "UR": "UR",
  },
};

export const NumToChar = Object.fromEntries(
  ENGLISH_CONFIG.VOCABULARY.map((char, i) => [i, char]),
);

export const FFT_LENGTH = 256;
export const FFT_SIZE = FFT_LENGTH;
export const HOP_LENGTH = 64;
export const SAMPLE_RATE = 3200;
export const AUDIO_CHUNK_SAMPLES = 2048;
export const DECODE_WINDOW_OPTIONS = [6, 12, 18, 30] as const;
export type DecodeWindowSeconds = (typeof DECODE_WINDOW_OPTIONS)[number];
export const DEFAULT_DECODE_WINDOW_S: DecodeWindowSeconds = 12;
export const getBufferSamples = (durationSeconds: number) =>
  durationSeconds * SAMPLE_RATE;

export const MIN_FREQ_HZ = 100;
export const MAX_FREQ_HZ = 1500;

export const DECODABLE_MIN_FREQ_HZ = 400;
export const DECODABLE_MAX_FREQ_HZ = 1200;
export const DEFAULT_DECODE_BANDWIDTH_HZ =
  DECODABLE_MAX_FREQ_HZ - DECODABLE_MIN_FREQ_HZ;

// Synthetic data generation defaults
export const SYNTHETIC_CONFIG = {
  WPM_RANGE: [8, 50] as [number, number],
  TONE_HZ_RANGE: [400, 1200] as [number, number],
  SNR_DB_RANGE: [-10, 40] as [number, number],
  DEFAULT_SAMPLE_RATE: 3200,
};

// ---------------------------------------------------------------------------
// Canonical Morse Code table: text character → morse string
// Single source of truth shared by encoder, decoder, and phrase library.
// ---------------------------------------------------------------------------
export const MORSE_CODE: Record<string, string> = {
  // Letters
  A: ".-",    B: "-...",  C: "-.-.",  D: "-..",   E: ".",
  F: "..-.",  G: "--.",   H: "....",  I: "..",    J: ".---",
  K: "-.-",   L: ".-..",  M: "--",   N: "-.",    O: "---",
  P: ".--.",  Q: "--.-",  R: ".-.",  S: "...",   T: "-",
  U: "..-",   V: "...-",  W: ".--",  X: "-..-",  Y: "-.--",
  Z: "--..",
  // Numbers
  0: "-----", 1: ".----", 2: "..---", 3: "...--", 4: "....-",
  5: ".....", 6: "-....", 7: "--...", 8: "---..", 9: "----.",
  // Punctuation
  "=": "-...-", "/": "-..-.", ".": ".-.-.-", ",": "--..--",
  "?": "..--..", "-": "-....-", "(": "-.--.", ")": "-.--.-",
  // Prosigns (by their standard representations)
  SK: "...-.-", SN: "...-.",  KN: "-.--.", AR: ".-.-",
  BK: "-...-.",  BT: "-...-",  CL: "-.-..-..", CT: "-.-.-",
  SOS: "...---...", ERR: "........",
};
