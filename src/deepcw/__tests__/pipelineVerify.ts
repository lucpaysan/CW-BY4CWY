/**
 * 流水线验证：把 raw_results.json 里的模型输出送入 TS 重切分，看 CER 改善。
 */
import { readFileSync } from "node:fs";
import { resegmentText } from "../resegmenter.ts";

function lev(a: string, b: string): number {
  const prev = new Array(b.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur.push(
        Math.min(
          prev[j] + 1,
          cur[j - 1] + 1,
          prev[j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0),
        ),
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

const norm = (s: string) => s.replace(/\s+/g, "").trim();

const raw = JSON.parse(readFileSync(process.argv[2], "utf8")) as {
  name: string;
  text: string;
  raw: string;
  cer: number;
}[];

console.log("=".repeat(84));
console.log("重切分介入后的 CER 变化");
console.log("=".repeat(84));
console.log(
  `${"用例".padEnd(26)}${"重切分前".padEnd(20)}${"重切分后".padEnd(20)}改善`,
);
console.log("-".repeat(84));

let glueBefore = 0, glueAfter = 0, glueN = 0;
let stdBefore = 0, stdAfter = 0, stdN = 0;

for (const r of raw) {
  // 注意：resegmentText 接收的是**带空格**的原始输出。
  // 若先 norm()（去空格）再传入，粘连段会被整体当作一个 segment，
  // 结果看起来"没有改善"—— 那是验证脚本的错，不是模块的错。
  const before = norm(r.raw);
  const after = norm(resegmentText(r.raw));
  const ref = norm(r.text);

  const cerBefore = lev(before, ref) / Math.max(1, ref.length);
  const cerAfter = lev(after, ref) / Math.max(1, ref.length);

  const isGlue = r.name.startsWith("粘连");
  if (isGlue) {
    glueBefore += cerBefore; glueAfter += cerAfter; glueN++;
  } else {
    stdBefore += cerBefore; stdAfter += cerAfter; stdN++;
  }

  const delta = cerBefore - cerAfter;
  const mark: string =
    delta > 0.001
      ? `↓${(delta * 100).toFixed(0)}%`
      : delta < -0.001
        ? `↑${(-delta * 100).toFixed(0)}%`
        : "—";

  console.log(
    r.name.padEnd(26) +
      `${before}`.padEnd(20) +
      `${after}`.padEnd(20) +
      mark,
  );
}

console.log("-".repeat(84));
if (glueN) {
  console.log(
    `粘连场景平均 CER：${(glueBefore / glueN * 100).toFixed(1)}% → ${(glueAfter / glueN * 100).toFixed(1)}%` +
      `  （相对下降 ${((1 - glueAfter / Math.max(glueBefore, 1e-9)) * 100).toFixed(0)}%）`,
  );
}
if (stdN) {
  console.log(
    `标准场景平均 CER：${(stdBefore / stdN * 100).toFixed(1)}% → ${(stdAfter / stdN * 100).toFixed(1)}%` +
      `  ${stdAfter <= stdBefore ? "（无退化）" : "⚠ 出现退化"}`,
  );
}
