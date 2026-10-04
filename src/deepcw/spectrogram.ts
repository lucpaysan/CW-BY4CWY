/**
 * DeepCW 频谱预处理
 *
 * 严格复刻 e04/deepcw-engine 的参考实现（examples/python 与 examples/nodejs）：
 *
 *   1. 前后镜像填充 (pad = fft_length / 2)，reflect 模式
 *   2. 分帧，帧长 256，帧移 48
 *   3. Hann 窗（周期式定义，与 numpy.hanning 的对称式不同，见下）
 *   4. 只对目标频带做 DFT（bin 32..97），不计算完整 FFT
 *   5. 取幅度后 log1p 归一化
 *
 * 输出布局：[batch=1, channel=1, time, freq=65]
 *
 * 关键细节：Python 参考实现里用的是
 *     window[i] = 0.5 - 0.5 * cos(2*pi*i / fft_length)
 * 注意分母是 fft_length 而不是 (fft_length - 1)。
 * 仓库自带的 stft.ts 用的是 (fftSize - 1)（numpy.hanning 风格），
 * 两者相差约 0.4%，会累积成可测的偏差，所以这里独立实现以保证一致。
 */
import { FFT } from "../stft";
import {
  DEEPCW_FFT_LENGTH,
  DEEPCW_HOP_LENGTH,
  DEEPCW_SAMPLE_RATE,
  DEEPCW_FREQ_BINS,
  DEEPCW_START_BIN,
  DEEPCW_STOP_BIN,
} from "./config";

const fft = new FFT(DEEPCW_FFT_LENGTH);

/** 周期式 Hann 窗，分母为 fft_length（与 Python 参考实现一致）*/
function buildPeriodicHann(size: number): Float32Array {
  const window = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size);
  }
  return window;
}

const HANN_WINDOW = buildPeriodicHann(DEEPCW_FFT_LENGTH);

/**
 * 前后镜像填充，与 numpy.pad(a, (pad,pad), mode="reflect") 一致。
 *
 * numpy 的 reflect 模式不重复边界元素，即索引 -1 取 a[1]、-2 取 a[2]，
 * 因此音频长度必须 > pad。这里同时处理极短音频的退化情况，避免越界读到
 * undefined 产生 NaN。
 */
function padReflect(audio: Float32Array, pad: number): Float32Array {
  if (pad <= 0) return audio;

  const n = audio.length;
  const out = new Float32Array(n + pad * 2);

  // 左侧：a[pad-1], a[pad-2], ...，越界则夹到有效区间
  for (let i = 0; i < pad; i++) {
    const idx = pad - i;
    out[i] = n > 1 ? audio[Math.min(idx, n - 1)] : audio[0];
  }

  out.set(audio, pad);

  // 右侧：a[n-2], a[n-3], ...，同上
  for (let i = 0; i < pad; i++) {
    const idx = n - 2 - i;
    const safe = idx >= 0 ? idx : 0;
    out[pad + n + i] = n > 1 ? audio[Math.max(0, Math.min(safe, n - 1))] : audio[0];
  }

  return out;
}

export interface SpectrogramResult {
  data: Float32Array;
  /** [1, 1, timeSteps, freqBins] */
  dims: [number, number, number, number];
  timeSteps: number;
}

/**
 * 把音频转换为 DeepCW 模型所需的频谱张量。
 *
 * @param audio 单声道 PCM，采样率必须为 3200Hz
 * @returns null 表示音频太短，无法产生至少一帧
 */
export function audioToDeepCWSpectrogram(
  audio: Float32Array,
): SpectrogramResult | null {
  if (audio.length < DEEPCW_FFT_LENGTH) {
    return null;
  }

  const pad = Math.floor(DEEPCW_FFT_LENGTH / 2);
  const padded = padReflect(audio, pad);

  const timeSteps = 1 + Math.floor((padded.length - DEEPCW_FFT_LENGTH) / DEEPCW_HOP_LENGTH);
  if (timeSteps <= 0) {
    return null;
  }

  const data = new Float32Array(timeSteps * DEEPCW_FREQ_BINS);
  const frame = new Float32Array(DEEPCW_FFT_LENGTH);
  // 注意：FFT.transform 内部会做位反转交换，会原地修改传入的缓冲区。
  // 因此每帧都必须传入全新的（或已重置为纯实数信号的）缓冲区，
  // 复用同一个 buffer 会让上一帧的输出污染下一帧，约37 帧后溢出成 NaN。
  const complexFrame = new Float32Array(DEEPCW_FFT_LENGTH * 2);

  for (let t = 0; t < timeSteps; t++) {
    const start = t * DEEPCW_HOP_LENGTH;

    // 重置为纯实数信号（imag 清零，real 写入加窗后的样本）
    for (let i = 0; i < DEEPCW_FFT_LENGTH; i++) {
      frame[i] = padded[start + i] * HANN_WINDOW[i];
      complexFrame[i * 2] = frame[i];
      complexFrame[i * 2 + 1] = 0;
    }

    fft.transform(complexFrame);

    // 只提取目标频带，做 log1p
    const offset = t * DEEPCW_FREQ_BINS;
    for (let bin = DEEPCW_START_BIN; bin < DEEPCW_STOP_BIN; bin++) {
      const real = complexFrame[bin * 2];
      const imag = complexFrame[bin * 2 + 1];
      const magnitude = Math.sqrt(real * real + imag * imag);
      data[offset + bin - DEEPCW_START_BIN] = Math.log1p(magnitude);
    }
  }

  return {
    data,
    dims: [1, 1, timeSteps, DEEPCW_FREQ_BINS],
    timeSteps,
  };
}

/** 采样率校验：DeepCW 只在 3200Hz 下训练过，其他采样率需先重采样 */
export function isSupportedSampleRate(sampleRate: number): boolean {
  return sampleRate === DEEPCW_SAMPLE_RATE;
}

/**
 * 简单重采样（线性插值）。
 * DeepCW 只接受 3200Hz，若采集设备给的是 48kHz/44.1kHz 需先转换。
 */
export function resampleToTarget(
  audio: Float32Array,
  sourceRate: number,
  targetRate: number = DEEPCW_SAMPLE_RATE,
): Float32Array {
  if (sourceRate === targetRate) {
    return audio;
  }

  const targetLength = Math.round((audio.length * targetRate) / sourceRate);
  const out = new Float32Array(targetLength);
  const ratio = sourceRate / targetRate;

  for (let i = 0; i < targetLength; i++) {
    const pos = i * ratio;
    const left = Math.floor(pos);
    const right = Math.min(left + 1, audio.length - 1);
    const frac = pos - left;
    out[i] = audio[left] * (1 - frac) + audio[right] * frac;
  }

  return out;
}
