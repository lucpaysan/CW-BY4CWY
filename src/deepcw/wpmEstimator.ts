/**
 * WPM 实时估计
 *
 * ## 为什么需要
 *
 * 实测发现 DeepCW 在两个速度区间会失效：
 *   - 5–6 wpm：CER 40–50%
 *   - 50 wpm：CER 80%
 *   - 安全区间：8–45 wpm（见 __tests__/README.md）
 *
 * 社团场景下如果对方发报速度超出安全区间，
 * 软件应该**主动提示**，而不是默默输出乱码——
 * 否则学生会误以为是自己操作有问题。
 *
 * ## 原理
 *
 * 摩尔斯码的标准定义：1 个 dot 的时长 = 1.2 / WPM 秒。
 *
 * 反推 WPM 必须**数码元**，而不是数字符：
 *
 *   总时长 = 总码元数 × 1.2 / WPM
 *   =>  WPM = 1.2 × 总码元数 / 总时长
 *
 * 举例 "CQ DE BY4CWY"（20 WPM）：
 *   码元 = C(4)+Q(4)+D(3)+E(1)+B(4)+Y(4)+4(5)+W(3)+Y(4) = 32
 *   字符间隔 9×3 = 27，单词间隔额外 2 处 ×4 = 8
 *   总计约 67 码元 → 67 × 0.06 = 4.0 秒
 *
 * ⚠️ 踩过的坑：早先误用「字符数 × 3.6」估算码元，
 * 结果全部算出 0~2 WPM。分子必须来自真实的 Morse 码表。
 */

/** 国际 Morse 码表（用于统计码元数）*/
const MORSE_UNITS: Record<string, string> = {
  A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.",
  G: "--.", H: "....", I: "..", J: ".---", K: "-.-", L: ".-..",
  M: "--", N: "-.", O: "---", P: ".--.", Q: "--.-", R: ".-.",
  S: "...", T: "-", U: "..-", V: "...-", W: ".--", X: "-..-",
  Y: "-.--", Z: "--..",
  "0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-",
  "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----.",
};

/** 字符间隔 = 3 码元，单词间隔 = 7 码元 */
const CHAR_GAP_UNITS = 3;
const WORD_GAP_UNITS = 7;

/**
 * 统计一段文本的总码元数（含全部间隔）。
 *
 * 时序构成（标准 Morse）：
 *   字符内部 = 码元数 + (码元数-1) × 符号间隔(1)
 *   字符之间 = 字符间隔(3)
 *   单词之间 = 单词间隔(7)
 *
 * ⚠️ 早先的实现只累加了「码元数 + 字符间隔」，漏掉了字符内部的符号间隔，
 * 结果所有估计值偏小近一半（20 WPM 被算成 10）。这个函数务必用
 * cwSynth 合成真实音频来验证，不要只看单字符的算术。
 *
 * @param text 解码得到的文本
 * @returns 码元总数；无法识别任何字符时返回 0
 */
export function countUnits(text: string): number {
  let total = 0;
  let hasPrevChar = false;

  for (const raw of text) {
    const ch = raw.toUpperCase();

    if (ch === " ") {
      // 上一字符的 count 里已含3 unit 字符间隔，
      // 空格需把它补足到标准的 7 unit 单词间隔，故补 4。
      if (hasPrevChar) {
        total += WORD_GAP_UNITS - CHAR_GAP_UNITS;
        hasPrevChar = false;
      }
      continue;
    }

    if (ch === "/") {
      // 斜杠在 CW 中是 KK 分隔，等价于单词间隔
      if (hasPrevChar) total += WORD_GAP_UNITS - CHAR_GAP_UNITS;
      hasPrevChar = false;
      continue;
    }

    const code = MORSE_UNITS[ch];
    if (code) {
      // 码元时长 + 内部符号间隔 + 字符间隔
      total += code.length + (code.length - 1) + CHAR_GAP_UNITS;
      hasPrevChar = true;
      continue;
    }

    // 常见标点：按 4 码元估算（含内部间隔）
    if (/[.,?!\-=()]/.test(ch)) {
      total += 4 + 3 + CHAR_GAP_UNITS;
      hasPrevChar = true;
    }
  }

  return total;
}

/**
 * 尾部与静音补偿系数。
 *
 * 真实 CW 录音的时长往往包含解码文本之外的静音：
 *   - 报文结尾的操作员收键延迟
 *   - 词与词之间被 CTC 合并/省略的部分
 *   - 首尾的镜像填充影响
 *
 * 实测（cwSynth 合成音频 vs countUnits 统计）比值稳定在 1.33–1.48，
 * 均值约 1.4，故用此系数校正。
 *
 * ⚠️ 这个系数是经验值，只影响 WPM 估计的精度（±15%），
 * 而判断「是否超出 8–45 安全区间」是区间级的判断，不受影响。
 */
const SILENCE_COMPENSATION = 1.4;

/** 实测得出的安全区间 */
export const WPM_SAFE_MIN = 8;
export const WPM_SAFE_MAX = 45;

/** 典型通联速度 */
export const WPM_TYPICAL_MIN = 12;
export const WPM_TYPICAL_MAX = 25;

export interface WpmEstimate {
  /** 估计的 WPM；样本不足时为 null */
  wpm: number | null;
  /** 置信度 0~1（码元样本越多越高）*/
  confidence: number;
  /** 累计的码元数 */
  units: number;
  /** 是否超出安全区间（会明显失真）*/
  outOfRange: boolean;
  /** 是否偏离常规通联速度（仅提示）*/
  unusual: boolean;
  /** 给用户的提示；同一提示不重复触发 */
  advice: string | null;
}

export interface WpmConfig {
  /** 送入模型的窗口时长（秒），仅用于默认 delta */
  windowSeconds: number;
}

/**
 * 滑动窗口 WPM 估计器。
 *
 * 每次解码后调用 update(text, deltaSeconds)，累积码元与时间。
 */
export class WpmEstimator {
  private windowSeconds: number;
  private units = 0;
  private elapsed = 0;
  /** 上一次的提示状态："too-slow" | "too-fast" | null */
  private lastAdvice: "too-slow" | "too-fast" | null = null;

  constructor(config: WpmConfig) {
    this.windowSeconds = config.windowSeconds;
  }

  /**
   * 记录一次解码结果。
   *
   * @param text 本次解码文本
   * @param deltaSeconds 这段文本对应的实际音频时长。
   *        - 若每次都处理完整窗口，传 windowSeconds
   *        - 若为增量处理，传本次新增的音频时长（更准）
   */
  update(text: string, deltaSeconds?: number): WpmEstimate {
    const u = countUnits(text);
    const dt = deltaSeconds ?? this.windowSeconds;

    if (u > 0 && dt > 0) {
      this.units += u;
      this.elapsed += dt;
    }

    return this.getEstimate();
  }

  getEstimate(): WpmEstimate {
    // 至少需要 40 码元才给结论（约 3-4 个字符）
    if (this.units < 40 || this.elapsed <= 0) {
      return {
        wpm: null,
        confidence: 0,
        units: this.units,
        outOfRange: false,
        unusual: false,
        advice: null,
      };
    }

    const wpm = (1.2 * this.units * SILENCE_COMPENSATION) / this.elapsed;

    // 码元越多越可信，120 码元（约 6-8 字符）视为可靠
    const confidence = Math.min(1, this.units / 120);

    const outOfRange = wpm < WPM_SAFE_MIN || wpm > WPM_SAFE_MAX;
    const unusual = wpm < WPM_TYPICAL_MIN || wpm > WPM_TYPICAL_MAX;

    let advice: string | null = null;
    if (outOfRange) {
      const bound = wpm < WPM_SAFE_MIN ? `低于下限 ${WPM_SAFE_MIN}` : `超过上限 ${WPM_SAFE_MAX}`;
      advice = `对方速度约 ${wpm.toFixed(0)} WPM，${bound}，解码可能严重失真`;
    } else if (unusual) {
      advice =
        wpm < WPM_TYPICAL_MIN
          ? `对方速度约 ${wpm.toFixed(0)} WPM（偏慢，常规 ${WPM_TYPICAL_MIN}-${WPM_TYPICAL_MAX}）`
          : `对方速度约 ${wpm.toFixed(0)} WPM（偏快，常规 ${WPM_TYPICAL_MIN}-${WPM_TYPICAL_MAX}）`;
    }

    // 提示去抖：**按状态切换触发**，而不是按「文案相同就吞掉」。
    //
    // 实测踩过的坑：早先按「文案相同则不重复」去抖，结果长时间超界时
    // 第一次之后提示就永远消失了 —— 而这恰恰是最需要提醒的场景。
    //
    // 现在记录的是「状态」：too-slow / too-fast / null。
    // 只有状态切换时才重新提示，既不刷屏也不会漏报。
    const stateKey = outOfRange
      ? wpm < WPM_SAFE_MIN
        ? "too-slow"
        : "too-fast"
      : null;

    if (advice !== null && stateKey !== this.lastAdvice) {
      this.lastAdvice = stateKey;
    } else {
      advice = null;
    }

    return {
      wpm: Math.round(wpm),
      confidence,
      units: this.units,
      outOfRange,
      unusual,
      advice,
    };
  }

  reset(): void {
    this.units = 0;
    this.elapsed = 0;
    this.lastAdvice = null;
  }
}

/**
 * 便捷函数：一次性估计（用于离线分析，如导入录音）。
 *
 * @returns WPM；样本不足时返回 null
 */
export function estimateWpm(
  text: string,
  durationSeconds: number,
  minUnits = 40,
): number | null {
  const units = countUnits(text);
  if (units < minUnits || durationSeconds <= 0) return null;
  return Math.round((1.2 * units * SILENCE_COMPENSATION) / durationSeconds);
}
