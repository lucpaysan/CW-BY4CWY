# CW-BY4CWY

**基于 [web-deep-cw-decoder](https://github.com/e04/web-deep-cw-decoder) by e04 (MIT License) 二创**
**二创作者: BY4CWY**

面向高中生的 Morse Code 编解码学习工具，支持深度学习解码和传统 DSP 解码。

## 功能

- **Morse 编码**: 文本 → Morse 音频，支持可调 WPM 和 Farnsworth 间距
- **深度学习解码**: CRNN + CTC 神经网络，高精度
- **DSP 解码**: 基于 Goertzel 算法的传统实时解码
- **双解码器模式**: 可切换深度学习和传统 DSP 解码方式
- **信号质量监控**: SNR 和置信度指示器
- **合成数据生成**: 内置训练数据增强工具
- **CTC 解码**: 真正的 Connectionist Temporal Classification 解码
- **音频可视化**: 频谱示波器风格显示
- **浏览器运行**: 无需安装，跨平台支持

## 下载

### Windows
在 [Releases](https://github.com/lucpaysan/cw-by4cwy/releases) 下载最新版本安装包

### macOS / Android
在 [Releases](https://github.com/lucpaysan/cw-by4cwy/releases) 下载对应版本

## 在线使用

访问: [https://lucpaysan.github.io/cw-by4cwy/](https://lucpaysan.github.io/cw-by4cwy/)

## 鸣谢

- 原项目: [web-deep-cw-decoder](https://github.com/e04/web-deep-cw-decoder) by e04
- 感谢 BH4DUF、BH4HNM 对程序的编译修改与测试
- 感谢 BH4FSP、BH4GSZ 与金山区青少年活动中心共同参与测试
- 感谢 BH4FRJ 对产品功能提出的宝贵意见
- 感谢 BY4CWY 提供整个测试平台
- [ggmorse](https://github.com/ggerganov/ggmorse) - Goertzel 算法参考
- [DeepCW](https://github.com/VE3NEA/DeepCW) - 深度学习解码参考
- ONNX Runtime Web
- Mantine UI

## 本地开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

## 技术栈

- ONNX Runtime Web - 客户端机器学习推理
- React + TypeScript - 前端框架
- Vite - 构建工具
- Mantine UI - UI 组件库

## 版权声明

Copyright (c) 2024-present CW-BY4CWY Contributors. Based on web-deep-cw-decoder by e04 (MIT License).
