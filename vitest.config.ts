import { defineConfig } from "vitest/config";
import path from "node:path";

// tsconfig.json の paths ("@/*": ["./*"]) と同じエイリアスをテスト実行時にも解決する。
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
  },
});
