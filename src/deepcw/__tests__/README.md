# DeepCW 测试与实验

## 运行

```bash
# 单元自检（34 项：频谱形状、NaN 回归、缩写还原、QSO 提取）
npm run test:deepcw

# 端到端：导出 TS 频谱供 Python 逐值对照
npm run test:deepcw:e2e
```

## 实验脚本

| 文件 | 用途 |
|---|---|
| `cwSynth.ts` | **人工发报模拟器**，可复现。含时序抖动、dash 比例漂移、频率漂移、噪声、淡入淡出包络 |
| `q1q2Experiments.ts` | E/T 单字符识别 + 人工发报鲁棒性（79 用例）|
| `q2Stress.ts` | 极端条件压测（50 用例）：超低 SNR、极端时序、速度两极、频带边缘 |

## 人工发报模拟器的用法

```ts
import { synthCW, MACHINE_TIMING } from "./cwSynth";

synthCW("CQ DE BY4CWY", {
  wpm: 20,
  toneHz: 700,
  timing: { ...MACHINE_TIMING, charGap: 1.2 },  // 字符间隔过小（会粘连）
  jitter: 0.3,       // 0 = 机器标准，0.9 = 极端人工
  snrDb: -6,         // 噪声
  driftHz: 80,       // 频率漂移
  seed: 42,          // 可复现
});
```

## 关键实测结论（2026-10-04）

**单字符识别**
- 孤立单字符：10/14（71%）正确，失败的是纯单元素 E(0.2s) 与 T(0.4s)
- 出现在短语中：**12/12（100%）** 正确 —— TU / RES / 73 TU / CQ TEST / NIL / SO / OK 全部解出
- 结论：只要字符后有内容，短字符就能被带出来

**人工发报鲁棒性（103 用例）**
- 可靠：时序抖动 0–0.9、dash 比例 2.0–5.0、SNR 低至 -10 dB、频偏 ±200 Hz、基频 400–1200 Hz
- 失效边界一：**字符间隔 < 1.5 unit** → 字符粘连，CTC 无法切分（60% CER）
- 失效边界二：**5–6 wpm 与 50 wpm** → 超出模型能力（40–80% CER）
- 安全区间：8–45 wpm
