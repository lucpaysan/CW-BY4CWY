/**
 * Q2 追加压测：更极端的人工手法
 *
 * 上一轮 53/53 全对，说明模型鲁棒性很强。但我的抖动可能还不够接近
 * 真实-world。以下加大强度：
 *   - 极端抖动（0.6~0.9）
 *   - 严重失衡的时序比例
 *   - 极低SNR（-9 ~ -12 dB）
 *   - 快速衰落/频偏漂移
 *   - 组合极端条件
 */
import { MACHINE_TIMING, exportCases, type SynthOptions } from "./cwSynth.ts";

const outDir = process.argv[2] ?? "/tmp/dc_q2_stress";
const t = MACHINE_TIMING;

const cases: { name: string; text: string; opts: SynthOptions }[] = [];
const TEXT = "CQ DE BY4CWY";
const TEXT2 = "UR RST 579 QSL";

// 极端抖动
for (const j of [0.5, 0.6, 0.7, 0.8, 0.9]) {
  cases.push({
    name: `极压-抖动${j}-${TEXT}`,
    text: TEXT,
    opts: { wpm: 20, toneHz: 700, timing: t, jitter: j, seed: 101 },
  });
}

// 严重时序失衡（模拟很差的手法）
const BAD_TIMING: { label: string; timing: typeof MACHINE_TIMING }[] = [
  { label: "符号间隔几乎为0", timing: { unit: 0.06, dashRatio: 3, symbolGap: 0.2, charGap: 1.5, wordGap: 4 } },
  { label: "字符间隔过小", timing: { unit: 0.06, dashRatio: 3, symbolGap: 1, charGap: 1.2, wordGap: 3 } },
  { label: "dash极短(2.0)", timing: { unit: 0.06, dashRatio: 2.0, symbolGap: 1, charGap: 3, wordGap: 7 } },
  { label: "dash极长(5.0)", timing: { unit: 0.06, dashRatio: 5.0, symbolGap: 1, charGap: 3, wordGap: 7 } },
  { label: "整体偏慢(unit0.09)", timing: { unit: 0.09, dashRatio: 3, symbolGap: 1, charGap: 3, wordGap: 7 } },
  { label: "整体偏快(unit0.035)", timing: { unit: 0.035, dashRatio: 3, symbolGap: 1, charGap: 3, wordGap: 7 } },
];
for (const { label, timing } of BAD_TIMING) {
  for (const text of [TEXT, TEXT2]) {
    cases.push({
      name: `${label}-${text}`,
      text,
      opts: { wpm: 20, toneHz: 700, timing, jitter: 0.2, seed: 202 },
    });
  }
}

// 极低 SNR
for (const snr of [-6, -8, -9, -10, -12]) {
  for (const text of [TEXT, TEXT2]) {
    cases.push({
      name: `极低SNR${snr}dB-${text}`,
      text,
      opts: { wpm: 20, toneHz: 700, timing: t, jitter: 0.3, snrDb: snr, seed: 303 },
    });
  }
}

// 频率漂移（收信机未对准 / 频偏）
for (const drift of [50, 100, 150, 200]) {
  cases.push({
    name: `频偏±${drift}Hz-${TEXT}`,
    text: TEXT,
    opts: { wpm: 20, toneHz: 700, timing: t, jitter: 0.2, driftHz: drift, seed: 404 },
  });
}

// 极慢 / 极快
for (const wpm of [5, 6, 8, 40, 45, 50]) {
  cases.push({
    name: `速度${wpm}wpm-${TEXT}`,
    text: TEXT,
    opts: { wpm, toneHz: 700, timing: t, jitter: 0.2, seed: 505 },
  });
}

// 基频边缘（频带边界 400/1200Hz 附近）
for (const tone of [400, 420, 450, 1000, 1100, 1180, 1200]) {
  cases.push({
    name: `基频边缘${tone}Hz-${TEXT}`,
    text: TEXT,
    opts: { wpm: 20, toneHz: tone, timing: t, jitter: 0.2, seed: 606 },
  });
}

// 组合极端：强抖动 + 低 SNR + 频偏 + 慢速（最恶劣）
for (const [j, snr, drift, wpm] of [
  [0.5, -3, 80, 15],
  [0.6, -6, 100, 12],
  [0.7, -3, 120, 18],
  [0.5, 0, 50, 25],
]) {
  cases.push({
    name: `组合jitter${j}+${snr}dB+${drift}Hz+${wpm}wpm`,
    text: TEXT,
    opts: { wpm, toneHz: 700, timing: t, jitter: j, snrDb: snr, driftHz: drift, seed: 707 },
  });
}

// 多句长文本（考察长上下文稳定性，人工发报会累积漂移）
cases.push({
  name: "长句-10词",
  text: "CQ CQ DE BY4CWY BY4CWY K UR RST 599 QTH SHANGHAI NAME LUC HPE 73",
  opts: { wpm: 20, toneHz: 700, timing: t, jitter: 0.3, seed: 808 },
});
cases.push({
  name: "长句-10词-强抖动",
  text: "CQ CQ DE BY4CWY BY4CWY K UR RST 599 QTH SHANGHAI NAME LUC HPE 73",
  opts: { wpm: 18, toneHz: 680, timing: t, jitter: 0.5, seed: 909 },
});

const manifest = exportCases(cases, outDir);
console.log(`已生成 ${manifest.length} 个极端用例`);
