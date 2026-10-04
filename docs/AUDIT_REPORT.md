# 推送前审计报告

> 审计时间：2026-10-04 16:40
> 范围：`deepcw-integration` 分支全部改动（5 个提交，33 文件，+5549 行）
> 结论：**不建议直接推送**，有 2 个 P0 阻塞项需先修

---

## 一、P0 阻塞项（必须修，否则线上不可用）

### P0-1 · WASM 路径在 GitHub Pages 子目录下 404

**位置**：`src/workers/deepcwWorker.ts:77`

```typescript
ort.env.wasm.wasmPaths = `${self.location.origin}/`;
```

**问题**：这行硬编码了域名根路径。但 GitHub Pages 部署在
`https://lucpaysan.github.io/CW-BY4CWY/` 下，正确的路径是
`https://lucpaysan.github.io/CW-BY4CWY/ort-wasm-simd-threaded.wasm`。

**实测证据**（用本地服务器模拟 Pages 子目录）：

```
/CW-BY4CWY/ 首页              : 200
/ort-wasm-simd-threaded.wasm   : 404← 代码里用的路径
/CW-BY4CWY/ort-wasm-...wasm   : 200   ← 正确路径
/CW-BY4CWY/model_deepcw.onnx  : 200
```

**后果**：线上页面能渲染，但模型加载必然失败（与 `file://` 时的报错同类）。

**注意**：同项目的 `src/utils/inference.ts`（legacy Worker）已经处理了这个问题——
用 `lastIndexOf("/assets/")` 反推base path。DeepCW Worker 应采用同样逻辑。

---

### P0-2 · 模型未纳入版本库，CI 构建时缺失

**位置**：`.gitignore`

```
public/model_deepcw.onnx
```

**问题**：模型 15MB 被排除在 git 之外（这个决定本身是对的，
不应把二进制塞进版本库）。但 `deploy-pages.yml` 的 build 步骤
只执行 `npm ci && npm run build`，**没有下载模型**。

**后果**：Actions 构建出的 `dist/` 不含模型 → 线上加载失败。

**修复**：在 build 前加一步 `bash scripts/fetch-deepcw-model.sh`。
（本次审计已将该步骤写入工作流，但**尚未提交**。）

---

## 二、P1 问题（影响质量，建议修）

### P1-1 · WPM 估计在滚动窗口下偏差 40%

**位置**：`src/workers/deepcwWorker.ts:151`

```typescript
const wpmResult = wpmEstimator.update(decoded.text, audioSeconds);
```

**问题**：每次推理都把**整个窗口**（9-30 秒）的音频时长与文本累加进估计器。
但滚动窗口高度重叠——同一个音频样本会被反复统计。

**实测**（模拟 30 秒实时流，12 秒窗口，20 WPM 报文）：

| 指标 | 结果 |
|---|---|
| 估计 WPM | **28**（真实 20） |
| 偏差 | **+40%** |
| 累计码元 | 7504（真实约 501） |

偏差 40% 意味着：真实 20 WPM 会显示 28，可能触发「超过 45 上限」的误报
（虽然本例不会，但 40 WPM 就会误报超界）。

**修复方向**：估计器应维护「上一帧的累计码元数」，用差值只统计新增部分。

---

### P1-2 · Worker 从不 terminate

**位置**：`src/deepcw/inferenceClient.ts`

`getWorker()` 创建的 Worker 没有任何地方调用 `terminate()`。

**后果**：
- 14MB 模型常驻内存
- 切换标签页（DECODE → ENCODE）时 Worker 仍在后台
- 切换引擎（DeepCW → Legacy → DeepCW）时旧 Worker 依然存活
- 多次切换可能累积多个 Worker 实例

注：`unloadDeepCWModel()` 已实现但从未被调用。

---

### P1-3 · 30 秒窗口 CPU 占用 130%

**实测**（浏览器 WASM，单线程）：

| 窗口 | 推理耗时 | CPU 占用（1.56次/秒）|
|---|---|---|
| 9s | 150 ms | 23% |
| 12s | 218 ms | 34% |
| 18s | 384 ms | 60% |
| **30s** | **829 ms** | **130%** ⚠ |

**后果**：30 秒窗口下单核跑满，会造成界面卡顿。
12 秒及以下无问题。

**建议**：限制 30 秒窗口的可用性，或在UI 上提示「高负载」。

---

### P1-4 · 重切分对真实误识无效，但代码仍占用流水线

`resegmenter.ts` 已确认正确接入 `ctcDecoder.ts`（第 13 行导入、第 93 行调用）。
但端到端实测显示它对 CER 改善为 **0%** —— 因为实测样本是「误识」
（模型已把字母听错），而非「真粘连」。

**现状**：功能可用、无害，但增加了计算开销与代码复杂度。
文档已如实记录（`src/engines/OPTIMIZATION_FINDINGS.md`）。

---

## 三、实测性能数据（浏览器 WASM，单线程）

| 项目 | 数值 |
|---|---|
| 模型加载 | 467 ms |
| 9s 窗口推理 | 150 ms（RTF 0.017）|
| 12s 窗口 | 218 ms（RTF 0.018）|
| 18s 窗口 | 384 ms（RTF 0.021）|
| 30s 窗口 | 829 ms（RTF 0.028）|

RTF 全部 < 0.03，**实时性充足**。原生 onnxruntime 快约 7 倍
（20-122 ms），但浏览器 WASM 已满足需求。

未启用 SIMD 多线程：GitHub Pages 无法设置 COOP/COEP 响应头，
`SharedArrayBuffer` 不可用。

---

## 四、合规检查：通过 ✅

| 项目 | 状态 |
|---|---|
| LICENSE 文件 | AGPL-3.0 全文（673 行）|
| package.json license | AGPL-3.0 ✅ 一致 |
| Cargo.toml license | AGPL-3.0 ✅ 一致 |
| tauri.conf.json copyright | 含 AGPL-3.0 声明 ✅ |
| 21 个 npm 依赖许可 | 全部 MIT / Apache-2.0 / ISC，与 AGPL 兼容 ✅ |
| README 溯源 | 区分 web-deep-cw-decoder（状态存疑）与 deepcw-engine（AGPL-3.0-only）✅ |
| Legacy 模型许可 | **已如实标注存疑**（上游已移除 LICENSE）✅ |

---

## 五、测试与构建状态

| 项目 | 结果 |
|---|---|
| `test:deepcw` | 34/34 通过 |
| `test:reseg` | 21/21 通过 |
| `test:wpm` | 32/32 通过 |
| `test:arb` | 30/30 通过 |
| **合计** | **117/117 通过** |
| TypeScript 类型检查 | 通过 |
| 生产构建 | 通过（dist 64MB）|

---

## 六、死代码：34 个符号未接入生产

其中最值得注意的是**整个 `engineRegistry.ts`（221 行）完全未接入**——
`arbitrate`、`EngineRegistry`、`ENGINE_INFO` 只被测试引用。

其余包括：

| 文件 | 未使用符号 |
|---|---|
| `const.ts` | `NumToChar`、`FFT_SIZE`、`SYNTHETIC_CONFIG` |
| `core/morseEncoder.ts` | `defaultEncoder` |
| `core/phraseLibrary.ts` | `matchPhrase`、`getPhrasesByCategory`、`getRandomPhrase`、`getPracticeSet` |
| `core/syntheticData*.ts` | 6 个（导出与生成函数）|
| `deepcw/config.ts` | `DEEPCW_METADATA_FILE`、`DEEPCW_MIN_RELIABLE_SECONDS`、`DEEPCW_MAX_SECONDS`、`DecoderEngineId` |
| `deepcw/inferenceClient.ts` | `unloadDeepCWModel` |
| `deepcw/spectrogram.ts` | `isSupportedSampleRate` |
| `utils/textDecoder.ts` | `ctcBeamSearchDecode` |

**判断**：这些大多是原项目遗留（合成数据导出、beam search 等教学功能相关），
保留无害。但 `engineRegistry.ts` 是**今天新增却未接入**的，
要么接入要么明确标注为「未来预留」。

---

## 七、修复优先级建议

| 顺序 | 项目 | 工作量 | 必要性 |
|---|---|---|---|
| 1 | **P0-1 WASM 路径** | 15 分钟 | 必须，否则线上不可用 |
| 2 | **P0-2 CI 下载模型** | 5 分钟 | 必须 |
| 3 | P1-1 WPM 差值统计 | 40 分钟 | 建议，影响用户判断 |
| 4 | P1-2 Worker terminate | 20 分钟 | 建议，影响内存 |
| 5 | P1-3 30s 窗口提示 | 20 分钟 | 可选 |
| 6 | engineRegistry 标注 | 10 分钟 | 可选，澄清状态 |

前两项修完即可推送上线，后三项可随后迭代。

---

# 修复记录（2026-10-04 17:10）

全部问题已修复并验证。

## P0-1 WASM 路径 ✅

`deepcwWorker.ts` 抽出 `resolveBasePath()` / `resolveAssetUrl()`，
`wasmPaths` 从 `${origin}/` 改为 `resolveAssetUrl("")`。

验证（本地模拟 Pages 子目录）：

| Worker 路径 | 解析出的 base |
|---|---|
| `/CW-BY4CYW/assets/worker.js` | `/CW-BY4CWY` |
| `/assets/worker.js`（本地）| `""` |
| `/src/workers/worker.ts`（dev）| `""` |

## P0-2 CI 模型下载 ✅

- `deploy-pages.yml`：build 前执行 `fetch-deepcw-model.sh`，
  并新增 `Verify build output` 步骤校验产物完整性
- `build-desktop-mobile.yml`：Windows 与 Android 两个 job 同样补上
  （Windows 需 `shell: bash`）

## P1-1 WPM 偏差 ✅ —— 顺带挖出两个更深的 bug

原始症状：真实 20 WPM 估成 28（+40%），码元样本虚高 15 倍。

### 修复 1：滚动窗口重复统计
新增 `updateRolling()`，维护基线 `rollingBaselineUnits`，
只统计「本次新增的音频」，每个采样点只计一次。

### 修复 2：码元算法错误（更隐蔽）
排查中发现 `countUnits` 用 `code.length`（码元**个数**）代替
键音**时长**，把 dash 当成了 1u：

| 字符 | 真实时长 | 原算法 |
|---|---|---|
| `T` (-)| 3u | 1u |
| `W` (.--)| 7u | 3u |
| `C` (-.-.)| 8u | 7u |

**历史上用一个经验系数 1.4 掩盖这个错误** —— 现在算法本身正确，
`SILENCE_COMPENSATION` 归 1.0。

### 修复 3：合成器空格多算 3u
`cwSynth.ts` 在字符后已加 `charGap(3u)`，空格处又加满`wordGap(7u)`，
实际成了 10u。改为 `(wordGap - charGap) = 4u`。

### 修复效果

| 指标 | 修复前 | 修复后 |
|---|---|---|
| 20 WPM 估计 | 28（+40%） | **20（0%）** |
| 码元样本（45秒）| 12224（虚高 60倍）| 192 |
| countUnits vs 实际音频 | 比值 1.42 | **1.000** |

多速度验证（12/15/20/25/30/40 WPM）偏差均在 0-4%。

## P1-2 Worker 泄漏 ✅

新增 `terminateDeepCWWorker()`，在 `DeepCWPanel` 卸载时调用，
同时清空 `pending` Map 避免引用泄漏。

## P1-3 30 秒窗口提示 ✅

面板在 `windowSeconds >= 30` 时显示「推理约 830ms，CPU 负载较高」。

---

## 测试现状

```
test:deepcw       34 项  ✅
test:reseg        21 项  ✅
test:wpm          32 项  ✅  （断言值随算法修正更新）
test:wpm-rolling  14 项  ✅  （新增）
test:arb          30 项  ✅
─────────────────────────
合计            131 项  全部通过
```

类型检查与生产构建均通过。

## 遗留（非阻塞）

- `engineRegistry.ts`（221 行）仍未接入生产，仅测试引用。
  建议接入或标注为「未来预留」
- 34 个符号未接入生产，多数为原项目遗留（合成数据导出、beam search）
