import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirrors the "@/*" path in tsconfig.json.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    // The desktop app's build output holds a copy of the site.
    exclude: [...configDefaults.exclude, "desktop/server/**", "desktop-build/**"],
  },
});
