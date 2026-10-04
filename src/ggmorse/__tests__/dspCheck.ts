/**
 * DSP（ggmorse）路径的回归验证
 *
 * 针对第一轮审计定位的 5 个 bug 修复后的行为验证：
 *   1. Goertzel 幅度公式错误（sin(cos(ω))）
 *   2. processWindow 永远不触发（窗口完成点对不上批次末尾）
 *   3. currentFrequency 恒为 null
 *   4. dot/dash 自适应阈值不可逆（连续 dash 后永久误判）
 *   5. 消费端重喂整个滚动窗口（useDecode，行为修复不在此测）
 *
 * 验证方式：cwSynth 合成标准 CW 音频 → 按 2048 采样分批喂入
 * GGMorse（与 useDecode 相同方式）→ 校验解码输出。
 */
import { GGMorse } from "../ggmorse.ts";
import { synthCW, MACHINE_TIMING } from "../../deepcw/__tests__/cwSynth.ts";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ""}`);
  }
}

const FS = 3200;
const CHUNK = 2048; // 与 useAudioProcessing 一致

/** 按 useDecode 的方式分批喂入，返回最终文本 */
function decode(text: string, wpm: number, toneHz: number): { result: ReturnType<GGMorse["getResult"]> } {
  const gg = new GGMorse({ sampleRate: FS });
  const audio = synthCW(text, { wpm, toneHz, timing: MACHINE_TIMING, jitter: 0, seed: 1 });
  // 头尾补 0.5s 静音，让收尾字符能被字间隔判定弹出
  const silence = new Float32Array(Math.round(FS * 0.5));
  const full = new Float32Array(audio.length + silence.length * 2);
  full.set(silence, 0);
  full.set(audio, silence.length);
  full.set(silence, silence.length + audio.length);

  for (let off = 0; off < full.length; off += CHUNK) {
    gg.processSamples(full.subarray(off, Math.min(off + CHUNK, full.length)));
  }
  const finalText = gg.flush();
  return { result: { ...gg.getResult(), text: finalText } };
}

console.log("=== 1. 标准信号解码（修复前此路径完全无输出）===\n");
{
  const { result } = decode("CQ DE BY4CWY", 20, 800);
  const normalized = result.text.replace(/\s+/g, " ").trim();
  console.log(`  解码输出: "${normalized}"  (WPM=${result.wpm}, freq=${result.frequency})`);
  check("解码出内容（非空）", normalized.length > 0, `实际 "${normalized}"`);
  check("包含 CQ", normalized.includes("CQ"), `实际 "${normalized}"`);
  check("包含 BY4CWY", normalized.replace(/ /g, "").includes("BY4CWY"), `实际 "${normalized}"`);
  check("currentFrequency 已上报", result.frequency !== null && result.frequency > 0, `实际 ${result.frequency}`);
  check("WPM 估计在合理范围", result.wpm >= 15 && result.wpm <= 30, `实际 ${result.wpm}`);
}

console.log("\n=== 2. 连续 dash 开头的不可逆误判回归 ===\n");
{
  // 修复前：recentDurations 前 4+ 全是 dash → min 阈值被拉高 →
  // 之后所有 dash 永久判成 dot，状态不可逆。
  const { result } = decode("OO EEE OOO", 18, 800);
  const normalized = result.text.replace(/\s+/g, " ").trim();
  console.log(`  解码输出: "${normalized}"`);
  // O = ---（全 dash 开头），修复后 dash 必须被判为 dash
  check("包含 O（dash 正确分类）", normalized.includes("O"), `实际 "${normalized}"`);
  check("包含 E（dot 正确分类）", normalized.includes("E"), `实际 "${normalized}"`);
}

console.log("\n=== 3. 不同速度（含热身自校正）===\n");
{
  // 已知限制：前 1-2 个符号使用初始 WPM 先验（默认 20），
  // 实际速度偏离时可能误判，随后 dotReference 自校正恢复。
  // 所以用重复消息验证「热身后正确」。
  for (const wpm of [15, 20, 25]) {
    const { result } = decode("SOS SOS", wpm, 800);
    const normalized = result.text.replace(/\s+/g, "").trim();
    console.log(`  ${wpm} WPM: "${result.text.trim()}"`);
    check(`${wpm} WPM 热身后解出 SOS`, normalized.includes("SOS"), `实际 "${result.text.trim()}"`);
  }
}

console.log(`\n${"-".repeat(52)}`);
console.log(`结果：${passed} 通过，${failed} 失败`);
if (failed > 0) process.exitCode = 1;
