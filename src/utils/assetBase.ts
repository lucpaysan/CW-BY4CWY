/**
 * 部署根路径（base path）解析与资源 URL 推导。
 *
 * ## 为什么必须从 Worker 自身路径反推
 *
 * Worker 在生产构建中位于 `<base>/assets/xxx.js`，而模型与 WASM
 * 位于 `<base>/`。GitHub Pages 部署在子目录（如 `/CW-BY4CWY/`），
 * 如果硬编码 `${location.origin}/`，WASM 与模型的请求会打到域名根
 * 路径而 404，模型加载随之失败 —— 这个 bug 曾在 DeepCW Worker
 * （AUDIT_REPORT_2.md X-1 之前的 P0-1）与 legacy Worker 中各出现一次。
 *
 * ⚠️ 任何新增 Worker 都应使用本模块，不要自己写路径推导。
 */

/** 解析部署根路径：生产为 `<base>`，开发或非标准路径为空串 */
export function resolveBasePath(): string {
  const workerPath = self.location.pathname;
  const assetsIndex = workerPath.lastIndexOf("/assets/");
  if (assetsIndex !== -1) {
    return workerPath.substring(0, assetsIndex);
  }
  return "";
}

/** 推导 `<base>/` 下静态资源（模型、WASM）的完整 URL */
export function resolveAssetUrl(fileName: string): string {
  return `${self.location.origin}${resolveBasePath()}/${fileName}`;
}
