/**
 * 端到端验证：TypeScript 频谱预处理 → Python 参考实现 → ONNX 推理
 *
 * 目的是验证 TS 侧产出的频谱张量与官方参考实现逐值一致，
 * 确保移植正确（而不是只验证形状）。
 *
 * 运行方式见配套脚本 verify-e2e.sh
 */
import { audioToDeepCWSpectrogram } from "../spectrogram.ts";
import { DEEPCW_SAMPLE_RATE } from "../config.ts";
import * as fs from "node:fs";

const MORSE: Record<string, string> = {
  C: "-.-.", Q: "--.-", D: "-..", E: ".", B: "-...", Y: "-.--",
  "4": "....-", W: ".--", "7": "--...", "3": "...--", S: "...",
  O: "---", K: "-.-", T: "-", R: ".-.", A: ".-", N: "-.",
};

/** 标准 CW 合成：符号间隔 1u，字符间隔 3u，单词间隔 7u */
function synthesize(text: string, wpm = 20, toneHz = 700, fs = DEEPCW_SAMPLE_RATE): Float32Array {
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

const TEST_CASES: { text: string; wpm: number; tone: number }[] = [
  { text: "CQ DE BY4CWY", wpm: 20, tone: 700 },
  { text: "SOS", wpm: 15, tone: 600 },
  { text: "73", wpm: 25, tone: 900 },
  { text: "RST 599", wpm: 18, tone: 750 },
];

const outDir = process.argv[2] ?? "/tmp/deepcw_e2e";
fs.mkdirSync(outDir, { recursive: true });

const manifest: unknown[] = [];

for (const tc of TEST_CASES) {
  const audio = synthesize(tc.text, tc.wpm, tc.tone);
  const spec = audioToDeepCWSpectrogram(audio);

  if (!spec) {
    console.error(`[FAIL] ${tc.text}: 频谱为 null`);
    process.exitCode = 1;
    continue;
  }

  // 导出原始音频供Python 侧复现
  const audioPath = `${outDir}/${tc.text.replace(/\s+/g, "_")}.f32`;
  const specPath = `${outDir}/${tc.text.replace(/\s+/g, "_")}.spec.f32`;

  fs.writeFileSync(audioPath, Buffer.from(audio.buffer));
  fs.writeFileSync(specPath, Buffer.from(spec.data.buffer));

  manifest.push({
    text: tc.text,
    wpm: tc.wpm,
    tone: tc.tone,
    audioPath,
    specPath,
    audioLength: audio.length,
    timeSteps: spec.timeSteps,
    dims: spec.dims,
  });

  console.log(
    `[OK] ${tc.text.padEnd(14)} ${tc.wpm}wpm ${tc.tone}Hz  ` +
      `音频${audio.length}采样  帧数${spec.timeSteps}  dims=[${spec.dims.join(",")}]`,
  );
}

fs.writeFileSync(`${outDir}/manifest.json`, JSON.stringify(manifest, null, 2));
console.log(`\n清单已写入 ${outDir}/manifest.json`);
