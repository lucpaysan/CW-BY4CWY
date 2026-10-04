/**
 * ggMorse-style CW/Morse Code Decoder
 *
 * Pure TypeScript implementation of real-time morse code decoder
 * using Goertzel algorithm for pitch detection.
 */

import { GoertzelFilter } from "./goertzel";
import { MorseDecoder } from "./morseDecoder";
import { SAMPLE_RATE, DECODABLE_MIN_FREQ_HZ, DECODABLE_MAX_FREQ_HZ } from "../const";

export interface GGMorseConfig {
  sampleRate?: number;
  minFrequency?: number;
  maxFrequency?: number;
  minWpm?: number;
  maxWpm?: number;
  noiseThreshold?: number;
  toneOnThreshold?: number;
}

export interface GGMorseResult {
  text: string;
  isActive: boolean;
  frequency: number | null;
  magnitude: number;
  confidence: number;
  morseBuffer: string;
  wpm: number;
}

const DEFAULT_CONFIG = {
  sampleRate: SAMPLE_RATE,
  minFrequency: DECODABLE_MIN_FREQ_HZ,
  maxFrequency: DECODABLE_MAX_FREQ_HZ,
  minWpm: 5,
  maxWpm: 55,
  noiseThreshold: 0.01,
  toneOnThreshold: 500,
};

/** 监测信道中心频率（Goertzel 单频检测的目标） */
function centerFrequency(minHz: number, maxHz: number): number {
  return Math.round((minHz + maxHz) / 2);
}

export class GGMorse {
  private config: Required<GGMorseConfig>;
  private goertzelFilter: GoertzelFilter;
  private morseDecoder: MorseDecoder;
  private currentFrequency: number | null = null;
  private currentMagnitude: number = 0;
  private isToneActive: boolean = false;
  private toneOnsetSample: number = 0;
  private sampleCount: number = 0;
  private recentFrequencies: number[] = [];
  private recentToneDurations: number[] = [];
  private wpmEstimate: number = 20;
  private decodedText: string = "";
  private onTextCallback?: (text: string) => void;
  private onToneCallback?: (isOn: boolean, frequency: number | null) => void;

  constructor(config: GGMorseConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    const centerFreq = centerFrequency(this.config.minFrequency, this.config.maxFrequency);
    // 分析窗 ≈ 15.6ms（fs/64）。
    // ⚠️ 早先用 fs/10 = 100ms：20 WPM 的 dot 只有 60ms，被量化膨胀
    //    成 1.5~3 倍（实测 94ms），点/划阈值与间隔判定全部失真。
    //    15.6ms 分辨率下 dot 膨胀 ≤1.3×，间隔判定可用。
    const windowSize = Math.round(this.config.sampleRate / 64);

    this.goertzelFilter = new GoertzelFilter({
      sampleRate: this.config.sampleRate,
      targetFreq: centerFreq,
      windowSize,
    });

    this.morseDecoder = new MorseDecoder(this.config.sampleRate, this.wpmEstimate);
  }

  onText(callback: (text: string) => void): void {
    this.onTextCallback = callback;
  }

  onTone(callback: (isOn: boolean, frequency: number | null) => void): void {
    this.onToneCallback = callback;
  }

  processSamples(samples: Float32Array): void {
    // Process each sample through the Goertzel filter
    for (let i = 0; i < samples.length; i++) {
      this.goertzelFilter.processSample(samples[i]);
      this.sampleCount++;

      // ⚠️ 窗口一完成就处理，不要等「到达本批最后一个采样点」。
      //
      // 早先写成 `isWindowComplete() && i === samples.length - 1`：
      // 以 2048 采样/批、窗口 320 采样为例，窗口在第 319/639/959/…
      // 个采样完成，全都对不上 2047 —— **processWindow 永远不触发**，
      // 这是 DSP 模式解不出任何字符的第一根因。
      if (this.goertzelFilter.isWindowComplete()) {
        this.processWindow();
      }
    }
  }

  private processWindow(): void {
    const result = this.goertzelFilter.getResult(this.config.noiseThreshold);
    this.currentMagnitude = result.magnitude;

    if (result.isDetected && !this.isToneActive) {
      this.isToneActive = true;
      this.toneOnsetSample = this.sampleCount - this.goertzelFilter.currentSampleCount;
      // 上报的频率 = 当前监测信道（min/max 的几何中心）。
      // 早先该字段从未被赋值，结果里永远是 null。
      this.currentFrequency = centerFrequency(
        this.config.minFrequency,
        this.config.maxFrequency,
      );
      this.morseDecoder.processTone(true, this.sampleCount);

      if (this.onToneCallback) {
        this.onToneCallback(true, this.currentFrequency);
      }
    } else if (!result.isDetected && this.isToneActive) {
      const toneDuration = this.sampleCount - this.toneOnsetSample;
      this.morseDecoder.processTone(false, this.sampleCount);
      this.isToneActive = false;
      this.updateWpmEstimate(toneDuration);

      if (this.onToneCallback) {
        this.onToneCallback(false, null);
      }
    } else if (this.isToneActive) {
      if (this.onToneCallback) {
        this.onToneCallback(true, this.currentFrequency);
      }
    }

    if (!this.isToneActive) {
      this.morseDecoder.checkForSpace(this.sampleCount);
      const currentText = this.morseDecoder.getText();
      if (currentText !== this.decodedText) {
        this.decodedText = currentText;
        if (this.onTextCallback) {
          this.onTextCallback(currentText);
        }
      }
    }

    this.goertzelFilter.reset();
  }

  private updateWpmEstimate(toneDuration: number): void {
    // 用「最近若干个音里最短的」近似 dot 时长反推 WPM。
    //
    // ⚠️ 早先假设每个刚结束的音都是 dot（WPM = 1200/unitMs）：
    //    对 dash 会低估 3 倍，导致解码时序跟着漂移。
    //    取最短值对「至少出现过一次 dot」的流是稳定的；
    //    20ms 下限防止瞬时毛刺把 WPM 拉爆。
    this.recentToneDurations.push(toneDuration);
    if (this.recentToneDurations.length > 8) {
      this.recentToneDurations.shift();
    }

    const shortest = Math.min(...this.recentToneDurations);
    const floorSamples = Math.round(this.config.sampleRate * 0.02);
    const unitMs = (Math.max(shortest, floorSamples) / this.config.sampleRate) * 1000;

    if (unitMs > 0) {
      const estimatedWpm = Math.round(1200 / unitMs);
      this.wpmEstimate = Math.max(
        this.config.minWpm,
        Math.min(this.config.maxWpm, estimatedWpm)
      );
      // ⚠️ 不要把 WPM 回灌给 morseDecoder（updateTiming）：
      //    反馈回路曾在「首个音是 dash」时把 WPM 低估 3 倍，
      //    污染后续所有分类。解码器现已基于观测时长自校准。
    }
  }

  getResult(): GGMorseResult {
    return {
      text: this.decodedText,
      isActive: this.isToneActive,
      frequency: this.currentFrequency,
      magnitude: this.currentMagnitude,
      confidence: this.recentFrequencies.length > 0 ? 0.8 : 0,
      morseBuffer: this.morseDecoder.getState().currentMorse,
      wpm: this.wpmEstimate,
    };
  }

  flush(): string {
    const text = this.morseDecoder.flush();
    this.decodedText = text;
    return text;
  }

  reset(): void {
    this.goertzelFilter.reset();
    this.morseDecoder.reset();
    this.currentFrequency = null;
    this.currentMagnitude = 0;
    this.isToneActive = false;
    this.toneOnsetSample = 0;
    this.sampleCount = 0;
    this.recentFrequencies = [];
    this.recentToneDurations = [];
    this.decodedText = "";
  }

  get wpm(): number {
    return this.wpmEstimate;
  }

  setWpm(wpm: number): void {
    this.wpmEstimate = Math.max(this.config.minWpm, Math.min(this.config.maxWpm, wpm));
    this.morseDecoder.updateTiming(this.wpmEstimate);
  }
}
