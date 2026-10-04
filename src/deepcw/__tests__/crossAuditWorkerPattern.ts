/**
 * 交叉审计回归测试：WPM 在生产调用模式下必须能产出。
 *
 * 背景（docs/AUDIT_REPORT_2.md X-1）：updateRolling 时代，本测试的
 * 前身在**未修复**状态下输出「4/4 个速度永远为 null」——
 * 但当时项目 131 项测试全绿。原因是旧测试用了与 Worker 不同的调用约定。
 *
 * 本文件永久保留，作为「测试必须复刻生产调用模式」的守卫：
 * 逐行模拟 deepcwWorker.handleRunInference 的 WPM 调用路径，
 * 断言固定长度滚动窗口下 WPM 能产出且收敛到真实速度。
 */
import { WpmEstimator } from "../wpmEstimator.ts";

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

/** "EE" = 8 码元，用于构造指定码元数的窗口文本 */
function textForUnits(target: number): string {
  if (target <= 0) return "";
  const n = Math.max(1, Math.round(target / 8));
  return "EE".repeat(n);
}

/**
 * 完整复刻 Worker 的调用路径：
 *   audioSeconds = audioBuffer.length / 3200  （固定长度滚动窗口 → 恒定）
 *   wpmResult = estimator.observeWindow(decoded.text, audioSeconds)
 */
function runWorkerPattern(wpmTrue: number, windowSec: number) {
  const est = new WpmEstimator({ windowSeconds: windowSec });
  const unitsPerKeyedSec = wpmTrue / 1.2;
  const stepSec = 2048 / 3200;
  const updates = Math.floor(45 / stepSec);

  let lastWpm: number | null = null;
  let lastUnits = 0;

  for (let i = 1; i <= updates; i++) {
    const now = i * stepSec;
    const keyedSec = Math.min(now, windowSec); // 连续发信
    const text = textForUnits(Math.round(keyedSec * unitsPerKeyedSec));

    // === deepcwWorker.handleRunInference（逐行对应）===
    const audioSeconds = windowSec;
    if (!est) throw new Error("no estimator");
    const r = est.observeWindow(text, audioSeconds);
    // === 复制结束 ===

    lastWpm = r.wpm;
    lastUnits = r.units;
  }

  return { wpm: lastWpm, units: lastUnits, updates };
}

console.log("=== 生产调用模式回归（固定长度滚动窗口）===\n");
let dead = 0;
for (const wpmTrue of [12, 20, 30, 40]) {
  const r = runWorkerPattern(wpmTrue, 12);
  const err = r.wpm !== null ? Math.abs(r.wpm - wpmTrue) / wpmTrue : 1;

  const status = r.wpm === null ? "❌ 永远为 null" : `✅ ${r.wpm}`;
  console.log(
    `  真实 ${String(wpmTrue).padStart(2)} WPM → ${status}` +
      `（偏差 ${(err * 100).toFixed(0)}%，累计码元 ${r.units}，${r.updates} 次推理）`,
  );

  // 守卫 1：必须能产出（修复前这里是 0）
  check(`${wpmTrue} WPM 能产出（非 null）`, r.wpm !== null);
  // 守卫 2：收敛到真实速度
  check(`${wpmTrue} WPM 偏差 <= 15%`, err <= 0.15, `实际 ${(err * 100).toFixed(0)}%`);
  if (r.wpm === null) dead++;
}

console.log("");
if (dead > 0) {
  console.log(
    `结论：${dead}/4 个速度下 WPM 无法产出 —— WPM 徽章在生产环境中不会显示。\n` +
      "排查方向：\n" +
      "  1. Worker 是否仍用「差值累计」而非 observeWindow\n" +
      "  2. 音频缓冲是否变成了非固定长度（若是，stepSeconds 语义会变）\n" +
      "  3. observeWindow 的 MIN_OBSERVE_UNITS 门限是否过高",
  );
  process.exitCode = 1;
} else {
  console.log(`结果：${passed} 通过，${failed} 失败`);
  if (failed > 0) process.exitCode = 1;
}
