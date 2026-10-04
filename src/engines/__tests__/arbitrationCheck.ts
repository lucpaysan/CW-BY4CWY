/**
 * 仲裁逻辑验证
 *
 * 用实测数据验证：两引擎不一致时，仲裁能否选出更好的那个。
 */
import { arbitrate, EngineRegistry, ENGINE_INFO, type EngineResult } from "../engineRegistry.ts";

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

/** 构造一个引擎结果 */
function mk(
  engine: "deepcw" | "cwformer",
  text: string,
  opts: { conf?: number; callsigns?: string[]; reports?: string[]; qcodes?: string[] } = {},
): EngineResult {
  return {
    engine,
    text,
    raw: text,
    confidence: opts.conf ?? 0.7,
    callsigns: opts.callsigns ?? [],
    reports: opts.reports ?? [],
    qcodes: opts.qcodes ?? [],
    elapsedMs: 100,
  };
}

console.log("=== 1. 单引擎（另一方无输出）===");
{
  const r = arbitrate([mk("deepcw", "CQ DE BY4CWY")]);
  check("单一结果直接采用", r.text === "CQ DE BY4CWY" && r.source === "deepcw");
  check("一致度为 0", r.agreement === 0);
}

console.log("\n=== 2. 两引擎一致（忽略空格）===");
{
  const r = arbitrate([
    mk("deepcw", "CQ DE BY4CWY"),
    mk("cwformer", "CQ DE BY4CWY"),
  ]);
  check("一致时标记 consensus", r.source === "consensus", `实际 ${r.source}`);
  check("一致度为 1", r.agreement === 1);
}

console.log("\n=== 3. 空格差异也算一致 ===");
{
  const r = arbitrate([
    mk("deepcw", "CQ DE BY4CWY"),
    mk("cwformer", "CQDEBY4CWY"),
  ]);
  check("空格差异视为一致", r.source === "consensus", `实际 ${r.source}`);
}

console.log("\n=== 4. 都不为空 ===");
{
  const r = arbitrate([]);
  check("空输入返回 none", r.source === "none" && r.text === "");

  const r2 = arbitrate([mk("deepcw", ""), mk("cwformer", "")]);
  check("双方都空返回 none", r2.source === "none");
}

console.log("\n=== 5. 结构化信号仲裁（实测场景）===");
{
  // 实测：DeepCW 把 BY4CWY 听成 B3ASJW（无呼号结构）
  //       CWformer 听成 YVCWY DE D1D（也乱，但提取到什么）
  const r = arbitrate([
    mk("deepcw", "B3ASJW B BJC", { callsigns: [], conf: 0.6 }),
    mk("cwformer", "YVCWY DE D1D", { callsigns: ["D1D"], reports: [], conf: 0.55 }),
  ]);
  check(
    "有呼号结构的一方胜出",
    r.source === "cwformer",
    `实际 ${r.source}`,
  );

  const r2 = arbitrate([
    mk("deepcw", "CQ B BASJW", { conf: 0.6 }),
    mk("cwformer", "QBB YVCW", { conf: 0.6 }),
  ]);
  check(
    "结构相同则取置信度（相等取前者）",
    r2.source === "deepcw",
    `实际 ${r2.source}`,
  );

  const r3 = arbitrate([
    mk("deepcw", "CQ B BASJW", { conf: 0.5 }),
    mk("cwformer", "QBB YVCW", { conf: 0.8 }),
  ]);
  check("置信度高的一方胜出", r3.source === "cwformer", `实际 ${r3.source}`);
}

console.log("\n=== 6. Q 码与报告的权重 ===");
{
  const r = arbitrate([
    mk("deepcw", "XYZ", { qcodes: [], reports: [] }),
    mk("cwformer", "QSL 599", { qcodes: ["QSL"], reports: ["599"] }),
  ]);
  check(
    "Q 码+报告的一方胜出",
    r.source === "cwformer",
    `实际 ${r.source}`,
  );

  const r2 = arbitrate([
    mk("deepcw", "ABC", { callsigns: ["ABC"] }),
    mk("cwformer", "QSL 599", { qcodes: ["QSL"], reports: ["599"] }),
  ]);
  check(
    "呼号权重高于 Q 码+报告",
    r2.source === "deepcw",
    `实际 ${r2.source}`,
  );
}

console.log("\n=== 7. 一致度指标 ===");
{
  const r = arbitrate([
    mk("deepcw", "CQ DE BY4CWY"),
    mk("cwformer", "XY DE ZZZZZ"),
  ]);
  check("完全不同的开头一致度接近 0", r.agreement < 0.3, `实际 ${r.agreement.toFixed(2)}`);

  const r2 = arbitrate([
    mk("deepcw", "CQ DE BY4CWY"),
    mk("cwformer", "CQ DE BG1ABC"),
  ]);
  // CQDEBY4CWY vs CQDEBG1ABC -> 公共前缀 "CQDEB" 共 5 字/ 10 字 = 0.5
  check("前5字符相同一致度约 0.5", r2.agreement >= 0.5, `实际 ${r2.agreement.toFixed(2)}`);
}

console.log("\n=== 8. 引擎健康与降级 ===");
{
  const reg = new EngineRegistry(["deepcw", "cwformer"]);

  check("初始均未加载", !reg.get("deepcw").loaded);
  check("初始均未禁用", !reg.get("deepcw").disabled);

  reg.markLoaded("deepcw");
  check("标记已加载", reg.get("deepcw").loaded);

  // 连续失败 3 次应禁用
  check("第1次失败不降级", reg.markFailed("deepcw") === false);
  check("第2次失败不降级", reg.markFailed("deepcw") === false);
  check("第3次失败触发降级", reg.markFailed("deepcw") === true);
  check("已标记禁用", reg.get("deepcw").disabled);

  // 可用列表应排除禁用的
  const avail = reg.available(["deepcw", "cwformer"]);
  check("可用列表排除禁用引擎", !avail.includes("deepcw"), JSON.stringify(avail));
  check("可用列表保留正常引擎", avail.includes("cwformer"));

  // 成功后重置失败计数
  reg.markLoaded("cwformer");
  reg.markFailed("cwformer");
  reg.markSuccess("cwformer");
  check("成功后失败计数归零", reg.get("cwformer").consecutiveFailures === 0);

  console.log("  " + reg.describe().join("\n  "));
}

console.log("\n=== 9. 引擎元信息 ===");
{
  check("DeepCW 许可为 AGPL", ENGINE_INFO.deepcw.license === "AGPL-3.0");
  check("CWformer 许可为 MIT", ENGINE_INFO.cwformer.license === "MIT");
  check("DeepCW 采样率 3200", ENGINE_INFO.deepcw.sampleRate === 3200);
  check("CWformer 采样率 16000", ENGINE_INFO.cwformer.sampleRate === 16000);
  check("仅 CWformer 含缩写词表", ENGINE_INFO.cwformer.hasProsigns && !ENGINE_INFO.deepcw.hasProsigns);
  check("仅 CWformer 是流式", ENGINE_INFO.cwformer.streaming && !ENGINE_INFO.deepcw.streaming);
}

console.log("\n" + "=".repeat(50));
console.log(`结果：${passed} 通过，${failed} 失败`);
if (failed > 0) process.exitCode = 1;
