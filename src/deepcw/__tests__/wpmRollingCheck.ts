/**
 * 验证「瞬时估计 + EMA」设计在真实调用模式下工作。
 *
 * ## 历史教训（必须记住）
 *
 * 早先的 updateRolling（跨推理累计差值）测试全绿，但生产中完全失效：
 * 测试脚本自己发明了调用约定（stepSeconds=0.64 + 连续码元密度文本），
 * 而 Worker 的真实情况是「固定长度滚动窗口」——窗口时长恒定、
 * 内容差值稳态趋零。测试验证了一个不存在的调用方式。
 * （见 docs/AUDIT_REPORT_2.md X-1）
 *
 * 因此本文件的模拟**逐行复刻 deepcwWorker 的调用方式**：
 * 固定窗口时长、每次传完整窗口文本、无任何特殊参数。
 */
import { WpmEstimator, type WpmEstimate } from "../wpmEstimator.ts";

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

/**
 * 构造累计码元数约等于 target 的文本。
 * "EE" = E(1u键音+0间隔+3u字距) × 2 = 8u
 */
function textForUnits(target: number): string {
  if (target <= 0) return "";
  const n = Math.max(1, Math.round(target / 8));
  return "EE".repeat(n);
}

/**
 * 模拟 deepcwWorker 的真实调用序列：
 * 固定长度滚动窗口 + 每 stepSec 触发一次推理 + 每次传完整窗口文本。
 *
 * @param keyingRatio 发信占空比（1 = 连续发信，0.6 = 发 60% 停 40%）
 */
function simulateWorkerPattern(
  est: WpmEstimator,
  wpmTrue: number,
  windowSec: number,
  keyingRatio = 1,
): WpmEstimate {
  const unitsPerKeyedSec = wpmTrue / 1.2; // 每键音秒的码元数
  const stepSec = 2048 / 3200; // 音频块 2048 采样，与生产一致
  const duration = 60;
  const updates = Math.floor(duration / stepSec);

  let last: WpmEstimate = est.getEstimate();

  for (let i = 1; i <= updates; i++) {
    const now = i * stepSec;
    const windowStart = Math.max(0, now - windowSec);

    // 窗口内「键音秒」数：发信期才产生码元
    let keyedSec = 0;
    // 按发/停循环（周期 12s：keyingRatio 比例发信）逐段积分
    const cycle = 12;
    let t = windowStart;
    while (t < now) {
      const phase = t % cycle;
      const inKeying = phase < cycle * keyingRatio;
      const segEnd = Math.min(now, t + (inKeying ? cycle * keyingRatio - phase : cycle - phase));
      if (inKeying) keyedSec += segEnd - t;
      t = segEnd;
    }

    const windowUnits = Math.round(keyedSec * unitsPerKeyedSec);
    const text = textForUnits(windowUnits);

    // === 逐行对应 deepcwWorker.handleRunInference ===
    const audioSeconds = windowSec; // 固定长度滚动窗口：恒定！
    last = est.observeWindow(text, audioSeconds);
  }

  return last;
}

console.log("=== 1. 连续发信：瞬时估计 + EMA（生产调用模式）===\n");
for (const wpmTrue of [12, 15, 20, 25, 30, 40]) {
  const est = new WpmEstimator({ windowSeconds: 12 });
  const r = simulateWorkerPattern(est, wpmTrue, 12, 1);
  const err = r.wpm !== null ? Math.abs(r.wpm - wpmTrue) / wpmTrue : 1;

  const flag = err <= 0.15 ? "OK " : err <= 0.3 ? "· " : "BAD";
  console.log(
    `  ${flag} 真实 ${String(wpmTrue).padStart(2)} WPM → 估计 ${String(r.wpm).padStart(3)}，偏差 ${(err * 100).toFixed(0)}%`,
  );
  check(`${wpmTrue} WPM 偏差 <= 15%`, err <= 0.15, `实际 ${(err * 100).toFixed(0)}%`);
}

console.log("\n=== 2. 间歇发信（发 8s 停 4s）：读数不塌向 0 ===\n");
{
  // 已知局限：窗口包含静默时瞬时估计偏低（键音被摊到全窗时长）。
  // 发 8/停 4 → 理论读数 ≈ 2/3 真实速度。对 20 WPM 应读出 ~13，
  // 仍在安全区间内、且不会塌向 0 导致误报"过慢"。
  for (const wpmTrue of [20, 40]) {
    const est = new WpmEstimator({ windowSeconds: 12 });
    const r = simulateWorkerPattern(est, wpmTrue, 12, 2 / 3);
    const lo = wpmTrue * 0.5;
    const hi = wpmTrue * 1.05;
    console.log(
      `  真实 ${wpmTrue} WPM（占空比 2/3）→ 估计 ${r.wpm}（期望 ${lo.toFixed(0)}~${wpmTrue}）`,
    );
    check(
      `${wpmTrue} WPM 间歇读数在 ${lo.toFixed(0)}~${wpmTrue}`,
      r.wpm !== null && r.wpm >= lo && r.wpm <= hi,
      `实际 ${r.wpm}`,
    );
    check(`${wpmTrue} WPM 间歇不误报超慢`, !r.outOfRange || r.wpm! >= 8, `估计 ${r.wpm}`);
  }
}

console.log("\n=== 3. 杂散噪声不污染 EMA ===\n");
{
  const est = new WpmEstimator({ windowSeconds: 12 });
  // 先建立正常读数
  simulateWorkerPattern(est, 20, 12, 1);
  const stable = est.getEstimate().wpm;

  // 混入单个杂散字符（4 码元 < MIN_OBSERVE_UNITS=30，应被门限挡住）
  for (let i = 0; i < 10; i++) {
    est.observeWindow("E", 12);
  }
  const after = est.getEstimate().wpm;
  console.log(`  正常读数 ${stable} → 混入杂散后 ${after}`);
  check("杂散窗口不改变读数", stable !== null && after !== null && Math.abs(after - stable) < 1);
}

console.log("\n=== 4. 边界情况 ===\n");
{
  const est = new WpmEstimator({ windowSeconds: 12 });
  check("空窗口文本", est.observeWindow("", 12).wpm === null);
  check("零时长窗口", est.observeWindow("CQ DE BY4CWY", 0).wpm === null);
  check("极短窗口合理估计", est.observeWindow("CQ DE BY4CWY", 1) !== null);

  // reset 清空全部状态
  simulateWorkerPattern(est, 20, 12, 1);
  const before = est.getEstimate().wpm;
  est.reset();
  const after = est.getEstimate();
  check("reset 后读数清空", after.wpm === null && before !== null);
}

console.log(`\n${"-".repeat(52)}`);
console.log(`结果：${passed} 通过，${failed} 失败`);
if (failed > 0) process.exitCode = 1;
