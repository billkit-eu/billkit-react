import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.tsx"],
  format: ["esm", "cjs"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  target: "es2020",
  platform: "browser",
  minify: false,
  treeshake: true,
  // Consumers bring their own React + the browser loader.
  external: ["react", "react-dom", "@billkit-eu/js"],
});
