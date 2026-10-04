import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { access, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";

/**
 * 删除构建时附带产出的重复 WASM。
 *
 * onnxruntime-web 打包进 Worker chunk 时，Vite 会顺带把它的
 * ort-wasm-simd-threaded.wasm 以带哈希的名字 emit 到 dist/assets/。
 * 实际运行时 ORT 通过 ort.env.wasm.wasmPaths 指向 public/ 的根目录副本
 * —— 实验证明哈希副本无法直接顶替：移除根目录副本后模型加载报
 * "int64 is not supported"（2026-10-04 浏览器实测）。
 * 因此这份带哈希的 emit 是 11MB 的死重，构建后清理。
 */
function removeDuplicateOrtWasm(): Plugin {
  return {
    name: "remove-duplicate-ort-wasm",
    closeBundle: async () => {
      const dist = join(process.cwd(), "dist");
      const rootWasm = join(dist, "ort-wasm-simd-threaded.wasm");
      try {
        // 根目录副本存在才清理（它是实际被加载的）
        await access(rootWasm);
      } catch {
        return;
      }
      try {
        const assets = await readdir(join(dist, "assets"));
        for (const f of assets) {
          if (/^ort-wasm-[A-Za-z0-9_-]+\.wasm$/.test(f)) {
            await unlink(join(dist, "assets", f));
            console.log(`  [dedup] 已删除重复 WASM: assets/${f}`);
          }
        }
      } catch {
        // dist/assets 不存在等异常情况，忽略
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), removeDuplicateOrtWasm()],
  base: "./",
  build: {
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name || "";
          if (info.endsWith(".wasm")) {
            return "assets/[name][extname]";
          }
          return "assets/[name]-[hash][extname]";
        },
      },
    },
  },
});
