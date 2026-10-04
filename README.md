# CW-BY4CWY

**面向学校无线电社团的 Morse Code 通联辅助工具**
**作者：BY4CWY · 上海位育附属徐汇科技实验中学 / WEIYU 业余无线电俱乐部**

把电波中的 CW 信号实时转成文字，让学生专心理解通联内容，
而不是练习枯燥的肌肉记忆。

---

## ⚠️ 许可变更说明（重要）

**本项目现采用 GNU Affero General Public License v3.0（AGPL-3.0）。**

原项目为 MIT，但 v2.6.0 起集成了 [DeepCW](https://github.com/e04/deepcw-engine)
的神经网络模型。该模型及其参考实现采用 **AGPL-3.0-only**，
而 AGPL 具有传染性：集成其代码或模型后，整个衍生作品必须以 AGPL 分发。

**这意味着**：

- ✅ 可以自由使用、修改、用于学校/社团/教学目的
- ✅ 必须以 AGPL-3.0 公开分发源码
- ❌ **不能**将本项目整体打包为闭源商业产品

若需闭源分发，请勿使用 DeepCW 模型，可改用内置的 DSP 模式
（纯算法实现，不含任何第三方模型）或自行训练模型。

⚠️ 另需注意：内置的 Legacy 模型（`model_en.onnx`）许可状态存疑，
理由见下文「三种解码引擎」章节。

---

## 三种解码引擎

界面右上角可切换：

| 模式 | 技术 | 许可 | 实测表现 |
|---|---|---|---|
| **DEEPCW**（默认） | CRNN + CTC，3200Hz / hop 48 / 400–1200Hz | **AGPL-3.0** | **标准时序 CER 0%**，粘连场景 55–79% |
| **LEGACY** | CRNN + CTC，宽频带 | 见下方说明 | 标准时序 CER 0% |
| **DSP** | Goertzel 传统算法 | MIT | 瞬时响应，用于原理教学与降级兜底 |

> **关于 Legacy 模型的许可**：该模型文件随项目一起提交，其来源为
> web-deep-cw-decoder 的早期版本（当时的仓库标注为 MIT）。
> ⚠️ 但**上游现已移除 LICENSE 文件**，不再有明确授权声明，
> 因此其确切许可状态存疑。若需用于分发场景，建议改用 DSP 模式
> （纯算法实现，MIT）或其他许可明确的模型。

**DeepCW 引擎的实测鲁棒性**（103 个合成用例）：

- 时序抖动 0–0.9（极端人工手法）：零影响
- dash 比例 2.0–5.0（标准 3.0）：零影响
- SNR 低至 −10 dB：零错误
- 频偏 ±200 Hz：零影响
- 基频 400–1200 Hz：全覆盖
- 安全速度区间：8–45 WPM（超出时界面会提示）

---

## 功能

**解码**
- 实时解码滚动显示（大字号，适合投影）
- 三引擎一键切换
- 缩写自动还原：`AR` `SK` `KN` `BT`，数字混淆纠正（`OS`→`73`）
- 通联要素自动提取与高亮：呼号、信号报告、Q 码
- WPM 实时估计，超出安全区间时红色警示
- 低置信度片段虚线标注，提醒学生自行判断
- 连读重切分：字符粘连时按语言模型重新切词

**编码**
- 文本 → Morse 音频，可调 WPM 与 Farnsworth 间距
- 248 条业余通联语料（12 分类），含中文释义

**训练**
- 合成数据生成（可调 WPM、基频、SNR）
- 语速分级训练
- 盲听答题模式（原文先隐藏，答对才揭晓）

**跨平台**
- 浏览器（Windows / macOS / Linux）
- iPad / 手机 Safari
- 桌面应用（Tauri 2）
- 完全离线可用（模型与 WASM 均本地加载）

---

## 下载

### Windows / macOS / Android

在 [Releases](https://github.com/lucpaysan/cw-by4cwy/releases) 下载安装包。

### 在线使用

访问 https://lucpaysan.github.io/CW-BY4CWY/

### 模型获取

首次使用 DeepCW 引擎需下载模型（约 15MB）：

```bash
bash scripts/fetch-deepcw-model.sh
```

> **为什么需要单独下载？**
> DeepCW 官方仓库提供的 8 个线上模型是 XOR 加密的
> （文件头为 `COPYRIGHT@2026 E04`），无法直接加载。
> 本项目使用 `e04/deepcw-engine` 仓库中未加密的模型文件。

---

## 本地开发

```bash
npm install
bash scripts/fetch-deepcw-model.sh   # 下载 DeepCW 模型
npm run dev
```

### 测试

```bash
npm test               # 依次跑全部 6 套（140 项）

npm run test:deepcw    # 频谱预处理、CTC 解码、边界回归（34 项）
npm run test:reseg     # 连读重切分（21 项）
npm run test:wpm       # WPM 离线路径 + countUnits（32 项）
npm run test:wpm-rolling # WPM 实时路径：瞬时估计 + EMA（15 项）
npm run test:wpm-worker  # 生产调用模式回归守卫（8 项）
npm run test:arb       # 引擎仲裁（30 项，仅测试引用该模块）
```

测试数据来源需区分：`test:deepcw` / `test:wpm` / `test:reseg` 使用
`cwSynth` 合成的**真实音频**；`test:wpm-rolling` / `test:wpm-worker`
使用按码元密度构造的**合成文本**模拟滚动窗口（目的是复刻生产调用
模式，不验证音频链路）。

### 端到端自检（部署后建议先跑这个）

浏览器打开 `**/e2e-check.html`（随构建产物一起发布），
页面会在页面内合成 CW 音频、驱动真实的 Worker + ONNX 模型，
输出解码文本、WPM 读数与推理耗时。用于快速确认某台设备上
引擎可正常加载与解码——社团现场换机器时很有用。

```bash
npm run build && npm run preview   # 然后打开 http://localhost:4173/e2e-check.html
```

### 构建

```bash
npm run build
npm run tauri:build
```

---

## 技术栈

| 层| 技术 |
|---|---|
| 前端 | React 19 + TypeScript + Vite 7 |
| UI | Mantine 8 |
| 推理 | ONNX Runtime Web 1.20 |
| 桌面 | Tauri 2 |

---

## 项目结构

```
src/
├── deepcw/DeepCW 引擎
│   ├── config.ts           模型参数（与官方元数据严格一致）
│   ├── spectrogram.ts      频谱预处理（逐值对齐官方参考实现）
│   ├── ctcDecoder.ts       贪心 CTC 解码
│   ├── abbrevExpander.ts   缩写还原与 QSO 要素提取
│   ├── resegmenter.ts      连读重切分（DP + 语言模型）
│   ├── wpmEstimator.ts     WPM 实时估计
│   └── inferenceClient.ts  主线程 Worker 封装
├── engines/
│   └── engineRegistry.ts   跨模型引擎抽象与仲裁
├── workers/deepcwWorker.ts  推理 Worker
├── DeepCWPanel.tsx         DeepCW 解码面板
├── DeepCWStandalone.tsx    麦克风与设备管理容器
└── core/phraseLibrary.ts   248 条业余通联语料
```

---

## 致谢与溯源

### 上游项目

本项目基于以下开源项目二创：

- **[web-deep-cw-decoder](https://github.com/e04/web-deep-cw-decoder)** by e04
  — 原项目，曾为 MIT License。**注：上游现已移除 LICENSE 文件，不再有明确授权声明。**
  本项目的 v1.x–v2.5.x 版本基于该项目开发。

- **[DeepCW Engine](https://github.com/e04/deepcw-engine)** by e04
  — v2.6.0 起集成的解码模型与参考实现。
  **许可：AGPL-3.0-only** — 这是本项目改用 AGPL-3.0 的原因。

### 技术参考

- **[ggmorse](https://github.com/ggerganov/ggmorse)** by ggerganov — Goertzel 算法参考
- **[CWformer](https://github.com/parsimo2010/CWformer)** by parsimo2010 — MIT —
  Conformer + CTC 架构参考，其词表含业余缩写
- **[morseformer](https://github.com/sderhy/morseformer)** by sderhy — Apache-2.0 —
  3-gram 语言模型重切分思路参考
- **[HamNoise](https://github.com/e04/HamNoise)** by e04 — 神经网络降噪

### 参与测试与贡献

- BH4DUF、BH4HNM — 程序编译修改与测试
- BH4FSP、BH4HOT — 参与测试
- 金山区青少年活动中心 — 参与测试
- BH4FRJ — 产品功能建议
- BY4CWY — 测试平台

### 第三方组件

| 组件 | 许可 |
|---|---|
| ONNX Runtime Web | MIT |
| React / React DOM | MIT |
| Mantine | MIT |
| Vite | MIT |
| Tauri | MIT / Apache-2.0 |

---

## 版权声明

Copyright (c) 2024-present BY4CWY, WEIYU Amateur Radio Club

本项目基于 AGPL-3.0 分发。集成DeepCW 模型（AGPL-3.0-only），
原作者为 e04。上游 web-deep-cw-decoder 的历史版本基于 MIT License。

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.
