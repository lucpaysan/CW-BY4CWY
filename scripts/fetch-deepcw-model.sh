#!/usr/bin/env bash
#
# 下载 DeepCW 模型
#
# 模型来源：https://github.com/e04/deepcw-engine
# 许可证：AGPL-3.0-only
#
# 为什么用 GitHub API 而非 raw.githubusercontent.com：
# 大文件（约 15MB）在 raw 域名下会失败，需通过 API 的 raw accept头获取。
#
# 注意：deepcw.cc 上部署的 8 个线上模型是 XOR 加密的
#（文件头为 "COPYRIGHT@2026 E04"），无法直接加载，
# 必须使用本仓库这个未加密的裸模型。

set -euo pipefail

MODEL_URL="https://api.github.com/repos/e04/deepcw-engine/contents/model.onnx"
META_URL="https://raw.githubusercontent.com/e04/deepcw-engine/main/model.onnx.json"
MODEL_PATH="public/model_deepcw.onnx"
META_PATH="public/model_deepcw.json"

if [ -f "$MODEL_PATH" ]; then
  echo "模型已存在：$MODEL_PATH"
  echo "如需重新下载，请先删除该文件"
  exit 0
fi

echo "正在下载 DeepCW 模型（约 15MB）..."
echo "来源：$MODEL_URL"
echo "许可：AGPL-3.0-only"
echo

curl -L --fail --progress-bar \
  -H "Accept: application/vnd.github.raw" \
  "$MODEL_URL" \
  -o "$MODEL_PATH"

curl -L --fail --progress-bar "$META_URL" -o "$META_PATH"

SIZE=$(wc -c < "$MODEL_PATH" | tr -d ' ')
echo
echo "完成：$MODEL_PATH（$SIZE 字节）"
echo "元数据：$META_PATH"
