# 交叉审计报告（第二轮）

> **审计性质**：应换模型交叉审计的要求，由另一个视角从零重读全部新增代码，
> **不沿用第一轮审计（docs/AUDIT_REPORT.md）的任何结论**。
>
> - 日期：2026-10-04 17:20
> - 范围：origin/main..HEAD 全部 37 个变更文件，重点为 src/deepcw/、src/engines/、
>   src/workers/deepcwWorker.ts、两个 UI 组件、CI 工作流
> - 方法：全量通读 + 关键假设用可执行脚本复现（不做纯推理判断）

---

## 结论速览

| 编号 | 级别 | 问题 | 状态 |
|---|---|---|---|
| X-1 | **P0** | **WPM 功能在生产环境完全失效**（徽章永远不显示）| 已复现，待修 |
| X-2 | P1 | 超界提示状态机不复位，第二次超界永久静默 | 待修 |
| X-3 | P1 | Worker 崩溃后在途请求永久挂起，解码循环假死 | 待修 |
| X-4 | P2 | resolveModelUrl 与 resolveAssetUrl 完全重复 | 待修 |
| X-5 | P2 | wpmEstimator 头部注释仍引用已废弃的错误算法示例 | 待修 |
| X-6 | P2 | workerCrashed 非响应式，崩溃后徽章不出现 | 待修 |

其余核查项（路径解析、CI、许可、测试、构建）**通过**，见文末。

---

## X-1（P0）WPM 功能在生产环境完全失效

### 复现证据

`src/deepcw/__tests__/crossAuditWorkerPattern.ts` 按 **Worker 的真实调用模式**
逐行复刻 `deepcwWorker.ts` 的逻辑，模拟 45 秒连续发信：

```
真实 12 WPM → 生产环境输出: ❌ 永远为 null（累计码元 0，70 次推理）
真实 20 WPM → 生产环境输出: ❌ 永远为 null（累计码元 0，70 次推理）
真实 30 WPM → 生产环境输出: ❌ 永远为 null（累计码元 0，70 次推理）
真实 40 WPM → 生产环境输出: ❌ 永远为 null（累计码元 0，70 次推理）
```

### 根因（三层叠加）

1. **音频缓冲是固定长度滚动窗口**（`useAudioProcessing` 分配
   `windowSeconds × 3200` 采样，只滑不移除）。Worker 每次收到整个窗口，
   `audioSeconds = audioBuffer.length / 3200` **恒定**。
2. Worker 计算 `stepSeconds = audioSeconds - lastWindowSeconds`，
   首次之后**恒为 0**；而 `updateRolling` 要求 `stepSeconds > 0` 才累计。
3. **更深层的设计错误**：`updateRolling` 的差值语义是
   `当前窗口码元 - 上一窗口码元` = 窗口内容的**净变化**（新进 − 旧出）。
   稳态下新进 ≈ 旧出，差值 ≈ 0——**即使修好 stepSeconds，稳态也测不到 WPM**。
   它只在窗口填充期（前 windowSeconds 秒）偶尔为正。

### 为什么第一轮修复声称"偏差 0-4%"却是错的

`wpmRollingCheck.ts` 自己发明了一套调用约定（stepSeconds=0.64 +
"连续码元密度"文本），从未模拟 Worker 的真实调用。
**测试验证了一个不存在的调用方式**——131 项测试全绿，但被测功能在生产中
一行有效代码都没执行过。

### 修复方向

放弃「跨推理累计差值」，改为**逐窗口瞬时估计 + 加权 EMA**：

```
inst = 1.2 × countUnits(text) / windowSeconds     ← 每次推理独立成立，无重叠问题
ema  = ema + α × (inst − ema)，α 随窗口码元数增大   ← 低内容窗口权重小，抗静默
```

瞬时估计不依赖相邻窗口的关系，天然免疫滚动窗口重叠；
EMA 平滑误识抖动；低码元窗口跳过观察，防止空闲期把读数拖向 0。

---

## X-2（P1）超界提示状态机不复位

`wpmEstimator.ts getEstimate()`：

```ts
if (advice !== null && stateKey !== this.lastAdvice) {
  this.lastAdvice = stateKey;      // 只在"发出提示"时更新
} else {
  advice = null;                    // 返回正常时走这里，lastAdvice 不复位
}
```

时序：第一次超界 → 提示 + lastAdvice="too-slow"；恢复正常 →
lastAdvice **仍是** "too-slow"；第二次进入同样超界 →
`stateKey === lastAdvice` → **提示被永久抑制**。

对教学场景是实际风险：学生第一次遇到慢速对手看到提示，第二次遇到时
软件静默输出乱码。修复：`lastAdvice = stateKey` 无条件更新。

---

## X-3（P1）Worker 崩溃后在途请求永久挂起

`inferenceClient.ts` 两处：

```ts
worker.onerror = (event) => { ...; worker = null; loadPromise = null; };
// pending Map 里的请求既不 resolve 也不 reject → await 永不返回

export function terminateDeepCWWorker(): void {
  ...
  pending.clear();   // 同样不 reject
}
```

后果：解码循环 `await runDeepCWInference(...)` 永久挂起，
UI 显示"解码中"但从此无输出，且无任何错误提示——**假死**。
修复：onerror 与 terminate 时 reject 全部在途请求。

---

## X-4 / X-5 / X-6（P2）

- **X-4**：`deepcwWorker.ts` 的 `resolveModelUrl` 与 `resolveAssetUrl`
  逐字符相同，删除其一。
- **X-5**：`wpmEstimator.ts` 头部注释的示例（"总计约 67 码元 → 4.0 秒"）
  是**已废弃的错误算法**的数字；正确算法下 "CQ DE BY4CWY" ≈ 117 码元 → 7.0 秒。
  注释与代码不一致会误导后续维护。
- **X-6**：`DeepCWPanel` 的 `workerCrashed` 在渲染时读取模块级变量，
  崩溃不触发重渲染，"推理进程曾中断" 徽章实际不会出现。
  在解码循环里同步为 state。

---

## 通过项（本轮独立核查）

| 项 | 结果 |
|---|---|
| WASM/模型 base path 解析（P0-1 修复）| ✅ Pages 子目录、本地 dev、preview 三场景推演正确 |
| CI 模型下载（P0-2 修复）| ✅ deploy-pages + Windows（含 shell: bash）+ Android 三处齐备，含产物校验 |
| 许可一致性 | ✅ LICENSE / package.json / Cargo.toml / tauri.conf.json / UI 标注五处一致 AGPL-3.0 |
| npm 依赖许可 | ✅ 全部 MIT/Apache-2.0/ISC，与 AGPL 兼容 |
| countUnits 算法 | ✅ 键音按时长（dot 1u / dash 3u），与 cwSynth 实测音频比值 1.000 |
| cwSynth 词间隔 | ✅ 已改为 (wordGap − charGap) 补足，注释记录了教训 |
| spectrogram | ✅ 首轮已与官方 Python 参考实现逐值对照（~1e-6），本轮未发现新问题 |
| 引擎切换 UI | ✅ 三模式循环 + 默认 DeepCW + 悬停说明 |
| 测试 | ✅ 131 项全通过（但注意 X-1 揭示的"测试与生产约定不一致"问题）|
| 类型检查 / 生产构建 | ✅ 通过 |

## 已知但未在本轮处理的遗留

- `engineRegistry.ts`（221 行）仅测试引用，未接入生产——维持第一轮结论。
- 重切分对"误识"类无效、粘连串内嵌呼号保护失效——维持首轮实验结论。
- Worker 并发推理消息可交错（onmessage async），改用瞬时估计后状态竞争
  无害化，但如未来加全局状态需加队列。

## 方法论备注（写给下一个审计者）

1. **测试通过 ≠ 功能可用**。X-1 的测试自己发明了调用约定。
   集成型测试必须复刻生产调用方的真实参数，而不是测试者方便的形式。
2. **差值类设计要问一句"稳态下差值是多少"**。X-1 的第二层根因是
   滚动窗口的差值稳态趋零——在纸上推一遍稳态就能发现，不需要跑代码。
3. 崩溃/终止路径上的 `pending.clear()` 要问"里面的 promise 谁来 settle"。

---

# 修复验证（同日追加）

全部 6 项已修复并验证。

## X-1 WPM 生产失效 ✅（重新设计）

`WpmEstimator` 改为**瞬时估计 + 加权 EMA**：

- 新增 `observeWindow(text, windowSeconds)`：
  `inst = 1.2 × countUnits(text) / windowSeconds`，
  按 `min(1, max(0.2, units/200))` 的 α 做指数平滑。
  窗口码元 < 30 时跳过观察（单个杂散字符不会拖偏读数）。
- 删除 `updateRolling()`（差值累计设计在滚动窗口下稳态趋零，必然失效）。
- `update()` 保留为离线累计路径（wpmCheck 的 32 项断言不变全通过）。
- Worker 调用简化为一行：`observeWindow(decoded.text, audioSeconds)`，
  删除 `lastWindowSeconds` / `isFirstWpmSample` / `stepSeconds` 状态。

**验证**（`test:wpm-worker`，逐行复刻 Worker 调用路径）：

```
真实 12 WPM → ✅ 12（偏差 0%）
真实 20 WPM → ✅ 20（偏差 0%）
真实 30 WPM → ✅ 30（偏差 0%）
真实 40 WPM → ✅ 40（偏差 0%）
```

修复前同一脚本输出「4/4 永远为 null，70 次推理累计码元 0」。

间歇发信（占空比 2/3）验证：读数 ≈ 2/3 真实速度（窗口含静默的已知
局限），不塌向 0、不误报超慢。杂散单字符窗口不污染 EMA。

## X-2 提示状态机 ✅

`lastAdvice = stateKey` 改为**无条件**更新，仅在状态切换沿放行提示。
两次进入同一超界状态都能收到提示；持续超界仍不刷屏。

## X-3 在途请求挂起 ✅

新增 `failAllPending(reason)`，`worker.onerror` 与
`terminateDeepCWWorker` 都会 reject 全部 pending，
解码循环的 await 正常返回，UI 不会假死。

## X-4 / X-5 / X-6 ✅

- 删除重复的 `resolveModelUrl`，统一走 `resolveAssetUrl`。
- `wpmEstimator` 头部注释示例更新为正确算法的数字（≈117u / 7.0s），
  并补充了 X-1 的设计教训。
- `workerCrashed` 在解码循环内同步为 state，徽章可正常出现。

## 测试现状

```
test:deepcw       34 项  ✅
test:reseg        21 项  ✅
test:wpm          32 项  ✅（离线累计路径，断言未动）
test:wpm-rolling  15 项  ✅（重写：瞬时估计 + EMA，生产调用模式）
test:wpm-worker    8 项  ✅（新增：X-1 永久回归守卫）
test:arb          30 项  ✅
──────────────────────────
合计            140 项  全部通过
```

类型检查与生产构建通过。

## 本轮方法论沉淀

1. **集成测试必须复刻生产调用方的真实参数**——X-1 的旧测试
   自己发明了调用约定，131 项全绿但功能一行未执行。
2. **差值/增量类设计先推一遍稳态**：滚动窗口的差值稳态趋零，
   纸上推演即可发现，无需跑代码。
3. **经验补偿系数是 bug 的信号**（首轮已证，本轮 X-5 的注释
   与代码不一致再次提醒：文档随算法一起改）。
