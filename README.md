# CW Master

**基于 [web-deep-cw-decoder](https://github.com/e04/web-deep-cw-decoder) by e04 (MIT License) 二创**
**二创作者: BY4CWY**

Morse Code 编解码一体工具，支持深度学习解码和传统贝叶斯解码。

## 功能

- **Morse 编码**: 文本 → Morse 音频，支持可调 WPM 和 Farnsworth 间距
- **深度学习解码**: CRNN + CTC 神经网络，高精度
- **贝叶斯解码**: 自适应信号速度，低延迟
- **呼号预设**: BH4DUF / BY4CWY 快速切换

## 下载

### macOS
直接运行 `CW-Master-macOS` (13MB，无需安装)

### Windows
1. 点击上方 **Tags** → **v1.0.0** (或创建新标签)
2. GitHub Actions 会自动构建 Windows 版本
3. 构建完成后在 Artifacts 下载

## 鸣谢

- 原项目: [web-deep-cw-decoder](https://github.com/e04/web-deep-cw-decoder) by e04
- 深度学习模型训练: 50小时 Morse Code 音频数据
- ONNX Runtime Web
- Mantine UI

## 本地开发

```bash
npm install
npm run dev
```

## 构建

```bash
# macOS
cargo build --release  # 输出: src-tauri/target/release/cw-master

# Windows (需要 Windows 环境或 GitHub Actions)
npm run tauri:build
```

## 版权声明

Copyright (c) 2026 BY4CWY. Based on web-deep-cw-decoder by e04 (MIT License).
