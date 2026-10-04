/**
 * Morse Code Decoder
 *
 * Converts dot/dash sequences to text using a trie-based approach.
 *
 * Morse->text table is derived at module load from the canonical MORSE_CODE
 * in const.ts, plus extra punctuation chars not covered by the encoder's
 * table (e.g. &, :, ;, @, etc.) so the decoder can handle any morse input.
 */
import { MORSE_CODE as TEXT_TO_MORSE } from "../const";

// Derive morse->text from canonical table
const MORSE_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(TEXT_TO_MORSE).map(([char, morse]) => [morse, char])
);

// Augment with extra punctuation chars the encoder doesn't use
const EXTRA_CHARS: Record<string, string> = {
  ".-...": "&",
  "---...": ":",
  "-.-.-.": ";",
  ".-.-.": "+",
  "..--.-": "_",
  ".-..-.": '"',
  "...-..-": "$",
  ".--.-.": "@",
  ".----.": "'",
  "-.-.--": "!",
};
for (const [morse, char] of Object.entries(EXTRA_CHARS)) {
  MORSE_CODE[morse] = char;
}

class MorseTrieNode {
  children: Map<string, MorseTrieNode> = new Map();
  isEndOfWord: boolean = false;
  character: string = "";
}

class MorseTrie {
  private root: MorseTrieNode = new MorseTrieNode();

  constructor() {
    for (const [morse, char] of Object.entries(MORSE_CODE)) {
      this.insert(morse, char);
    }
  }

  private insert(morse: string, char: string): void {
    let node = this.root;
    for (const symbol of morse) {
      if (!node.children.has(symbol)) {
        node.children.set(symbol, new MorseTrieNode());
      }
      node = node.children.get(symbol)!;
    }
    node.isEndOfWord = true;
    node.character = char;
  }

  findByPrefix(morse: string): { morse: string; char: string }[] {
    const results: { morse: string; char: string }[] = [];
    let node = this.root;

    for (const symbol of morse) {
      if (!node.children.has(symbol)) {
        return results;
      }
      node = node.children.get(symbol)!;
    }

    this.collectAllWords(node, morse, results);
    return results;
  }

  private collectAllWords(
    node: MorseTrieNode,
    current: string,
    results: { morse: string; char: string }[]
  ): void {
    if (node.isEndOfWord) {
      results.push({ morse: current, char: node.character });
    }
    for (const [symbol, child] of node.children) {
      this.collectAllWords(child, current + symbol, results);
    }
  }

  decode(morse: string): string | null {
    let node = this.root;
    for (const symbol of morse) {
      if (!node.children.has(symbol)) {
        return null;
      }
      node = node.children.get(symbol)!;
    }
    return node.isEndOfWord ? node.character : null;
  }
}

const morseTrie = new MorseTrie();

export interface DecodedCharacter {
  character: string;
  confidence: number;
  morseCode: string;
}

export interface DecodeState {
  currentMorse: string;
  decodedText: string;
  decodedChars: DecodedCharacter[];
  isActive: boolean;
  lastToneTime: number;
  lastToneDuration: number;
}

export class MorseDecoder {
  private sampleRate: number;
  /** dot 时长（采样点）：仅作分类/间隔的**初始与回退**参考，
   *  运行中以观测时长的自校准（dotReference）为准 */
  private dotDuration!: number;

  private morseBuffer: string = "";
  private decodedText: string = "";
  private decodedChars: DecodedCharacter[] = [];
  private lastOnTime: number = 0;
  private lastOffTime: number = 0;
  private lastToneDuration: number = 0;
  private isReceiving: boolean = false;
  private pendingSpace: boolean = false;
  private recentDurations: number[] = [];
  /** 最近观测到的音间隔（采样点），用于间隔自聚类 */
  private recentGaps: number[] = [];

  constructor(sampleRate: number, wpm: number = 20) {
    this.sampleRate = sampleRate;
    this.updateTiming(wpm);
  }

  /** 仅设置初始 dot 参考时长。运行中分类以观测时长自校准（见 dotReference） */
  updateTiming(wpm: number): void {
    const unitMs = 1200 / wpm;
    this.dotDuration = Math.round((this.sampleRate * unitMs) / 1000);
  }

  processTone(isOn: boolean, sampleIndex: number): string {
    const currentTime = sampleIndex;

    if (isOn) {
      this.lastOnTime = currentTime;
      this.isReceiving = true;

      if (this.pendingSpace) {
        // ⚠️ 结算缓冲前必须判定这个静默属于哪一级间隔。
        //    早先这里无条件 decodeCurrentMorse() —— 每个符号在
        //    下一个音开始时都被当成独立字符弹出，"-.-." 被拆成
        //    T/E/T/T（第六个致命 bug）。
        const silence = currentTime - this.lastOffTime;
        this.recordGap(silence);
        const level = this.classifyGap(silence);
        if (level === "char") {
          this.decodeCurrentMorse();
        } else if (level === "word") {
          this.decodeCurrentMorse();
          this.decodedText += " ";
        }
        this.pendingSpace = false;
      }
    } else {
      this.lastOffTime = currentTime;
      this.lastToneDuration = currentTime - this.lastOnTime;
      this.isReceiving = false;

      const symbol = this.classifyTone(this.lastToneDuration);
      this.morseBuffer += symbol;
      this.updateAdaptiveTiming(this.lastToneDuration);
      this.pendingSpace = true;
    }

    return this.decodedText;
  }

  private classifyTone(duration: number): string {
    // 阈值用自校准的 dotReference（而非初始 dotDuration）：
    // 初始 WPM 默认 20，实际 15/25 WPM 时硬编码阈值会系统性误判。
    const threshold = this.dotReference() * 1.5;
    return duration < threshold ? "." : "-";
  }

  /**
   * 当前「dot 参考时长」（采样点）。
   *
   * 自校准：若最近的音呈现明显双簇（点/划），取**短簇均值**为 dot 参考；
   * 只有一种簇时取中位数本身 —— 此时无法从时长判断它是点还是划，
   * 而「阈值 = 参考值 × 1.5」对两种情况都能正确工作且可自校正：
   *   全是 dot → 阈值略高于 dot，后续出现更短的 dot 仍判点；
   *   全是 dash → 阈值高于 dash，后续出现短得多的 dot 立即判点。
   *
   * ⚠️ 曾在这里加「若像 dash 就除以 3」的折算 —— 全 dot 流（15 WPM，
   *    实测 96ms > 初始 60ms×1.2）被误判成「全是 dash」，
   *    阈值变成 32ms，比 dot 还低，所有 dot 反转成 dash。
   */
  private dotReference(): number {
    if (this.recentDurations.length < 2) {
      return this.dotDuration;
    }
    const sorted = [...this.recentDurations].sort((a, b) => a - b);

    // 找最大间隙做二聚类
    let bestGap = 0;
    let splitIdx = -1;
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i] - sorted[i - 1];
      if (gap > bestGap) {
        bestGap = gap;
        splitIdx = i;
      }
    }

    const hasClusters = splitIdx !== -1 && bestGap >= sorted[splitIdx - 1] * 0.4;
    if (hasClusters && splitIdx >= 1) {
      // 短簇均值 = dot 参考（双簇时短簇必为 dot）
      const lower = sorted.slice(0, splitIdx);
      const mean = lower.reduce((a, b) => a + b, 0) / lower.length;
      return Math.round(mean);
    }

    // 单簇：中位数本身
    return sorted[Math.floor(sorted.length / 2)];
  }

  /**
   * 间隔自聚类：对最近观测到的静默时长做两级分界。
   *
   * Morse 的静默天然分三档（符号间 1u / 字符间 3u / 单词间 7u）。
   * 把最近的间隔排序后取**最大的两个间隙**的中点作为分界，
   * 阈值从数据自身来，不依赖任何绝对时长假设 —— 这与音长的
   * 点/划分类是同一个思路。
   *
   * @returns [字符间隔阈值, 单词间隔阈值]；样本不足返回 null
   */
  private gapThresholds(): [number, number] | null {
    if (this.recentGaps.length < 4) return null;
    const sorted = [...this.recentGaps].sort((a, b) => a - b);

    const gaps: { idx: number; gap: number }[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push({ idx: i, gap: sorted[i] - sorted[i - 1] });
    }
    gaps.sort((a, b) => b.gap - a.gap);
    const top = gaps.slice(0, 2).sort((a, b) => a.idx - b.idx);

    // 两个分界都必须显著。⚠️ 早年用 0.5×：符号间隔自身的测量抖动
    // （31ms vs 47ms，比值 0.66）也会被当成两档，导致符号间隙被判成
    // 字符间隔、字符被拦腰切开。真实档位差是 3 倍（1u/3u/7u），
    // 用 0.8× 可以干净区分「档位差」与「抖动」。
    if (top.length < 2) return null;
    for (const t of top) {
      if (t.gap < sorted[t.idx - 1] * 0.8) return null;
    }

    return [
      Math.round((sorted[top[0].idx - 1] + sorted[top[0].idx]) / 2),
      Math.round((sorted[top[1].idx - 1] + sorted[top[1].idx]) / 2),
    ];
  }

  /** 记录一个观测到的音间隔 */
  private recordGap(silence: number): void {
    this.recentGaps.push(silence);
    if (this.recentGaps.length > 12) {
      this.recentGaps.shift();
    }
  }

  /**
   * 判定一个静默的级别。
   * 优先用间隔自聚类；数据不足时回退到 dot 参考的比例阈值。
   */
  private classifyGap(silence: number): "symbol" | "char" | "word" {
    const t = this.gapThresholds();
    if (t) {
      const [charT, wordT] = t;
      if (silence >= wordT) return "word";
      if (silence >= charT) return "char";
      return "symbol";
    }
    // 回退：1.8×dotRef ≈ 字符间隔，4×dotRef ≈ 单词间隔
    const dotRef = this.dotReference();
    if (silence >= dotRef * 4) return "word";
    if (silence >= dotRef * 1.8) return "char";
    return "symbol";
  }

  private updateAdaptiveTiming(duration: number): void {
    this.recentDurations.push(duration);
    if (this.recentDurations.length > 10) {
      this.recentDurations.shift();
    }
  }

  // （点/划阈值已并入 classifyTone，基于 dotReference() 自校准。

  checkForSpace(sampleIndex: number): void {
    if (!this.pendingSpace) return;

    const silenceDuration = sampleIndex - this.lastOffTime;
    // ⚠️ 静默进行中就用同一套间隔自聚类判定级别，
    //    不依赖外部 WPM 回灌的固定阈值。
    const level = this.classifyGap(silenceDuration);
    if (level === "word") {
      this.decodeCurrentMorse();
      this.decodedText += " ";
      this.pendingSpace = false;
    } else if (level === "char") {
      this.decodeCurrentMorse();
      this.pendingSpace = false;
    }
  }

  private decodeCurrentMorse(): void {
    if (this.morseBuffer.length === 0) return;

    const result = morseTrie.decode(this.morseBuffer);
    if (result) {
      this.decodedText += result;
      this.decodedChars.push({
        character: result,
        confidence: 1.0,
        morseCode: this.morseBuffer,
      });
    }

    this.morseBuffer = "";
  }

  flush(): string {
    this.decodeCurrentMorse();
    return this.decodedText;
  }

  getText(): string {
    return this.decodedText;
  }

  getDecodedChars(): DecodedCharacter[] {
    return this.decodedChars;
  }

  reset(): void {
    this.morseBuffer = "";
    this.decodedText = "";
    this.decodedChars = [];
    this.lastOnTime = 0;
    this.lastOffTime = 0;
    this.lastToneDuration = 0;
    this.isReceiving = false;
    this.pendingSpace = false;
    this.recentDurations = [];
    this.recentGaps = [];
  }

  getState(): DecodeState {
    return {
      currentMorse: this.morseBuffer,
      decodedText: this.decodedText,
      decodedChars: [...this.decodedChars],
      isActive: this.isReceiving,
      lastToneTime: this.lastOnTime,
      lastToneDuration: this.lastToneDuration,
    };
  }

  get wpm(): number {
    return Math.round(1200 / (this.dotDuration / this.sampleRate * 1000));
  }
}

export function decodeMorse(morse: string): string {
  const words = morse.trim().split("       ");
  return words
    .map((word) =>
      word
        .split("   ")
        .map((char) => morseTrie.decode(char) || "?")
        .join("")
    )
    .join(" ");
}
