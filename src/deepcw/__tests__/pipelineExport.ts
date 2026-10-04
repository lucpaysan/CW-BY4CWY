/**
 * 端到端验证：粘连场景在接入重切分后的实际改善
 *
 * 用 Q2 实验中「字符间隔过小」的真实失败样本，
 * 对比重切分前后的 CER。
 */
import { audioToDeepCWSpectrogram } from "../spectrogram.ts";
import { synthCW, MACHINE_TIMING, type SynthOptions } from "./cwSynth.ts";
import * as fs from "node:fs";
import * as path from "node:path";

const outDir = process.argv[3] ?? "/tmp/dc_pipeline";

fs.mkdirSync(outDir, { recursive: true });

// 粘连场景：字符间隔过小
const GLUED_TIMING = {
  unit: 0.06,
  dashRatio: 3,
  symbolGap: 1,
  charGap: 1.2,  // 远小于标准的 3
  wordGap: 4,
};

const CASES: { name: string; text: string; opts: SynthOptions }[] = [
  { name: "粘连-CQ DE BY4CWY", text: "CQ DE BY4CWY", opts: { wpm: 20, toneHz: 700, timing: GLUED_TIMING, jitter: 0.15, seed: 11 } },
  { name: "粘连-UR RST 579 QSL", text: "UR RST 579 QSL", opts: { wpm: 20, toneHz: 700, timing: GLUED_TIMING, jitter: 0.15, seed: 11 } },
  { name: "粘连-BY4CWY DE BG1ABC", text: "BY4CWY DE BG1ABC", opts: { wpm: 18, toneHz: 650, timing: GLUED_TIMING, jitter: 0.15, seed: 11 } },
  { name: "粘连-CQ CQ DE BY4CWY K", text: "CQ CQ DE BY4CWY K", opts: { wpm: 20, toneHz: 700, timing: GLUED_TIMING, jitter: 0.2, seed: 22 } },
  // 对照组：标准间距，应保持不变
  { name: "标准-CQ DE BY4CWY", text: "CQ DE BY4CWY", opts: { wpm: 20, toneHz: 700, timing: MACHINE_TIMING } },
  { name: "标准-BY4CWY DE BG1ABC", text: "BY4CWY DE BG1ABC", opts: { wpm: 20, toneHz: 700, timing: MACHINE_TIMING } },
  { name: "标准-QTH SHANGHAI", text: "QTH SHANGHAI", opts: { wpm: 20, toneHz: 700, timing: MACHINE_TIMING } },
];

const manifest = CASES.map((c, idx) => {
  const audio = synthCW(c.text, c.opts);
  const spec = audioToDeepCWSpectrogram(audio);
  if (spec) {
    fs.writeFileSync(path.join(outDir, `p${idx}.spec.f32`), Buffer.from(spec.data.buffer));
  }
  return {
    index: idx,
    name: c.name,
    text: c.text,
    dims: spec?.dims ?? null,
    durationSec: audio.length / 3200,
  };
});

fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`已导出 ${manifest.length} 个用例（含对照组）`);
console.log("接着运行：python run_pipeline.py");
