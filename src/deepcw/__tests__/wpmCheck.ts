/**
 * WPM 估计精度验证
 *
 * 用码元表的物理定义校验：N 码元 ÷ (1.2/WPM) 秒 =时长
 */
import {
  WpmEstimator,
  estimateWpm,
  countUnits,
  WPM_SAFE_MIN,
  WPM_SAFE_MAX,
} from "../wpmEstimator.ts";
import { synthCW, MACHINE_TIMING } from "./cwSynth.ts";

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

console.log("=== 1. 码元统计正确性 ===");
{
  // 已知码元：E=1, T=1, A=2, N=2, C=4
  check("E = 1 码元 + 3 间隔 = 4", countUnits("E") === 4, String(countUnits("E")));
  check("A = dash3u+dot1u+间隔1u+字距3u = 8", countUnits("A") === 8, String(countUnits("A")));
  check("EE = 8", countUnits("EE") === 8, String(countUnits("EE")));

  // "CQ" : C(4+3) + Q(4+3) = 14
  check("CQ = 30（C键音8+3+3=14, Q键音10+3+3=16）", countUnits("CQ") === 30, String(countUnits("CQ")));

  // 带空格：CQ + 空(7-3=4额外) + DE
  const spaced = countUnits("CQ DE");
  // C(8) + 空格补(4) + D(8) + E(4) = 24
  // CQ(30) + 空格补4 + D(10) + E(4) = 48
  const expected = 48;
  check("CQ DE = 48", spaced === expected, `${spaced}，期望 ${expected}`);

  console.log(`  参考：CQ DE BY4CWY = ${countUnits("CQ DE BY4CWY")} 码元`);
}

console.log("\n=== 2. 用真实合成音频校验（20 WPM）===");
{
  // cwSynth 用的正是 1.2/wpm 的定义，所以这里是最严格的验证
  const cases = [
    { text: "CQ DE BY4CWY", wpm: 20 },
    { text: "BY4CWY DE BG1ABC", wpm: 20 },
    { text: "RST 599", wpm: 20 },
    { text: "UR RST 579 QSL", wpm: 20 },
    { text: "CQ CQ DE BY4CWY BY4CWY K", wpm: 20 },
  ];

  for (const c of cases) {
    const audio = synthCW(c.text, {
      wpm: c.wpm,
      toneHz: 700,
      timing: MACHINE_TIMING,
    });
    const seconds = audio.length / 3200;
    const wpm = estimateWpm(c.text, seconds);
    const err = wpm !== null ? Math.abs(wpm - c.wpm) : 999;
    console.log(
      `  "${c.text}" ${seconds.toFixed(1)}s -> ${wpm} WPM (真实 ${c.wpm}) 误差 ${err}`,
    );
    check(
      `"${c.text}" 估计误差 <= 4 WPM`,
      err <= 4,
      `估计 ${wpm}，误差 ${err}`,
    );
  }
}

console.log("\n=== 3. 不同速度的区分能力 ===");
{
  const text = "CQ DE BY4CWY";
  const results: { wpm: number; est: number | null; out: boolean }[] = [];

  for (const wpm of [6, 8, 12, 20, 30, 45, 50]) {
    const audio = synthCW(text, {
      wpm,
      toneHz: 700,
      timing: MACHINE_TIMING,
    });
    const seconds = audio.length / 3200;
    const est = estimateWpm(text, seconds);
    const out = est !== null && (est < WPM_SAFE_MIN || est > WPM_SAFE_MAX);
    results.push({ wpm, est, out });
    console.log(
      `  真实 ${String(wpm).padStart(2)} WPM (${seconds.toFixed(1)}s) -> 估计 ${String(est).padStart(2)}  ${out ? "[超界]" : "[安全]"}`,
    );
  }

  // 安全区间内的样本不应被误判为超界
  for (const r of results.filter((x) => x.wpm >= WPM_SAFE_MIN && x.wpm <= WPM_SAFE_MAX)) {
    check(`${r.wpm} WPM 不误报超界`, !r.out, `估计 ${r.est}`);
  }
  // 明显超界的应被捕获
  for (const r of results.filter((x) => x.wpm < WPM_SAFE_MIN || x.wpm > WPM_SAFE_MAX)) {
    check(`${r.wpm} WPM 能识别超界`, r.out, `估计 ${r.est}`);
  }
}

console.log("\n=== 4. 滑动估计器 ===");
{
  const est = new WpmEstimator({ windowSeconds: 6 });

  const first = est.update("CQ");
  check("样本不足返回 null", first.wpm === null, `实际 ${first.wpm}`);

  // 累积 20 WPM 的文本
  for (let i = 0; i < 3; i++) {
    est.update("CQ DE BY4CWY", 8.5);
  }
  const r = est.getEstimate();
  console.log(
    `  累积后 ${r.wpm} WPM，码元 ${r.units}，置信度 ${(r.confidence * 100).toFixed(0)}%`,
  );
  check("累积后给出估计", r.wpm !== null);
  check("估计接近 20", r.wpm !== null && Math.abs(r.wpm - 20) <= 4, `实际 ${r.wpm}`);
  check("不在超界区间", !r.outOfRange);

  // 去抖：同一提示不重复
  const a = est.getEstimate();
  const b = est.getEstimate();
  check("相同提示不重复触发", b.advice === null, `实际 "${b.advice}"`);
  void a;
}

console.log("\n=== 5. 超界提示 ===");
{
  // 提示按「状态切换」触发：首次进入超界时产生，持续超界时不刷屏。
  // 所以要检查**第一次**进入超界的那次返回值。
  const slowEst = new WpmEstimator({ windowSeconds: 20 });
  let firstAdvice: string | null = null;
  let lastOut = false;
  let lastWpm: number | null = null;

  for (let i = 0; i < 4; i++) {
    const audio = synthCW("CQ DE BY4CWY", { wpm: 6, toneHz: 700, timing: MACHINE_TIMING });
    const r = slowEst.update("CQ DE BY4CWY", audio.length / 3200);
    // 首次进入超界即产生提示（样本已足够：单条 CQ DE BY4CWY = 100 码元）
    if (firstAdvice === null && r.advice) firstAdvice = r.advice;
    lastOut = r.outOfRange;
    lastWpm = r.wpm;
  }

  console.log(`  慢速场景: ${lastWpm} WPM, outOfRange=${lastOut}`);
  console.log(`  首次提示: "${firstAdvice}"`);
  check("慢速场景标记超界", lastOut, `wpm=${lastWpm}`);
  check("慢速场景曾给出提示", firstAdvice !== null, "从未产生提示");

  // 持续超界不应反复刷屏（第 4 次应为 null）
  const audio4 = synthCW("CQ DE BY4CWY", { wpm: 6, toneHz: 700, timing: MACHINE_TIMING });
  const again = slowEst.update("CQ DE BY4CWY", audio4.length / 3200);
  check("持续超界不刷屏", again.advice === null, `重复触发 "${again.advice}"`);

  const fastEst = new WpmEstimator({ windowSeconds: 6 });
  let fastAdvice: string | null = null;
  for (let i = 0; i < 4; i++) {
    const audio = synthCW("CQ DE BY4CWY", { wpm: 50, toneHz: 700, timing: MACHINE_TIMING });
    const r = fastEst.update("CQ DE BY4CWY", audio.length / 3200);
    if (fastAdvice === null && r.advice) fastAdvice = r.advice;
  }
  check("快速场景曾给出提示", fastAdvice !== null, "从未产生提示");
}

console.log("\n=== 6. 边界与异常 ===");
{
  check("空文本", estimateWpm("", 10) === null);
  check("零时长", estimateWpm("CQDE", 0) === null);
  check("码元不足", estimateWpm("CQ", 10) === null);

  const est = new WpmEstimator({ windowSeconds: 6 });
  est.update("CQ DE BY4CWY", 8.5);
  const before = est.getEstimate().units;
  est.reset();
  check("reset 清空累计", est.getEstimate().units === 0 && before > 0);

  // 特殊字符不崩溃
  const weird = estimateWpm("CQ.,?/DE", 8.5);
  check("含标点不崩溃", weird !== null || weird === null);
  check("countUnits 忽略未知字符", countUnits("###") === 0, String(countUnits("###")));
}

console.log("\n" + "=".repeat(50));
console.log(`结果：${passed} 通过，${failed} 失败`);
if (failed > 0) process.exitCode = 1;
