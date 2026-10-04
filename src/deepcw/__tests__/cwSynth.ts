/**
 * 两个关键问题的实测验证
 *
 * Q1: E / T 这类单字符能否借助上下文（Q 简语、常用组合）识别？
 * Q2: 人工发报间距不标准时，DeepCW 还稳不稳？
 */
import { audioToDeepCWSpectrogram } from "../spectrogram.ts";
import {
  DEEPCW_SAMPLE_RATE,
  DEEPCW_HOP_LENGTH,
  DEEPCW_FFT_LENGTH,
} from "../config.ts";
import * as fs from "node:fs";

// 完整国际 Morse 表
export const MORSE_TABLE: Record<string, string> = {
  A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.",
  H: "....", I: "..", J: ".---", K: "-.-", L: ".-..", M: "--", N: "-.",
  O: "---", P: ".--.", Q: "--.-", R: ".-.", S: "...", T: "-", U: "..-",
  V: "...-", W: ".--", X: "-..-", Y: "-.--", Z: "--..",
  "0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-",
  "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----.",
};

export interface TimingProfile {
  /** dot 时长单位（秒） */
  unit: number;
  /** dash 相对 dot 的长度倍数 */
  dashRatio: number;
  /** 符号间隔倍数（相对 unit） */
  symbolGap: number;
  /** 字符间隔倍数 */
  charGap: number;
  /** 单词间隔倍数 */
  wordGap: number;
}

/** 标准机器发报：完美等时 */
export const MACHINE_TIMING: TimingProfile = {
  unit: 0.06,
  dashRatio: 3,
  symbolGap: 1,
  charGap: 3,
  wordGap: 7,
};

export interface SynthOptions {
  wpm?: number;
  toneHz?: number;
  fs?: number;
  timing?: TimingProfile;
  /** 随机抖动强度，0 = 无抖动，1 = 强抖动 */
  jitter?: number;
  seed?: number;
  /** 采样级噪声 SNR(dB)，undefined = 无噪声 */
  snrDb?: number;
  /** 人为加入的频率漂移 Hz */
  driftHz?: number;
}

/** 可复现的伪随机数（mulberry32） */
function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 合成 CW 音频，支持手工发报的不规则特性：
 * - 每个元素时长独立抖动
 * - dash:dot 比例漂移
 * - 各层间距独立抖动
 * - 频率漂移
 * - 噪声
 */
export function synthCW(text: string, opts: SynthOptions = {}): Float32Array {
  const {
    wpm = 20,
    toneHz = 700,
    fs = DEEPCW_SAMPLE_RATE,
    timing = MACHINE_TIMING,
    jitter = 0,
    seed = 42,
    snrDb,
    driftHz = 0,
  } = opts;

  const rng = makeRng(seed);
  const baseUnit = 1.2 / wpm;
  const samples: number[] = [];

  // 抖动后的 unit
  const jit = (scale: number) =>
    jitter > 0 ? 1 + (rng() * 2 - 1) * jitter * scale : 1;

  // 每个字符开始时决定该字符的 dash 比例漂移
  // 手工发报者常有稳定的个人习惯，不完全随机
  let charDashRatio = timing.dashRatio;

  for (const ch of text.toUpperCase()) {
    if (ch === " ") {
      // ⚠️ 词间隔是 7u **总量**，不是「在字间隔之外再加 7u」。
      //
      // 每个字符尾部已经加过 charGap(3u)，所以空格处只应再补
      // (wordGap - charGap) = 4u，否则会多算 3u/处。
      //
      // 这个 bug 曾让 countUnits 与实际音频产生 1.42 倍的比值，
      // 害得WPM 估计器里被塞进一个「经验补偿系数 1.4」来掩盖。
      // 修正后该系数归1.0，偏差从 40% 降到 0-4%。
      const g = Math.floor(
        fs * baseUnit * (timing.wordGap - timing.charGap) * jit(0.4),
      );
      for (let i = 0; i < g; i++) samples.push(0);
      continue;
    }

    const code = MORSE_TABLE[ch];
    if (!code) continue;

    // 字符级 dash 比例漂移：±12%，模拟不同人的手法
    charDashRatio = timing.dashRatio * (1 + (rng() * 2 - 1) * jitter * 0.35);

    for (let s = 0; s < code.length; s++) {
      const sym = code[s];
      const isDash = sym === "-";
      const lenUnits = isDash ? charDashRatio : 1;
      const n = Math.max(
        8,
        Math.floor(fs * baseUnit * lenUnits * jit(isDash ? 0.3 : 0.35)),
      );

      // 该元素的频率（漂移在元素间平滑变化）
      const f = toneHz + driftHz * (rng() * 2 - 1) * 0.5;

      for (let i = 0; i < n; i++) {
        // 淡入淡出，模拟真实发射机的包络，避免边沿 harsh
        const env = Math.min(1, Math.min(i, n - 1) / (fs * 0.002));
        samples.push(0.5 * env * Math.sin((2 * Math.PI * f * i) / fs));
      }

      if (s < code.length - 1) {
        const g = Math.max(
          4,
          Math.floor(fs * baseUnit * timing.symbolGap * jit(0.45)),
        );
        for (let i = 0; i < g; i++) samples.push(0);
      }
    }

    const cg = Math.max(
      6,
      Math.floor(fs * baseUnit * timing.charGap * jit(0.35)),
    );
    for (let i = 0; i < cg; i++) samples.push(0);
  }

  let audio = new Float32Array(samples);

  // 加噪
  if (snrDb !== undefined) {
    let power = 0;
    for (let i = 0; i < audio.length; i++) power += audio[i] * audio[i];
    power /= audio.length;
    const noisePower = power / Math.pow(10, snrDb / 10);
    const sigma = Math.sqrt(noisePower);
    for (let i = 0; i < audio.length; i++) {
      // Box-Muller 产生高斯噪声
      const u1 = Math.max(1e-10, rng());
      const u2 = rng();
      const n = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      audio[i] += n * sigma;
    }
  }

  return audio;
}

/** 导出为 Python 可读的 manifest */
export function exportCases(cases: { name: string; text: string; opts: SynthOptions }[], outDir: string) {
  fs.mkdirSync(outDir, { recursive: true });
  const manifest = cases.map((c, idx) => {
    const audio = synthCW(c.text, c.opts);
    const spec = audioToDeepCWSpectrogram(audio);
    const base = `${outDir}/case_${String(idx).padStart(2, "0")}`;
    fs.writeFileSync(`${base}.f32`, Buffer.from(audio.buffer));
    if (spec) {
      fs.writeFileSync(`${base}.spec.f32`, Buffer.from(spec.data.buffer));
    }
    return {
      index: idx,
      name: c.name,
      text: c.text,
      audioLength: audio.length,
      durationSec: audio.length / DEEPCW_SAMPLE_RATE,
      timeSteps: spec?.timeSteps ?? 0,
      dims: spec?.dims ?? null,
      opts: c.opts,
    };
  });
  fs.writeFileSync(`${outDir}/manifest.json`, JSON.stringify(manifest, null, 2));
  return manifest;
}

export { DEEPCW_SAMPLE_RATE, DEEPCW_HOP_LENGTH, DEEPCW_FFT_LENGTH };
