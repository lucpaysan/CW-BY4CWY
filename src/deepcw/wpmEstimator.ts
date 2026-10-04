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
 * 反推 WPM 必须**码键音时长**，而不是数字符：
 *
 *   总时长 = 总键音码元 × 1.2 / WPM
 *   =>  WPM = 1.2 × 总键音码元 / 总时长
 *
 * 举例 "CQ DE BY4CWY"（20 WPM，dot = 0.06s）：
 *   C(-.-.) = 键音8u + 内部间隔3u + 字符间隔3u = 14u
 *   Q(--.-) = 16u    D(-..) = 10u    E(.) = 4u
 *   B(-...) = 12u    Y(-.--) = 13u   4(....-) = 15u
 *   W(.--) = 12u     Y = 13u
 *   两个词间隔各补 4u（字符间隔 3u 已计入，补足到 7u）
 *   合计 ≈ 117u → 117 × 0.06 ≈ 7.0 秒
 *
 * ⚠️ 踩过的坑（两次）：
 *   1. 早先误用「字符数 × 3.6」估算码元，结果全部算出 0~2 WPM。
 *   2. 早先按 code.length（码元**个数**）代替键音**时长**，
 *      把 dash 当成 1u —— 用经验系数 1.4 掩盖了很久。
 *      教训：估计值有偏差时，第一反应是怀疑算法，而不是加系数。
 *
 * ## 实时模式（observeWindow）为什么是瞬时估计 + EMA
 *
 * 实时解码的音频缓冲是**固定长度的滚动窗口**（见 useAudioProcessing）：
 * 每次推理拿到「最近 N 秒」的完整音频，相邻两次高度重叠。
 *
 * ⚠️ 踩过的坑：曾尝试「跨推理累计差值」（updateRolling）——
 * 维护上一窗口的码元基线，把差值累加。**这个设计在稳态下必然失效**：
 * 窗口滑动时新内容进、旧内容出，差值 = 净变化 ≈ 0；
 * 且窗口时长恒定导致 stepSeconds = 0，累计从未发生过。
 * 交叉审计用生产调用模式复现：70 次推理累计码元为 0，WPM 永远为 null。
 * （见 docs/AUDIT_REPORT_2.md X-1）
 *
 * 瞬时估计没有这些问题——每次推理独立成立：
 *
 *   inst = 1.2 × countUnits(text) / windowSeconds
 *
 * 再用 EMA 跨推理平滑（按窗口码元数加权：内容少的窗口权重小，
 * 空闲静默期不会把读数拖向 0）。
 */

/** 国际 Morse 码表（用于统计键音码元）*/
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
 *   字符内部 = 键音时长(dot 1u / dash 3u) + (码元数-1) × 符号间隔(1)
 *   字符之间 = 字符间隔(3)
 *   单词之间 = 单词间隔(7)
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
      // 上一字符的 count 里已含 3u 字符间隔，
      // 空格需把它补足到标准的 7u 单词间隔，故补 4。
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
      // ⚠️ 键音时长必须按 Morse 定义逐符号累加：
      //    dot = 1u，dash = 3u。
      //    （早先写 code.length 的教训见文件头注释）
      let toneUnits = 0;
      for (const sym of code) {
        toneUnits += sym === "-" ? 3 : 1;
      }
      total += toneUnits + (code.length - 1) + CHAR_GAP_UNITS;
      hasPrevChar = true;
      continue;
    }

    // 常见标点：按 4u 键音 + 2u 内部间隔估算
    if (/[.,?!\-=()]/.test(ch)) {
      total += 4 + 2 + CHAR_GAP_UNITS;
      hasPrevChar = true;
    }
  }

  return total;
}

/**
 * 静音补偿系数（离线累计路径用）。
 *
 * 历史上曾是 1.4，用于掩盖两个 bug（滚动窗口重复统计 + 码元算法错误）。
 * 算法修正后归 1.0。保留可配置入口，便于将来用真实电台录音重新标定。
 * ⚠️ 若要调整，请用测试框架验证，不要凭印象改数值。
 */
const SILENCE_COMPENSATION = 1.0;

/** 实测得出的安全区间 */
export const WPM_SAFE_MIN = 8;
export const WPM_SAFE_MAX = 45;

/** 典型通联速度 */
export const WPM_TYPICAL_MIN = 12;
export const WPM_TYPICAL_MAX = 25;

/** 瞬时观察的最小窗口码元数：低于此值视为杂散噪声，不更新 EMA */
const MIN_OBSERVE_UNITS = 30;

export interface WpmEstimate {
  /** 估计的 WPM；样本不足时为 null */
  wpm: number | null;
  /** 置信度 0~1 */
  confidence: number;
  /** 参与本次估计的码元数 */
  units: number;
  /** 是否超出安全区间（会明显失真）*/
  outOfRange: boolean;
  /** 是否偏离常规通联速度（仅提示）*/
  unusual: boolean;
  /** 给用户的提示；仅在状态切换时触发一次 */
  advice: string | null;
}

export interface WpmConfig {
  /** 送入模型的窗口时长（秒），仅用于默认 delta */
  windowSeconds: number;
}

/**
 * WPM 估计器。
 *
 * 两条独立的估计路径：
 *   - **实时路径** `observeWindow()`：瞬时估计 + 加权 EMA。Worker 用这个。
 *   - **离线路径** `update()`：朴素累计。离线分析、导入录音等场景用。
 *
 * 两者共享同一个 getEstimate() 输出与提示状态机；
 * 一旦用过实时路径，累计路径的读数被屏蔽（避免两套状态互相污染）。
 */
export class WpmEstimator {
  private windowSeconds: number;

  // —— 实时路径（EMA）——
  private ema: number | null = null;
  private lastWindowUnits = 0;

  // —— 离线路径（累计）——
  private units = 0;
  private elapsed = 0;

  /** 上一次的提示状态："too-slow" | "too-fast" | null */
  private lastAdvice: "too-slow" | "too-fast" | null = null;

  constructor(config: WpmConfig) {
    this.windowSeconds = config.windowSeconds;
  }

  /**
   * 实时路径：记录一次滚动窗口的推理结果。
   *
   * 每次推理独立计算瞬时 WPM，再用按码元数加权的 EMA 平滑。
   * 不依赖相邻窗口的关系，天然免疫滚动窗口的重叠。
   *
   * @param text 本次窗口的完整解码文本
   * @param windowSeconds 本次窗口的音频时长（秒）
   */
  observeWindow(text: string, windowSeconds: number): WpmEstimate {
    const u = countUnits(text);

    if (u >= MIN_OBSERVE_UNITS && windowSeconds > 0) {
      const inst = (1.2 * u) / windowSeconds;
      // 码元越多，本次读数越可信：满窗（~200u+）直接采纳，
      // 稀疏窗口只轻微拉动 EMA，空闲静默期基本冻结读数。
      const alpha = Math.min(1, Math.max(0.2, u / 200));
      this.ema = this.ema === null ? inst : this.ema + alpha * (inst - this.ema);
      this.lastWindowUnits = u;
    }

    return this.getEstimate();
  }

  /**
   * 离线路径：记录一次解码结果（朴素累计）。
   *
   * @param text 本次解码文本
   * @param deltaSeconds 这段文本对应的实际音频时长
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
    let wpm: number;
    let units: number;
    let confidence: number;

    if (this.ema !== null) {
      // 实时路径优先
      wpm = this.ema;
      units = this.lastWindowUnits;
      confidence = Math.min(1, this.lastWindowUnits / 150);
    } else if (this.units >= 40 && this.elapsed > 0) {
      // 离线累计路径
      wpm = (1.2 * this.units * SILENCE_COMPENSATION) / this.elapsed;
      units = this.units;
      confidence = Math.min(1, this.units / 120);
    } else {
      return {
        wpm: null,
        confidence: 0,
        units: this.ema !== null ? this.lastWindowUnits : this.units,
        outOfRange: false,
        unusual: false,
        advice: null,
      };
    }

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

    // 提示状态机：**无条件**记录当前状态，仅在状态切换时放行提示。
    //
    // ⚠️ 踩过的坑（两次）：
    //   1. 最初按「文案相同则吞掉」去抖，长时间超界时首次之后提示永久消失。
    //   2. 修复时只在「发出提示」的分支里更新 lastAdvice，
    //      恢复正常时不复位 —— 第二次进入同一超界状态时提示再次被吞。
    // 正确做法：lastAdvice 必须每帧跟随 stateKey，切换沿才放行。
    const stateKey: "too-slow" | "too-fast" | null = outOfRange
      ? wpm < WPM_SAFE_MIN
        ? "too-slow"
        : "too-fast"
      : null;

    const isTransition = stateKey !== this.lastAdvice;
    this.lastAdvice = stateKey;
    if (advice !== null && !isTransition) {
      advice = null;
    }

    return {
      wpm: Math.round(wpm),
      confidence,
      units,
      outOfRange,
      unusual,
      advice,
    };
  }

  reset(): void {
    this.ema = null;
    this.lastWindowUnits = 0;
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
