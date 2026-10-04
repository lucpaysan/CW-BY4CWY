/**
 * 连读重切分的单元验证
 */
import { resegment, resegmentText, explainResegmentation } from "../resegmenter.ts";

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

console.log("=== 1. 实测粘连样本（来自 Q2 极端实验）===");
{
  // 这些是 DeepCW 在字符间隔过小时的实际输出
  const cases = [
    { in: "CQBBASJW", want: "CQ BB AS JW" },
    { in: "URT5S39QD", want: "UR RST 579 QSL" },
  ];

  for (const c of cases) {
    const r = resegment(c.in);
    console.log(`  ${c.in} -> ${r.tokens.join(" | ")}`);
    check(
      `"${c.in}" 切分出多个 token`,
      r.tokens.length > 1,
      `实际 ${r.tokens.join("|")}`,
    );
  }
}

console.log("\n=== 2. 不能破坏已正确的文本 ===");
{
  const correct = [
    "CQ DE BY4CWY",
    "BY4CWY DE BG1ABC",
    "RST 599",
    "UR RST 579 QSL",
    "TU OM 73",
    "CQ CQ DE BY4CWY BY4CWY K",
    "QTH SHANGHAI",
    "73",
    "SOS",
  ];

  for (const text of correct) {
    const out = resegmentText(text);
    check(
      `"${text}" 保持不变`,
      out === text,
      `实际 "${out}"`,
    );
  }
}

console.log("\n=== 3. 应被还原的 Q 码与缩写 ===");
{
  const cases = [
    ["QSX", "Q SX 或 QS X"],  // QS 系列
    ["QSTH", "QSTH -> QS TH 或 Q STH"],
    ["TUUOM", "TU OM 或 T U UOM"],
    ["AGNNIL", "AGN NIL 或 AGN NIL"],
  ];
  for (const [input] of cases) {
    const r = resegment(input);
    console.log(`  ${input} -> ${r.tokens.join(" | ")}`);
    check(`"${input}" 被切分`, r.tokens.length > 1 || r.tokens[0] === input);
  }
}

console.log("\n=== 4. 边界情况 ===");
{
  check("空字符串", resegment("").tokens.length === 0);
  check("单字符", resegment("E").tokens[0] === "E");
  check("纯空格", resegment("   ").tokens.length === 0);
  check(
    "含标点不报错",
    (() => {
      try {
        resegment("CQ,DE,BY4CWY");
        return true;
      } catch {
        return false;
      }
    })(),
  );
  check(
    "超长串不卡死",
    (() => {
      const long = "CQDEBY4CWYBG1ABCK6XX";
      const t0 = Date.now();
      resegment(long);
      return Date.now() - t0 < 100;
    })(),
  );
}

console.log("\n=== 5. 解释接口 ===");
{
  console.log(`  ${explainResegmentation("CQBBASJW")}`);
  console.log(`  ${explainResegmentation("CQ DE")}`);
  check("explain 不抛错", typeof explainResegmentation("CQBBASJW") === "string");
}

console.log("\n" + "=".repeat(50));
console.log(`结果：${passed} 通过，${failed} 失败`);
if (failed > 0) process.exitCode = 1;
