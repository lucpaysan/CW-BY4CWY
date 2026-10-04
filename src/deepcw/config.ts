/**
 * DeepCW 模型配置
 *
 * 数值全部来自 e04/deepcw-engine 的 model.onnx.json，保持严格一致：
 *   sample_rate 3200 / fft_length 256 / hop_length 48
 *   频带 400-1200 Hz → bin 32..96（65 bins）
 *   归一化 log1p，输入布局 [batch, 1, time, 65]
 *
 * 这些参数与旧模型（hop 64/ 宽频带）不同，不可混用。
 * 见public/model_deepcw.json
 */

export const DEEPCW_MODEL_FILE = "model_deepcw.onnx";
export const DEEPCW_METADATA_FILE = "model_deepcw.json";

/** 模型输入名与输出名（ONNX 图中的实际签名）*/
export const DEEPCW_INPUT_NAME = "spectrogram";
export const DEEPCW_OUTPUT_NAME = "log_probs";

export const DEEPCW_SAMPLE_RATE = 3200;
export const DEEPCW_FFT_LENGTH = 256;
export const DEEPCW_HOP_LENGTH = 48;
export const DEEPCW_MIN_FREQ_HZ = 400;
export const DEEPCW_MAX_FREQ_HZ = 1200;
export const DEEPCW_FREQ_BINS = 65;

/**
 * 频带对应的 FFT bin 区间。
 * bin 宽度 = sample_rate / fft_length = 12.5 Hz
 *   start = ceil(400 / 12.5) = 32
 *   stop  = floor(1200 / 12.5) + 1 = 97
 * 97 - 32 = 65，与模型期望的 bins 一致。
 */
const BIN_WIDTH_HZ = DEEPCW_SAMPLE_RATE / DEEPCW_FFT_LENGTH; // 12.5
export const DEEPCW_START_BIN = Math.ceil(DEEPCW_MIN_FREQ_HZ / BIN_WIDTH_HZ); // 32
export const DEEPCW_STOP_BIN =
  Math.floor(DEEPCW_MAX_FREQ_HZ / BIN_WIDTH_HZ) + 1; // 97

/** 深度学习解码引擎的词表（42 类，顺序即模型输出索引 0..41）*/
export const DEEPCW_VOCABULARY = [
  ",",
  ".",
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
  " ",
] as const;

/** CTC 空白符索引（词表最后一个，共 42 类）*/
export const DEEPCW_BLANK_INDEX = 41;

/** ONNX 输出张量形状：[batch, time, num_classes] */
export const DEEPCW_OUTPUT_CLASSES = 42;

/**
 * 音频长度限制。
 *
 * deepcw-engine 参考实现要求 5–20 秒。本地实测（2026-10-04，16 个用例）：
 *   - ≥2.4 秒：CER 0%（SOS 2.4s / 73 1.5s / TU OM 73 4.7s 等全部正确）
 *   - <0.5 秒：不可靠（单字符 E、T 会被漏掉或误判为 E）
 *
 * 因此本项目采用「滚动窗口」工作方式：始终用 6s 以上的窗口送入模型，
 * 单个字符无法可靠识别是预期行为，通联场景也不需要单字母解码。
 */
export const DEEPCW_MIN_RELIABLE_SECONDS = 2;
export const DEEPCW_MAX_SECONDS = 20;

/** 建议的解码窗口（秒），需>= MIN_RELIABLE_SECONDS*/
export const DEEPCW_WINDOW_OPTIONS = [6, 12, 18, 30] as const;
export type DeepCWWindowSeconds = (typeof DEEPCW_WINDOW_OPTIONS)[number];

/** 系统可识别的解码引擎 */
export type DecoderEngineId = "deepcw" | "legacy";
