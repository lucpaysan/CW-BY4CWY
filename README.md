# CW Master

**基于 [web-deep-cw-decoder](https://github.com/e04/web-deep-cw-decoder) by e04 (MIT License) 二创**
**二创作者: BY4CWY**

面向高中生的 Morse Code 编解码学习工具，支持深度学习解码和传统贝叶斯解码。

## 功能

- **Morse 编码**: 文本 → Morse 音频，支持可调 WPM 和 Farnsworth 间距
- **深度学习解码**: CRNN + CTC 神经网络，高精度
- **贝叶斯解码**: 自适应信号速度，低延迟
- **听力训练**: 三种训练模式 - 听音练习、跟打训练、自由练习

## 下载

### Windows
在 [Releases](https://github.com/lucpaysan/web-deep-cw-decoder/releases) 下载最新版本安装包

### macOS / Android
在 [Releases](https://github.com/lucpaysan/web-deep-cw-decoder/releases) 下载对应版本

## 鸣谢

- 原项目: [web-deep-cw-decoder](https://github.com/e04/web-deep-cw-decoder) by e04
- 感谢 BH4DUF、BH4HNM 对软件测试的支持
- 感谢 BY4CWY 提供整个测试平台
- ONNX Runtime Web
- Mantine UI

## 本地开发

```bash
npm install
npm run dev
```

## 构建

```bash
# 构建所有平台
npm run tauri:build

# macOS app
cargo build --release  # 输出: src-tauri/target/release/cw-master
```

## 版权声明

Copyright (c) 2026 BY4CWY. Based on web-deep-cw-decoder by e04 (MIT License).
