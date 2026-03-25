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
