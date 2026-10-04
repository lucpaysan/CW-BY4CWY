/**
 * 实验：E/T 单字符识别 + 人工发报鲁棒性
 *
 * Q1: E（单点）T（单划）太短解不出，能否靠Q 简语/常用组合带出来？
 *     对比：孤立E vs 出现在真实短语中的 E
 *
 * Q2: 真实人工发报间距不标准，DeepCW 还稳吗？
 *     对比：标准机器时序vs 逐级增强的抖动 + 噪声
 */
import { synthCW, MACHINE_TIMING, exportCases, type SynthOptions } from "./cwSynth.ts";

const outDir = process.argv[2] ?? "/tmp/deepcw_q1q2";
const timing = MACHINE_TIMING;

const cases: { name: string; text: string; opts: SynthOptions }[] = [];

// ---------- Q1: 单字符 vs 上下文中的同一字符 ----------
const SINGLE = ["E", "T", "A", "N", "M", "I", "S", "H", "O", "U", "R", "W"];
for (const ch of SINGLE) {
  cases.push({ name: `Q1-孤立-${ch}`, text: ch, opts: { wpm: 20, toneHz: 700, timing } });
}
// 同字符但放在真实短语里
const CONTEXT = [
  ["Q1-上下文-RES", "RES"],
  ["Q1-上下文-TU", "TU"],
  ["Q1-上下文-73TU", "73 TU"],
  ["Q1-上下文-RE", "R E"],
  ["Q1-上下文-CQTEST", "CQ TEST"],
  ["Q1-上下文-QTH", "QTH SHANGHAI"],
  ["Q1-上下文-DE", "DE BY4CWY"],
  ["Q1-上下文-RST", "RST 599"],
  ["Q1-上下文-NIL", "NIL"],
  ["Q1-上下文-OK", "OK"],
  ["Q1-上下文-SO", "SO"],
  ["Q1-上下文-WES", "WES"],
];
for (const [name, text] of CONTEXT) {
  cases.push({ name, text, opts: { wpm: 20, toneHz: 700, timing } });
}
// 带尾随静音（模拟滚动窗口里字符后面有内容）
for (const ch of ["E", "T"]) {
  cases.push({
    name: `Q1-孤立${ch}+补静音`,
    text: ch,
    opts: { wpm: 20, toneHz: 700, timing },
  });
}

// ---------- Q2: 人工发报的不规则程度 ----------
const Q2_TEXTS = [
  "CQ DE BY4CWY",
  "BY4CWY DE BG1ABC",
  "RST 599",
  "UR RST 579 QSL",
  "CQ CQ DE BY4CWY BY4CWY K",
];

// 抖动等级：0 标准 → 3 强人工
const JITTER_LEVELS = [
  { label: "Q2-标准(无抖动)", jitter: 0 },
  { label: "Q2-轻微抖动", jitter: 0.12 },
  { label: "Q2-中等抖动", jitter: 0.25 },
  { label: "Q2-强抖动", jitter: 0.4 },
];

for (const { label, jitter } of JITTER_LEVELS) {
  for (const text of Q2_TEXTS) {
    cases.push({
      name: `${label}-${text}`,
      text,
      opts: { wpm: 20, toneHz: 700, timing, jitter, seed: 7 },
    });
  }
}

// 手工发报常见的间距失衡：符号间隔过短（连发）
const RAGGED: { label: string; timing: typeof MACHINE_TIMING }[] = [
  { label: "Q2-间隔偏短", timing: { unit: 0.06, dashRatio: 3, symbolGap: 0.7, charGap: 2.2, wordGap: 5 } },
  { label: "Q2-间隔偏长", timing: { unit: 0.06, dashRatio: 3, symbolGap: 1.5, charGap: 4.5, wordGap: 9 } },
  { label: "Q2-dash偏短", timing: { unit: 0.06, dashRatio: 2.4, symbolGap: 1, charGap: 3, wordGap: 7 } },
  { label: "Q2-dash偏长", timing: { unit: 0.06, dashRatio: 3.8, symbolGap: 1, charGap: 3, wordGap: 7 } },
];
for (const { label, timing: t } of RAGGED) {
  for (const text of ["CQ DE BY4CWY", "BY4CWY DE BG1ABC"]) {
    cases.push({
      name: `${label}-${text}`,
      text,
      opts: { wpm: 20, toneHz: 700, timing: t, jitter: 0.15, seed: 11 },
    });
  }
}

// 噪声 + 抖动组合（嘈杂环境）
for (const snrDb of [10, 3, 0, -3, -6]) {
  for (const text of ["CQ DE BY4CWY", "UR RST 579 QSL"]) {
    cases.push({
      name: `Q2-抖动${snrDb >= 0 ? "+" : ""}${snrDb}dB-${text}`,
      text,
      opts: { wpm: 20, toneHz: 700, timing, jitter: 0.25, snrDb, seed: 23 },
    });
  }
}

// 频率漂移（收信机没对准）
for (const toneHz of [560, 600, 650, 700, 750, 800, 850, 900]) {
  cases.push({
    name: `Q2-基频${toneHz}Hz`,
    text: "CQ DE BY4CWY",
    opts: { wpm: 20, toneHz, timing, jitter: 0.2, seed: 31 },
  });
}

// 速度
for (const wpm of [10, 13, 16, 20, 25, 30, 35]) {
  cases.push({
    name: `Q2-${wpm}wpm`,
    text: "CQ DE BY4CWY",
    opts: { wpm, toneHz: 700, timing, jitter: 0.2, seed: 37 },
  });
}

const manifest = exportCases(cases, outDir);
console.log(`已生成 ${manifest.length} 个用例 -> ${outDir}/manifest.json`);
for (const m of manifest) {
  console.log(`  #${m.index} ${m.name.padEnd(34)} ${m.durationSec.toFixed(1)}s 帧数${m.timeSteps}`);
}
