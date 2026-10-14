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
  // esbuild's own tree shaking, not tsup's rollup pass: rollup strips
  // module-level directives, so the "use client" banner below never reached
  // the output with `treeshake: true`.
  treeshake: false,
  // Consumers bring their own React + the browser loader.
  external: ["react", "react-dom", "@billkit-eu/js"],
  // Every export here is a client component or a hook: the provider calls
  // createContext at module scope, and the elements mount an iframe in an
  // effect. Without the directive, importing the package from a Next.js App
  // Router server component fails, which the README says it does not.
  // tests/build-output.test.ts asserts it is the first line of both bundles.
  banner: { js: '"use client";' },
});
