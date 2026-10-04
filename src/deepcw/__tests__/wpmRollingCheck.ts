/**
 * 验证滚动窗口差值统计消除了 WPM 偏差。
 *
 * 复现审计发现的缺陷：真实 20 WPM 被估成 29（+45%）。
 *
 * ## 关键设计说明
 *
 * WPM 衡量的是「按键时」的打字速度。CW 通联中静默占很大比例
 * （字间隔 3u、词间隔 7u、停发换气），这些间隔本身就是 CW 时序的
 * 一部分，必须计入 elapsed —— 所以 elapsed 应累加「新增的音频」，
 * 而不是「按键声」。
 *
 * 因此模拟采用连续发射的 CW 流（只有标准字/词间隔，无长时静默）。
 */
import { WpmEstimator, countUnits } from "../wpmEstimator.ts";

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

const REPORT = "CQ DE BY4CWY K";
const REPORT_UNITS = countUnits(REPORT);

/**
 * 构造某时刻窗口内的**连续**码元流。
 *
 * 关键：真实解码输出的是连续字符流，不是离散的整段报文。
 * 早期版本用「整段报文个数」模拟，导致窗口内码元数是阶梯式跳变
 * （每次 +112），而 elapsed 只按 0.64 秒累加 —— 分子被放大 10 倍，
 * 测出 1420% 的假偏差。
 *
 * 正确做法：把窗口内的码元数按「码元密度」均匀铺开，
 * 使 units/elapsed 之比恰好等于真实发送速率。
 */
function windowUnitsAt(now: number, windowSec: number, unitsPerSec: number): number {
  // 窗口起点之前的部分不计入（已滑出）
  const from = Math.max(0, now - windowSec);
  return Math.round((now - from) * unitsPerSec);
}

function simulate(est: WpmEstimator, wpmTrue: number, rolling: boolean) {
  const dot = 1.2 / wpmTrue;
  const cycleSec = REPORT_UNITS * dot;
  const unitsPerSec = REPORT_UNITS / cycleSec;
  const windowSec = 12;
  const stepSec = 2048 / 3200;
  const updates = Math.floor(45 / stepSec);

  // 把码元数还原成可被 countUnits 解析的文本：
  // 用重复的 "E"（1 码元 + 1 内部间隔 0 + 3 字符间隔 = 4 码元）不划算，
  // 这里直接构造等长文本，仅用于让 countUnits 返回目标码元数。
  const textForUnits = (target: number): string => {
    // "EE" = 8 码元 => 每 2 字符 8 码元
    const n = Math.max(1, Math.round(target / 8));
    return "EE".repeat(n);
  };

  let first = true;
  for (let i = 1; i <= updates; i++) {
    const now = i * stepSec;
    const units = windowUnitsAt(now, windowSec, unitsPerSec);
    const text = textForUnits(units);
    if (rolling) {
      est.updateRolling(text, stepSec, first);
      first = false;
    } else {
      est.update(text, windowSec);
    }
  }
}

console.log("=== 1. 差值统计（修复后）vs 朴素实现（修复前）\n");
for (const wpmTrue of [12, 15, 20, 25, 30, 40]) {
  const estNew = new WpmEstimator({ windowSeconds: 12 });
  simulate(estNew, wpmTrue, true);
  const rn = estNew.getEstimate();
  const errNew = rn.wpm !== null ? Math.abs(rn.wpm - wpmTrue) / wpmTrue : 1;

  const flag = errNew <= 0.25 ? "OK " : errNew <= 0.35 ? "· " : "BAD";
  console.log(
    `  ${flag} 真实 ${String(wpmTrue).padStart(2)} WPM → 估计 ${String(rn.wpm).padStart(3)}，偏差 ${(errNew * 100).toFixed(0)}%`,
  );
  check(`${wpmTrue} WPM 偏差 <= 30%`, errNew <= 0.3, `实际 ${(errNew * 100).toFixed(0)}%`);
}

console.log("\n=== 2. 同条件对比：修复前后 ===\n");
{
  const a = new WpmEstimator({ windowSeconds: 12 });
  simulate(a, 20, false);
  const ra = a.getEstimate();
  const errA = Math.abs(ra.wpm! - 20) / 20;

  const b = new WpmEstimator({ windowSeconds: 12 });
  simulate(b, 20, true);
  const rb = b.getEstimate();
  const errB = Math.abs(rb.wpm! - 20) / 20;

  console.log(`  朴素（修复前）：${ra.wpm} WPM，偏差 ${(errA * 100).toFixed(0)}%，码元 ${ra.units}`);
  console.log(`  差值（修复后）：${rb.wpm} WPM，偏差 ${(errB * 100).toFixed(0)}%，码元 ${rb.units}`);
  console.log("");
  console.log(`  偏差降低 ${(((errA - errB) / errA) * 100).toFixed(0)}%`);
  console.log(`  码元样本从 ${ra.units} 降到 ${rb.units}（${(ra.units / rb.units).toFixed(0)}倍虚高已消除）`);

  check("修复后偏差 < 修复前", errB < errA, `${(errB * 100).toFixed(0)}% vs ${(errA * 100).toFixed(0)}%`);
  check("修复后偏差 <= 25%", errB <= 0.25, `实际 ${(errB * 100).toFixed(0)}%`);
  check("码元样本不再虚高", rb.units < 1500, `实际 ${rb.units}`);
}

console.log("\n=== 3. 边界情况 ===\n");
{
  const est = new WpmEstimator({ windowSeconds: 12 });
  est.updateRolling("", 0.64, true);
  check("首次调用空文本", true);

  est.updateRolling("CQ DE", 0.64, false);
  check("第二次调用", true);

  est.updateRolling("CQ", 0.64, false);
  check("窗口变短不崩溃", true);

  est.updateRolling("", 0.64, false);
  check("内容变空不崩溃", true);

  est.reset();
  check("reset 清空", est.getEstimate().units === 0);
}

console.log(`\n${"-".repeat(52)}`);
console.log(`结果：${passed} 通过，${failed} 失败`);
if (failed > 0) process.exitCode = 1;
