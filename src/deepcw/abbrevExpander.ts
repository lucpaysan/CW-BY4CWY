/**
 * 缩写还原
 *
 * DeepCW 词表只有 26 字母 + 10 数字 + 少量标点，
 * 所以模型输出的是AR / SK / KN 这类字母序列，而不是带·-·- 的标准写法。
 * 本模块把这些序列还原成便于阅读的缩写形式，并纠正 CW 常见的听辨混淆。
 *
 * 设计原则：**只做有把握的纠正**。无法确定的保持原样，
 * 宁可少还原，也不要把正确的内容改错。
 */

/** 标准缩写对照：模型输出的粘连字母 → 标准缩写 */
const PROSIGNS: Record<string, string> = {
  AR: "AR",
  SK: "SK",
  KN: "KN",
  BT: "BT",
  AS: "AS",
  CT: "CT",
};

/**
 * 数字听辨混淆纠正。
 *
 * CW 数字与字母形近，噪声下极易混淆，实测中以下组合最常见。
 * 只在「整个词就是这些字符」时才替换，避免误伤正常文本。
 */
const DIGIT_FIXES: { re: RegExp; to: string }[] = [
  // 7 和 3 常被听成 O / S / D
  { re: /^(O5|OS|DS|D5|QT|OZ|DZ)$/, to: "73" },
  { re: /^(SO|SO|5O)$/, to: "50" },
  { re: /^(B8|BQ)$/, to: "BQ" },
  // 599 / 579 / 529 等RST 常见误听
  { re: /^(SO9|509|5O9)$/, to: "599" },
];

/**
 * 规范化单个词：去重、纠正、还原缩写。
 * 注意 CTC 偶发重复输出同一字符（如 SSSOS），这里做保守压缩。
 */
function normalizeToken(token: string): string {
  const upper = token.toUpperCase();

  // 数字与缩写纠正优先
  for (const { re, to } of DIGIT_FIXES) {
    if (re.test(upper)) {
      return to;
    }
  }

  // 标准缩写
  if (PROSIGNS[upper]) {
    return PROSIGNS[upper];
  }

  return upper;
}

/**
 * 压缩连续重复字符。
 *
 * CTC 会在信号抖动时输出 SSSS 这类重复，但正常 CW 里同一个字母
 * 连续出现两次（例如 SS = 二次确认）是有意义的。
 * 策略：只压缩 3 次及以上，保留 2 次。
 */
function collapseRepeats(word: string): string {
  return word.replace(/(.)\1{2,}/g, "$1$1");
}

/**
 * 对整段解码文本做缩写还原。
 *
 * @param raw 模型原始输出
 * @returns 还原后的文本
 */
export function expandAbbreviations(raw: string): string {
  if (!raw) return raw;

  // 按空白分词，逐词处理后重新拼接
  return raw
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .map((word) => collapseRepeats(normalizeToken(word)))
    .join(" ");
}

/**
 * 从解码文本中提取可能的通联要素，用于高亮显示。
 * 只做提取，不改写文本。
 */
export interface QSOElements {
  callsigns: string[];
  reports: string[];
  qcodes: string[];
}

/** 业余呼号：1-2 字母 + 0-4 数字 + 1-3 字母，或3-4 字母 + 数字 */
const CALLSIGN_RE = /\b(?:[A-Z]{1,2}\d{1,4}[A-Z]{0,3}|[A-Z]{3,4}\d{1,2})\b/g;
const REPORT_RE = /\b[1-5]\d{2}\b/g;
const QCODE_RE = /\bQ[A-Z]{2}\b/g;

/**
 * 呼号正则的排除词。
 *
 * 只放「不是呼号」的短词。**注意不能把 QTH/QSL/QSO 等 Q 码放进来**，
 * 否则 Q 码提取会被这层过滤误删。
 */
const CALLSIGN_EXCLUDE = new Set([
  "CQ", "DE", "K", "R", "SK", "KN", "AR", "BT", "AS", "CT", "UR",
  "AGN", "NIL", "TU", "OM", "FB", "OT", "HPE",
  // 数字与常见词
  "73", "88", "SOS", "OK", "HI", "NO", "YES",
]);

export function extractQSOElements(text: string): QSOElements {
  const upper = text.toUpperCase();

  const callsigns = (upper.match(CALLSIGN_RE) ?? []).filter(
    (c) => !CALLSIGN_EXCLUDE.has(c),
  );
  const reports = upper.match(REPORT_RE) ?? [];
  const qcodes = Array.from(new Set(upper.match(QCODE_RE) ?? []));

  return {
    callsigns: Array.from(new Set(callsigns)),
    reports: Array.from(new Set(reports)),
    qcodes,
  };
}
