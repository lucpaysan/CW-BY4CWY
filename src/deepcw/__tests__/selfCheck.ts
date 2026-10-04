/**
 * DeepCW 模块自检
 *
 * 无需浏览器环境，用 Node 直接运行：
 *   node --experimental-strip-types src/deepcw/__tests__/selfCheck.ts
 *
 * 验证内容：
 *   1. bin 区间推导正确（32..97 = 65 bins）
 *   2. 频谱张量形状与参考实现一致 [1,1,T,65]
 *   3. 合成 CW 音频的频谱在信号频带内有明显能量
 *   4. 缩写还原规则正确
 *   5. QSO 要素提取正确
 */
import { audioToDeepCWSpectrogram, resampleToTarget } from "../spectrogram.ts";
import {
  DEEPCW_FREQ_BINS,
  DEEPCW_START_BIN,
  DEEPCW_STOP_BIN,
  DEEPCW_HOP_LENGTH,
  DEEPCW_FFT_LENGTH,
  DEEPCW_SAMPLE_RATE,
} from "../config.ts";
import { expandAbbreviations, extractQSOElements } from "../abbrevExpander.ts";

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

/** 合成一段 CW 音频用于测试 */
function synthesize(text: string, wpm = 20, toneHz = 700, fs = 3200): Float32Array {
  const MORSE: Record<string, string> = {
    C: "-.-.", Q: "--.-", D: "-..", E: ".", B: "-...", Y: "-.--",
    "4": "....-", W: ".--", "7": "--...", "3": "...--", S: "...",
    O: "---", K: "-.-", T: "-", R: ".-.", A: ".-", N: "-.",
  };
  const unit = 1.2 / wpm;
  const out: number[] = [];

  for (const ch of text.toUpperCase()) {
    if (ch === " ") {
      out.push(...new Array(Math.floor(fs * unit * 7)).fill(0));
      continue;
    }
    const code = MORSE[ch];
    if (!code) continue;
    for (let i = 0; i < code.length; i++) {
      const n = Math.floor(fs * unit * (code[i] === "-" ? 3 : 1));
      for (let k = 0; k < n; k++) {
        out.push(0.5 * Math.sin((2 * Math.PI * toneHz * k) / fs));
      }
      if (i < code.length - 1) {
        out.push(...new Array(Math.floor(fs * unit)).fill(0));
      }
    }
    out.push(...new Array(Math.floor(fs * unit * 3)).fill(0));
  }

  return new Float32Array(out);
}

console.log("=== 1. 配置参数 ===");
check(
  "bin区间为 32..97",
  DEEPCW_START_BIN === 32 && DEEPCW_STOP_BIN === 97,
  `实际 ${DEEPCW_START_BIN}..${DEEPCW_STOP_BIN}`,
);
check("频带宽度为 65 bins", DEEPCW_STOP_BIN - DEEPCW_START_BIN === DEEPCW_FREQ_BINS);
check("hop_length = 48", DEEPCW_HOP_LENGTH === 48);
check("fft_length = 256", DEEPCW_FFT_LENGTH === 256);
check("采样率 = 3200", DEEPCW_SAMPLE_RATE === 3200);

console.log("\n=== 2. 频谱张量形状 ===");
{
  // 1秒音频：pad=128，padded=3200+256=3456，
  // frames = 1 + floor((3456 - 256) / 48) = 67
  const oneSecond = new Float32Array(3200);
  const spec = audioToDeepCWSpectrogram(oneSecond);
  const expectedFrames = 1 + Math.floor((3200 + 256 - 256) / 48);
  check("产出张量", spec !== null);
  if (spec) {
    check(
      "维度为 [1,1,T,65]",
      spec.dims.length === 4 &&
        spec.dims[0] === 1 &&
        spec.dims[1] === 1 &&
        spec.dims[3] === DEEPCW_FREQ_BINS,
      JSON.stringify(spec.dims),
    );
    check(
      `帧数正确（期望 ${expectedFrames}）`,
      spec.timeSteps === expectedFrames,
      `实际 ${spec.timeSteps}`,
    );
    check(
      "数据长度 = 帧数 x 65",
      spec.data.length === spec.timeSteps * DEEPCW_FREQ_BINS,
    );
  }
}

console.log("\n=== 3. 音频过短时返回 null ===");
{
  const tooShort = new Float32Array(100);
  check("返回 null", audioToDeepCWSpectrogram(tooShort) === null);
}

console.log("\n=== 4. 频谱能量分布（700Hz 正弦）===");
{
  const audio = synthesize("E", 20, 700);
  const spec = audioToDeepCWSpectrogram(audio);
  check("产出张量", spec !== null);
  if (spec) {
    // 找信号最强的一帧（跳过首尾填充区）
    let bestFrame = 0;
    let bestEnergy = -Infinity;
    const energyOf = (frame: number) => {
      let sum = 0;
      const off = frame * DEEPCW_FREQ_BINS;
      for (let b = 0; b < DEEPCW_FREQ_BINS; b++) sum += spec.data[off + b];
      return sum;
    };
    for (let f = 2; f < spec.timeSteps - 2; f++) {
      const e = energyOf(f);
      if (e > bestEnergy) {
        bestEnergy = e;
        bestFrame = f;
      }
    }

    const offset = bestFrame * DEEPCW_FREQ_BINS;

    // 700Hz 落在 bin 56，对应 65 bins 中的索引 56-32=24
    const targetLocal = Math.round(700 / 12.5) - DEEPCW_START_BIN;
    const atTarget = spec.data[offset + targetLocal];

    // 取目标附近 ±3 bins 的均值，与远离信号处的均值比较
    let nearSum = 0;
    let nearCount = 0;
    for (let b = targetLocal - 3; b <= targetLocal + 3; b++) {
      if (b >= 0 && b < DEEPCW_FREQ_BINS) {
        nearSum += spec.data[offset + b];
        nearCount++;
      }
    }
    const nearMean = nearSum / nearCount;

    // 远离信号的区域（bins 0-8 对应 400-500Hz，以及 56-64 对应 1100-1200Hz）
    let farSum = 0;
    let farCount = 0;
    for (const b of [0, 1, 2, 3, 4, 5, 6, 7, 8, 56, 57, 58, 59, 60, 61, 62, 63, 64]) {
      farSum += spec.data[offset + b];
      farCount++;
    }
    const farMean = farSum / farCount;

    check(
      `700Hz 处能量显著（${atTarget.toFixed(2)}）`,
      atTarget > 1.0,
      `实际 ${atTarget.toFixed(3)}`,
    );
    check(
      "信号附近能量远高于远端",
      nearMean > farMean * 2,
      `附近均值 ${nearMean.toFixed(2)} vs 远端均值 ${farMean.toFixed(2)}`,
    );
  }
}

console.log("\n=== 5. 缩放不变性 ===");
{
  const audio = synthesize("SOS", 20, 700);
  const scale = (arr: Float32Array, k: number) => {
    const out = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) out[i] = arr[i] * k;
    return out;
  };

  const sQuiet = audioToDeepCWSpectrogram(scale(audio, 0.1));
  const sLoud = audioToDeepCWSpectrogram(scale(audio, 2.0));

  if (sQuiet && sLoud) {
    let diff = 0;
    let nanCount = 0;
    const n = Math.min(sQuiet.data.length, sLoud.data.length);
    for (let i = 0; i < n; i++) {
      if (Number.isNaN(sQuiet.data[i]) || Number.isNaN(sLoud.data[i])) nanCount++;
      diff += Math.abs(sQuiet.data[i] - sLoud.data[i]);
    }
    check("频谱无 NaN", nanCount === 0, `发现 ${nanCount} 个 NaN`);

    const meanDiff = diff / n;
    // log1p 压缩后，增益 20 倍对应的 log 差异约 log(21)≈3.0
    check(
      "不同增益下频谱平均差异在合理范围（<4.0）",
      meanDiff < 4.0,
      `实际 ${meanDiff.toFixed(4)}`,
    );
  }
}

console.log("\n=== 5b. 极短音频不产生 NaN（边界回归）===");
{
  // padReflect 曾因越界读取产生 NaN，这里覆盖临界长度
  const boundaryLengths = [3, 4, 5, 129, 130, 131, 200];
  let bad = 0;
  for (const len of boundaryLengths) {
    const tiny = new Float32Array(len);
    for (let i = 0; i < len; i++) tiny[i] = Math.sin(i * 0.1);
    const s = audioToDeepCWSpectrogram(tiny);
    if (!s) continue;
    for (let i = 0; i < s.data.length; i++) {
      if (Number.isNaN(s.data[i])) {
        bad++;
        break;
      }
    }
  }
  check("极短音频不产生 NaN", bad === 0, `${bad}/${boundaryLengths.length} 个长度异常`);
}

console.log("\n=== 5c. 缓冲区复用不污染（FFT 状态回归）===");
{
  // FFT.transform 会原地做位反转交换，若复用同一 buffer 传入上一帧输出，
  // 误差会累积，约 37 帧后溢出为 NaN。此处验证长音频全程无 NaN。
  const long = synthesize("CQ DE BY4CWY BY4CWY K", 20, 700);
  const spec = audioToDeepCWSpectrogram(long);

  check("长音频帧数充足（>60）", (spec?.timeSteps ?? 0) > 60, `${spec?.timeSteps}`);

  let nanCount = 0;
  if (spec) {
    for (let i = 0; i < spec.data.length; i++) {
      if (Number.isNaN(spec.data[i])) nanCount++;
    }
  }
  check("长音频全程无 NaN", nanCount === 0, `发现 ${nanCount} 个 NaN`);

  // 分块处理与整体处理应一致，验证 FFT 无跨调用状态残留。
  //
  // 预期差异：partA 的最后 3 帧。其 FFT 窗口跨越分块边界，
  // 分块时读到的是块尾数据 + 镜像填充，整体处理时读到的是真实后续数据。
  // 这是频谱计算的固有边界效应，不是状态残留，故只比较内部帧。
  if (spec) {
    const half = Math.floor(long.length / 2);
    const partA = audioToDeepCWSpectrogram(long.slice(0, half));
    const partB = audioToDeepCWSpectrogram(long);
    if (partA && partB) {
      let mismatch = 0;
      let maxDiff = 0;
      let compared = 0;
      // 跳过前 2 帧（起始镜像填充）和末尾 3 帧（跨块边界）
      const startFrame = 2;
      const endFrame = Math.min(partA.timeSteps, partB.timeSteps) - 3;
      for (let f = startFrame; f < endFrame; f++) {
        const off = f * DEEPCW_FREQ_BINS;
        for (let b = 0; b < DEEPCW_FREQ_BINS; b++) {
          const d = Math.abs(partA.data[off + b] - partB.data[off + b]);
          compared++;
          if (d > 1e-6) mismatch++;
          if (d > maxDiff) maxDiff = d;
        }
      }
      check(
        "内部帧与整体处理完全一致（无 FFT 状态残留）",
        mismatch === 0 && compared > 0,
        `${mismatch}/${compared} 点不一致，最大差异 ${maxDiff.toExponential(2)}`,
      );
    }
  }
}

console.log("\n=== 6. 重采样 ===");
{
  const original = synthesize("SOS", 20, 700, 3200);
  check("同采样率直接返回", resampleToTarget(original, 3200) === original);

  const upsampled = resampleToTarget(original, 1600, 3200);
  check("上采样长度正确", Math.abs(upsampled.length - original.length * 2) <= 2, `${upsampled.length}`);
}

console.log("\n=== 7. 缩写还原 ===");
{
  const cases: [string, string][] = [
    ["AR", "AR"],
    ["SK", "SK"],
    ["KN", "KN"],
    ["CQ DE BY4CWY K", "CQ DE BY4CWY K"],
    ["os", "73"],
    ["73", "73"],
    ["", ""],
  ];
  for (const [input, expected] of cases) {
    const got = expandAbbreviations(input);
    check(`'${input}' -> '${expected}'`, got === expected, `实际 '${got}'`);
  }

  check("重复压缩（SSS->SS）", expandAbbreviations("SSSS") === "SS", expandAbbreviations("SSSS"));
  check("保留双写（SK）", expandAbbreviations("SK") === "SK");
}

console.log("\n=== 8. QSO 要素提取 ===");
{
  const el = extractQSOElements("CQ DE BY4CWY BY4CWY K");
  check("提取到呼号 BY4CWY", el.callsigns.includes("BY4CWY"), JSON.stringify(el.callsigns));

  const el2 = extractQSOElements("RST 599 QTH SHANGHAI");
  check("提取到信号报告 599", el2.reports.includes("599"), JSON.stringify(el2.reports));

  const el3 = extractQSOElements("UR RST 579 QSL QTH BEIJING");
  check("提取到 Q 码 QTH", el3.qcodes.includes("QTH"), JSON.stringify(el3.qcodes));
  check("CQ 不被误判为呼号", !el3.callsigns.includes("CQ"), JSON.stringify(el3.callsigns));
}

console.log("\n" + "=".repeat(50));
console.log(`结果：${passed} 通过，${failed} 失败`);
if (failed > 0) {
  process.exitCode = 1;
}
