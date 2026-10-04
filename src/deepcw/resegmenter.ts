/**
 * 连读重切分（Run-on Resegmentation）
 *
 * ## 为什么需要
 *
 * 实测发现：当发报者字符间隔过小（< 1.5 unit）时，字符会粘连在一起，
 * CTC 无法切分，导致严重错误：
 *
 *   原文:  CQ DE BY4CWY
 *   粘连:  CQBBASJW        （CER 60%）
 *
 *   原文:  UR RST 579 QSL
 *   粘连:  URT5S39QD       （CER 55%）
 *
 * 注意这不是"识别错了"，而是"字母都对了，但不知道该在哪切开"。
 *
 * ## 思路（借鉴 morseformer 的 3-gram LM）
 *
 * 粘连串 `CQBBASJW` 有多种切分方式，正确的切法是 `CQ BB AS JW`，
 * 而错误切法可能是 `C QB BA SJ W`。给定一段文本的先验概率
 * （来自业余通联用语的出现频率），选择**概率最高**的切分。
 *
 * 这里用 2-gram（bigram）而非 3-gram：
 *  - 语料只有 248 条，3-gram 会严重稀疏
 *  - 业余通联的结构化程度高，bigram 已足够
 *  - 计算量小，可实时运行
 *
 * 此外还引入通联语法的硬约束（Q 码、呼号、常用缩写），
 * 优先按这些结构切分。
 */
import { PHRASE_LIBRARY } from "../core/phraseLibrary";

/** 词表：token 序列 -> 出现次数（基于 248 条语料 + 补充的高频通联词） */
type BigramTable = Map<string, number>;

/**
 * 通联中极高频的词，语料覆盖不到的补充进来。
 *
 * 语料只有 248 条，覆盖的是教学场景的常用短语；
 * 真实通联还会大量出现地名、装备词、英文口语词，
 * 这些若不在词表里，重切分时会被切碎（如 SHANGHAI -> S|HA|NG|HA|I）。
 */
const HIGH_FREQ_WORDS: string[] = [
  // ⚠️ 不要收录呼号碎片（BY/4C/WY 等）：
  //    它们会作为「词表词」拿到 isAtomic 的 +40 加成，
  //    主动鼓励 DP 把 BY4CWY 切成 BY|4C|WY —— 曾是
  //    「粘连串内嵌呼号被切碎」缺陷的帮凶。
  //    呼号保护现由 DP 的 span 级机制负责（见 findBestSegmentation）。
  "DE", "Q", "R",
  // Q 码
  "QSL", "QTH", "QRS", "QRZ", "QSO", "RST", "QRM", "QRP", "QRT", "QRV",
  "QRU", "QRK", "QRL", "QSA", "QSQ", "QSY", "QSP", "QRO", "QRQ", "QRV",
  // 礼俗
  "CQ", "DE", "K", "SK", "KN", "UR", "R", "TU", "73", "88", "HPE",
  "AGN", "NIL", "FB", "OM", "OT", "HR", "VY", "OP", "T", "TNX", "Tnx",
  "ESQ", "M", "MC", "MNI", "MOM", "GM", "GN", "GE", "GA", "GL",
  // 常见单词
  "NAME", "LOC", "GRID", "RIG", "ANT", "PWR", "TEST", "HERE", "MY",
  "YOUR", "AND", "FOR", "WITH", "FROM", "THE", "AND", "YES", "NO", "OK",
  "SO", "HELLO", "HI", "BYE", "SORRY", "THANKS", "WELCOME",
  "RADIO", "HAM", "STATION", "CALL", "SIGNAL", "REPORT", "RECEIVED",
  "COPY", "AGN", "QSL", "CONFIRM", "ANSWER", "OVER", "ROGER", "OUT",
  // 装备与技术
  "DIPOLE", "VERTICAL", "ANTENNA", "POWER", "WATT", "METER", "WAVE",
  "BAND", "MODE", "FREQ", "FREQENCY", "KEY", "KEYER", "PADDLE",
  "RECEIVER", "TRANSCEIVER", "AMPLIFIER", "MICROPHONE", "CABLE",
  // 数字组合（信号报告）
  "599", "579", "529", "559", "549", "589", "449", "599",
];

/**
 * 常见英文地名与专有名词。
 *
 * 这些是通联中 QTH 报法的常见内容，长度高、无空格，
 * 若不在词表就会被重切分切碎，必须显式收录。
 */
const PLACE_WORDS: string[] = [
  "SHANGHAI", "BEIJING", "GUANGZHOU", "SHENZHEN", "TIANJIN", "CHONGQING",
  "NANJING", "HANGZHOU", "WUHAN", "QINGDAO", "XIAN", "CHENGDU",
  "HONGKONG", "MACAU", "TAIPEI", "TOKYO", "OSAKA", "SEOUL",
  "LONDON", "PARIS", "BERLIN", "MOSCOW", "TOKYO", "SYDNEY",
  "NEWYORK", "WASHINGTON", "CHICAGO", "TORONTO", "HONOLULU",
  "USA", "CHINA", "JAPAN", "KOREA", "RUSSIA", "GERMANY", "FRANCE",
  "ENGLAND", "CANADA", "AUSTRALIA", "SPAIN", "ITALY",
];

/** 其他不易切错的常用长词 */
const COMMON_LONG_WORDS: string[] = [
  "HELLO", "GOODBYE", "WELCOME", "THANKS", "PLEASE", "SORRY",
  "NAME", "CALLSIGN", "CONTEST", "FREQUENCY", "DIRECTION",
  "LOCATION", "REPORT", "WEATHER", "ANTENNA", "BATTERY",
  "CONDITIONS", "OPERATION", "STATION", "AMATEUR", "RADIO",
  "RECEIVER", "TRANSMITTER", "MONITOR", "SIGNAL", "MESSAGE",
];

/**
 * 完整业余呼号正则。
 *
 * 中国大陆俱乐部呼号形如 BY4CWY / BG1ABC / BA4TA，符合
 *   [前缀1-2字母][数字][后缀1-3字母]
 *
 * 这个正则用于**保护**：一旦整段能匹配呼号，绝不允许再切分。
 * 上一版bug 就是因为没有这层保护，把 BY4CWY 切成了 BY|4C|WY。
 */
const FULL_CALLSIGN = /^[A-Z]{1,2}\d{1}[A-Z]{1,3}$/;

/** 已知呼号片段（语料里出现过的完整呼号） */
const KNOWN_CALLSIGNS = new Set(
  PHRASE_LIBRARY.filter((p) => FULL_CALLSIGN.test(p.text.toUpperCase())).map(
    (p) => p.text.toUpperCase(),
  ),
);

/**
 * 判断整段是否为不可分割的原子单元。
 * 命中则直接返回，任何情况下都不切。
 *
 * ⚠️ 这一层是**安全性兜底**，不是优化。实测中曾出现
 * `BY4CWY` 被切成 `BY|4C|WY`、`SHANGHAI` 被切成 `S|HA|NG|HA|I`
 * 的情况——呼号和地名一旦被切碎，通联信息就废了。
 * 因此规则必须**宁可少切也不切错**。
 */
function isAtomic(segment: string): boolean {
  const s = segment.toUpperCase();

  // 1. 完整呼号（最优先）
  if (FULL_CALLSIGN.test(s)) return true;
  if (KNOWN_CALLSIGNS.has(s)) return true;

  ensureTables();

  // 2. 语料收录的词/地名：整体保留
  if (vocabulary!.has(s)) return true;

  // 3. 纯数字片段（如 599、73）：是完整的信号报告，不可切
  if (/^\d{1,4}$/.test(s)) return true;

  // 4. 含数字但混有较长字母段（如 BY4CWY）：仅当长度不大时才整体保留。
  //
  // ⚠️ 这里曾经写成「≤8 字符就当原子」，结果 CQBBASJW（8 字符、含数字）
  // 被整体豁免，重切分对粘连场景**完全不起作用**（实测 CER 改善 0%）。
  // 粘连串的典型特征就是「含数字 + 长度中等」，所以必须加长度上限，
  // 只保护真正的呼号形态。
  if (/\d/.test(s) && s.length <= 6) {
    // 形如 4CWY / 1AB 的呼号片段
    if (/^[A-Z0-9]{1,6}$/.test(s) && /[A-Z]/.test(s)) {
      return true;
    }
  }

  return false;
}

let bigramTable: BigramTable | null = null;
let unigramTable: Map<string, number> | null = null;
let vocabulary: Set<string> | null = null;

/** 初始化 n-gram 表（模块加载时懒构建） */
function ensureTables(): void {
  if (bigramTable) return;

  const bi = new Map<string, number>();
  const uni = new Map<string, number>();
  const vocab = new Set<string>();

  const addSequence = (words: string[], weight: number) => {
    for (const w of words) {
      uni.set(w, (uni.get(w) ?? 0) + weight);
      vocab.add(w);
    }
    for (let i = 0; i + 1 < words.length; i++) {
      const key = `${words[i]} ${words[i + 1]}`;
      bi.set(key, (bi.get(key) ?? 0) + weight);
    }
  };

  // 主语料：每条出现 3 次权重，保证语料词主导
  for (const phrase of PHRASE_LIBRARY) {
    const words = phrase.text
      .toUpperCase()
      .split(/\s+/)
      .filter((w) => w.length > 0);
    if (words.length > 0) addSequence(words, 3);
  }

  // 补充词：地名单独给更高权重（通联中高频，且长词易被切碎）
  for (const w of PLACE_WORDS) {
    uni.set(w, (uni.get(w) ?? 0) + 5);
    vocab.add(w);
  }
  for (const w of COMMON_LONG_WORDS) {
    uni.set(w, (uni.get(w) ?? 0) + 3);
    vocab.add(w);
  }

  // 单个词的补充（作为 unigram 参与，不造 bigram）
  for (const w of HIGH_FREQ_WORDS) {
    uni.set(w, (uni.get(w) ?? 0) + 2);
    vocab.add(w);
  }

  bigramTable = bi;
  unigramTable = uni;
  vocabulary = vocab;
}

/** 查询 bigram 概率（加平滑） */
function bigramScore(a: string, b: string): number {
  ensureTables();
  const bi = bigramTable!;
  const uni = unigramTable!;

  const pairCount = bi.get(`${a} ${b}`) ?? 0;

  // stupid-backoff 平滑：未见过的二元组退回到 unigram
  if (pairCount > 0) return pairCount;
  return (uni.get(b) ?? 0) * 0.4;
}

/** 单词本身的先验分数 */
function unigramScore(word: string): number {
  ensureTables();
  const uni = unigramTable!;
  const count = uni.get(word) ?? 0;
  if (count > 0) return count;
  // 未知词：给一个很低的分，但不为 0（保证合法切分总能被选中）
  return 0.05;
}

/**
 * 语法硬约束：给定前缀和后续，返回某个切分位置的"合理度加成"。
 * 用于把 Q 码、呼号等结构整体切出。
 *
 * 分数设计（数值经实测调平衡）：
 *  - 完整 Q 码 / 3 位报告：8~10
 *  - 标准缩写（CQ/DE/SK）：7~9
 *  - 2 字片段：1.2（避免产生大量单字母，这是连读的典型形态）
 *  - 3 字及以上：1.6~2.5（真实粘连串多为 3-5 字一组）
 */
function syntaxBonus(token: string, isLast: boolean): number {
  // Q 码：极强的信号
  if (/^Q[A-Z]{1,2}$/.test(token)) return 10;
  // 3 位信号报告
  if (/^[1-5]\d{2}$/.test(token)) return 10;
  // 标准缩写
  if (["CQ", "DE", "SK", "KN", "BT", "AR", "AS", "CT"].includes(token)) return 9;
  if (["QSL", "QTH", "QRS", "UR", "AGN", "NIL", "OM", "FB", "TU", "HPE"].includes(token)) {
    return 7;
  }
  if (["73", "88"].includes(token)) return 7;

  // 2 字片段：弱加成。CW 连读时最常见的形态就是 2-3 字粘连，
  // 给它正分能显著减少「C|Q|BB|AS|JW」这种过度切分。
  if (token.length === 2 && /^[A-Z]{2}$/.test(token)) return 1.2;

  // 3 字片段：适度加成
  if (token.length === 3 && /^[A-Z]{3}$/.test(token)) return 1.6;

  // 4~6 字纯字母：可能是地名或单词，轻微加成
  if (token.length >= 4 && token.length <= 6 && /^[A-Z]+$/.test(token)) return 2.0;

  void isLast;
  return 0;
}

export interface ResegmentOptions {
  /** 词表外字符的处理：true = 保留原样不切分 */
  keepUnknown?: boolean;
  /** 最大切分长度（防止退化），默认 6 */
  maxTokenLength?: number;
  /** 最小词长（比这更短的多半是切碎了）*/
  minTokenLength?: number;
}

export interface ResegmentResult {
  /** 重切分后的文本 */
  text: string;
  /** 使用的切分方案 */
  tokens: string[];
  /** 切分得分 */
  score: number;
  /** 是否发生了变化 */
  changed: boolean;
}

/**
 * 对粘连的字母串做重切分。
 *
 * @param input 模型输出，可能含空格（已确认的词边界）或纯字母（粘连段）
 * @returns 重切分结果
 */
export function resegment(input: string, options: ResegmentOptions = {}): ResegmentResult {
  const { keepUnknown = true, maxTokenLength = 6, minTokenLength = 1 } = options;

  const trimmed = input.trim();
  if (!trimmed) {
    return { text: input, tokens: [], score: 0, changed: false };
  }

  // 按已有空格分段，只处理没有空格的粘连段
  const segments = trimmed.split(/\s+/).filter((s) => s.length > 0);
  const resultTokens: string[] = [];
  let totalScore = 0;
  let changed = false;

  for (const seg of segments) {
    if (seg.length <= minTokenLength) {
      // 太短，可能是真实的单字符，保持原样
      resultTokens.push(seg);
      totalScore += unigramScore(seg);
      continue;
    }

    // 原子单元保护：呼号、语料收录的完整词一律不动
    if (isAtomic(seg)) {
      resultTokens.push(seg);
      totalScore += unigramScore(seg) + 5;
      continue;
    }

    // 完全命中词表且不需要重切
    ensureTables();
    if (vocabulary!.has(seg) && seg.length <= maxTokenLength && !needsResegment(seg)) {
      resultTokens.push(seg);
      totalScore += unigramScore(seg);
      continue;
    }

    const best = findBestSegmentation(seg, maxTokenLength, keepUnknown);
    if (best.tokens.length > 1) {
      resultTokens.push(...best.tokens);
      totalScore += best.score;
      if (best.tokens.join(" ") !== seg) changed = true;
    } else {
      resultTokens.push(seg);
      totalScore += unigramScore(seg);
    }
  }

  const text = resultTokens.join(" ");
  return { text, tokens: resultTokens, score: totalScore, changed };
}

/**
 * 判断一个串是否需要重切分。
 *
 * 粘连的典型特征：长串且无法直接命中词表，
 * 或者虽命中词表但明显是多个粘连词（如 "CQBBASJW"）。
 */
function needsResegment(segment: string): boolean {
  ensureTables();
  // 短词直接放过
  if (segment.length <= 4) {
    return !vocabulary!.has(segment);
  }
  // 长串命中词表也不信（可能是巧合）
  return true;
}

/**
 * 动态规划找最优切分。
 *
 * dp[i] = 前 i 个字符的最优得分
 * 转移：dp[i] = max over j (dp[j] + score(token = seg[j..i]))
 *
 * @param keepUnknown true 时只允许切出词表内词或含数字的片段（保守）；
 *                    false 时允许任意字母数字组合（激进，可能切碎）
 */
function findBestSegmentation(
  seg: string,
  maxLen: number,
  keepUnknown = true,
): { tokens: string[]; score: number } {
  const n = seg.length;
  const upper = seg.toUpperCase();

  // ---- 呼号 span 保护（修复「内嵌呼号被切碎」缺陷）----
  //
  // 先在整段上无边界地找出所有呼号形态的 span（如
  // BY4CWYDEBG1ABC → [0,6)"BY4CWY"、[8,14)"BG1ABC"），
  // 再在 DP 打分时：
  //   - token **恰好覆盖**某个 span → 重奖（且不受长度惩罚稀释）
  //   - token 与某个 span 部分重叠（从中间切碎 / 跨越边界）→ 重罚
  //
  // ⚠️ 早先只有「整段 isAtomic」检查，DP 内部的候选子串没有保护，
  //    BY4CWYDEBG1ABC 被切成 BY 4C WY DE BG 1AB C。
  //    另一个帮凶是词表里收录过 BY/4C/WY 等呼号碎片（已移除）。
  const callsignSpans: Array<[number, number]> = [];
  const spanRe = /[A-Z]{1,2}\d[A-Z]{1,3}/g;
  let sm: RegExpExecArray | null;
  while ((sm = spanRe.exec(upper))) {
    callsignSpans.push([sm.index, sm.index + sm[0].length]);
  }
  const hasCallsignSpan = callsignSpans.length > 0;

  // dp[i]: 前 i 字符的最优总得分
  const dp = new Array<number>(n + 1).fill(-Infinity);
  // prev[i]: 最优解中，位置 i 之前的切点
  const prev = new Array<number>(n + 1).fill(-1);

  dp[0] = 0;

  for (let i = 1; i <= n; i++) {
    const maxStart = Math.max(0, i - maxLen);
    for (let j = maxStart; j < i; j++) {
      if (dp[j] === -Infinity) continue;

      const token = upper.slice(j, i);

      // 合法性：只允许字母数字
      if (!/^[A-Z0-9]+$/.test(token)) continue;

      // 该 token 的得分
      let tokenScore = unigramScore(token);

      // 保守模式：较长的纯字母片段若不在词表，风险较高，给强惩罚。
      //
      // ⚠️ 曾在这里直接 `continue` 禁止未收录的 token，
      // 结果粘连样本 CQBBASJW 找不到任何合法切分，DP 彻底放弃 ——
      // 重切分对粘连场景的 CER 改善实测为 0%，形同虚设。
      // 现在改为「允许竞争 + 惩罚」，让正确切法靠得分胜出。
      if (keepUnknown && token.length >= 4 && !/\d/.test(token)) {
        tokenScore -= 3;
      }

      // 原子单元（呼号、语料词）给极高加成，阻止被进一步切碎
      if (isAtomic(token)) {
        tokenScore += 40;
      }

      // 词表里的词，bigram 上下文加成
      if (j > 0) {
        const prevToken = upper.slice(
          Math.max(0, prev[j]!),
          j,
        );
        tokenScore += bigramScore(prevToken, token) * 0.5;
      }

      // 语法加成
      tokenScore += syntaxBonus(token, i === n);

      // 长度惩罚：鼓励产生合理的词长
      // 实测教训：过小的长度惩罚会让 DP 把粘连串切成「C|Q|BB|AS|JW」
      // 这种全单字母的形式，而真实连读几乎不会出现连续单字母。
      const len = i - j;
      const lengthPenalty =
        len === 1 ? 0.35 : len === 2 ? 1.0 : len === 3 ? 1.1 : len <= 4 ? 1.0 : len === 5 ? 0.8 : 0.5;
      let total = dp[j] + tokenScore * lengthPenalty;

      // 呼号 span 保护：加在长度惩罚**之后**，不被稀释。
      //   恰好覆盖 span → 重奖（完整呼号是通联信息里最不能碎的）
      //   部分重叠 span → 重罚（从呼号中间切开 = 信息报废）
      if (hasCallsignSpan) {
        let covers = false;
        let overlaps = false;
        for (const [s, e] of callsignSpans) {
          if (j === s && i === e) {
            covers = true;
            break;
          }
          if (j < e && i > s) {
            overlaps = true;
          }
        }
        if (covers) total += 60;
        else if (overlaps) total -= 20;
      }

      if (total > dp[i]) {
        dp[i] = total;
        prev[i] = j;
      }
    }
  }

  // 回溯
  if (dp[n] === -Infinity) {
    return { tokens: [seg], score: 0 };
  }

  const tokens: string[] = [];
  let pos = n;
  while (pos > 0) {
    const p = prev[pos]!;
    tokens.unshift(upper.slice(p, pos));
    pos = p;
  }

  return { tokens, score: dp[n] };
}

/**
 * 对整段解码文本应用重切分。
 * 保留原有的词边界，在词边界内做细分。
 */
export function resegmentText(text: string): string {
  if (!text) return text;

  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return text;

  const out: string[] = [];
  for (const w of words) {
    const r = resegment(w);
    out.push(...(r.tokens.length > 0 ? r.tokens : [w]));
  }

  return out.join(" ");
}

/** 供UI 显示：解释某段为什么这样切 */
export function explainResegmentation(segment: string): string {
  const r = resegment(segment);
  if (!r.changed) {
    return `${segment}（无需重切）`;
  }
  return `${segment} → ${r.tokens.join(" | ")}（得分 ${r.score.toFixed(1)}）`;
}
