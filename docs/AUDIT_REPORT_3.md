# 最终审计报告（第三轮）

> **性质**：推送前的最终全局审计。基准文件为 `docs/AUDIT_REPORT_2.md`（第二轮交叉审计），
> 本轮**逐条验证其 6 项修复是否真正落地**，并补审前两轮从未完整覆盖的区域。
> 前两份报告均保留不动。
>
> - 日期：2026-10-04 17:55
> - 范围：origin/main..HEAD 全部变更文件 + 构建产物 + **真实浏览器运行时**
> - 方法：代码通读 + 关键假设脚本复现 + 真实 WASM 推理端到端验证

---

## 一、第二轮 6 项修复的落地核验

| 编号 | 修复 | 代码核验 | 运行时核验 |
|---|---|---|---|
| X-1 | WPM 改瞬时估计 + EMA | ✅ Worker 仅剩 `observeWindow` 一行调用，差值状态已清除 | ✅ **真实浏览器输出 20 WPM**（见下） |
| X-2 | 提示状态机无条件跟随 | ✅ `isTransition` + 无条件赋值 | ✅ 逻辑复核通过 |
| X-3 | 在途请求结算 | ✅ `failAllPending` 接入 onerror 与 terminate | — |
| X-4 | 删除重复 URL 函数 | ✅ 仅存 `resolveAssetUrl` | ✅ 浏览器加载成功 |
| X-5 | 注释与算法一致 | ✅ 示例已更正为 117u / 7.0s | — |
| X-6 | 崩溃徽章响应式 | ✅ 解码循环内 `setWorkerCrashed` | — |

**结论：6 项全部真正落地，无"只在测试里通过"的残留。**

---

## 二、真实运行时端到端验证（本轮新增，最强证据）

新增诊断页 `public/e2e-check.html`（随构建发布）。它在浏览器内合成 CW 音频，
以**生产完全相同的方式**（固定长度滚动窗口、每 2048 采样推进一次）
驱动真实的 `deepcwWorker` + 真实 15MB ONNX 模型。

实测输出：

```
worker: deepcwWorker-DarPg1PP.js
模型加载: 449 ms
解码结果（最后窗口）: "A K CQ DE BY4CWY K CT"
WPM 观测: 21 → 20 → 20 → 21 → 20 → 20 → 20 → 21 → 20 → 20 → 20 → 20  (真实 20 WPM)
推理耗时: 平均 223 ms（窗口 12s，RTF=0.019）
结论: PASS
```

意义：WPM 修复在**真实 WASM 推理 + 真实滚动窗口**条件下成立，
不再只是 Node 模拟。这个页面保留在产物中，社团换机器时
打开 `**/e2e-check.html` 即可 30 秒内确认引擎可用。

---

## 三、本轮新发现

### F-1（P2）构建产物中 WASM 重复一份，浪费 11 MB

```
dist/ort-wasm-simd-threaded.wasm                    11 MB  ← 代码通过 wasmPaths 指向它
dist/assets/ort-wasm-simd-threaded-<hash>.wasm      11 MB  ← Vite 打包 onnxruntime-web 时附带产出
```

后者是死重。两条可选路径（本轮**未改**，属体积优化而非缺陷）：
1. 删 `public/` 副本并去掉 `wasmPaths` 覆盖 → 由打包产物按 `import.meta.url` 解析，
   顺带天然适配子目录部署与 Tauri（需重跑 e2e 验证）。
2. 保留现状，仅在打包配置中排除该 emit。

### F-2（P2）index.html 依赖 Google Fonts CDN

`index.html:8-12` 引用 `fonts.googleapis.com` / `fonts.gstatic.com`。

- **Tauri 桌面端必然加载失败**：CSP 为 `default-src 'self'`，字体样式与字体文件
  都会被拦截，界面静默回落到系统字体。
- **离线场景**（社团无网机房）同样失败，且每次打开都要等一次外部请求超时。
- 影响仅限外观：解码区用的是系统等宽字体栈（`ui-monospace, ...`），**不影响读码**。

建议（涉及视觉取舍，交由你决定）：改为系统字体栈，或把字体文件自托管进 `public/`。

### F-3（P2）Tauri CSP 中 `connect-src` 重复声明

`tauri.conf.json` 原 CSP 串里 `connect-src` 出现两次，**后者按规范被忽略**。
已删除重复项（同时移除无用的 `https://github.com/`）。

### F-4（P2）`bundle.targets: ["app"]` 与 Windows 安装器

macOS 产 `.app` 没问题；Windows 若要 NSIS 安装包需把 target 改为含 `nsis`。
CI 里 `tauri-action` 未显式指定 target，**建议在首次正式发版前确认产物形态**。

### F-5（P2）`bundle.resources` 未含 `model_deepcw.onnx` —— 已核实不是问题

`frontendDist: ../dist` 会把整个 `dist`（含模型）嵌入应用二进制，
Worker 通过相对/绝对路径即可取到。已核实，无需修改。

### F-6（P2）`spectrogram.ts` 注释与实现不符（已修）

注释称"只对目标频带做 DFT，不计算完整 FFT"，实际是算完整 256 点 FFT 再切片。
已改为如实描述，并说明为何不优化（与官方参考实现保持一致优先）。

### F-7（P2）`abbrevExpander.ts` 存在无效规则（已修）

- `/^(SO|SO|5O)$/` —— `SO` 重复书写
- `/^(B8|BQ)$/ → "BQ"` —— 匹配 `BQ` 又返回 `BQ`，纯空操作，且会把 `B8` 改写掉

两条均已删除/改正。`DIGIT_FIXES` 现在只剩三条有效规则。

### F-8（P2）README 测试数据来源表述不实（已修）

原文称"全部 117 项测试均基于真实合成音频"。实际：
`test:wpm-rolling` / `test:wpm-worker` 使用按码元密度构造的**合成文本**
（目的是复刻生产调用模式，不验证音频链路）。已改为分来源说明，
并补齐 `npm test`（聚合 6 套）与 e2e 自检页说明。

### F-9（P3）`engineRegistry.ts` 缺"未接入生产"标注（已补）

221 行仅测试引用。已在文件头明确标注状态与原因，
避免后续维护者误以为仲裁已在运行。

### F-10（P3）残留死代码

`resampleToTarget` / `isSupportedSampleRate`（`spectrogram.ts`）生产零引用。
当前 `SAMPLE_RATE = 3200` 与 DeepCW 要求一致，浏览器 AudioContext 直接按 3200 打开，
确实不需要重采样。保留作为工具函数，标注即可。

---

## 四、部署就绪性结论

| 项 | 状态 |
|---|---|
| 6 项第二轮修复 | ✅ 全部落地并经运行时验证 |
| 真实浏览器端到端 | ✅ PASS（WPM 20/20、解码正确、RTF 0.019） |
| 主界面与三引擎切换 | ✅ 浏览器实测正常 |
| 测试 | ✅ 140 项全通过（`npm test` 聚合） |
| 类型检查 / 生产构建 | ✅ 通过 |
| 子目录部署路径 | ✅ 正确（`./assets/` 相对引用 + base path 反推） |
| CI 模型下载 | ✅ 三处 job 齐备 + 产物校验 |
| 许可合规 | ✅ 五处声明一致，依赖许可兼容 |
| Tauri 打包 | ⚠️ **仍未实测**（本次仅配置审查） |

**判定：可以推送部署。** 唯一未验证的是 Tauri 打包产物（需 Rust 工具链，
建议单独一次构建验证）。

---

## 五、继承的已知限制（非本轮引入，不阻塞）

1. 字符间隔 < 1.5 unit 时模型会**误识**字母，重切分只能解决"真粘连"不能解决误识。
2. 粘连串内嵌呼号时保护失效（`BY4CWYDEBG1ABC` → `BY 4C WY DE BG 1AB C`）。
3. DSP（ggmorse）路径有 5 个已定位 bug，仅作原理教学与降级兜底。
4. 速度安全区间 8–45 WPM，超界仅提示不阻断。
5. 间歇发信时 WPM 读数约为真实速度的"键音占比"倍（窗口含静默的固有局限）。

---

## 六、给下一步的三条建议（按价值排序）

1. **实测真实电台信号** —— 所有实验均为合成音频。这是唯一能验证
   "粘连/误识比例是否可接受"的方法，也是决定是否投入 CWformer 集成的依据。
2. **验证 Tauri 打包** —— 桌面版是社团无网环境的唯一方案，值得单独跑一次。
3. **决定 F-1 / F-2 的取舍** —— 体积 11MB 与离线字体，涉及视觉偏好，由你定。
