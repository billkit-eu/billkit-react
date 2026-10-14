// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build, type Options } from "tsup";
import { afterAll, describe, expect, it } from "vitest";
import config from "../tsup.config";
import pkg from "../package.json";

// The bundles are built here from the real tsup config, rather than read from
// dist/, because the gate runs the tests before the build and dist/ may be
// stale or absent.
const outDirs: string[] = [];

async function bundle(minify: boolean): Promise<{ esm: string; cjs: string }> {
  const outDir = mkdtempSync(join(tmpdir(), "billkit-react-build-"));
  outDirs.push(outDir);
  await build({
    ...(config as Options),
    entry: [join(__dirname, "..", "src", "index.tsx")],
    outDir,
    dts: false,
    sourcemap: true,
    minify,
    silent: true,
  });
  return {
    esm: readFileSync(join(outDir, "index.js"), "utf8"),
    cjs: readFileSync(join(outDir, "index.cjs"), "utf8"),
  };
}

afterAll(() => {
  for (const dir of outDirs) rmSync(dir, { recursive: true, force: true });
});

describe("build output", () => {
  // A directive only counts as the very first statement of the module; one
  // after "use strict" or an import is an ordinary string expression, and
  // Next.js then treats the provider as a server component.
  it.each([false, true])(
    'starts both bundles with "use client" (minify: %s)',
    async (minify) => {
      const { esm, cjs } = await bundle(minify);
      expect(esm.startsWith('"use client";')).toBe(true);
      expect(cjs.startsWith('"use client";')).toBe(true);
    },
    30_000,
  );

  it("gives CommonJS consumers the .d.cts types and ESM consumers the .d.ts", () => {
    const root = (pkg.exports as Record<string, unknown>)["."];
    expect(root).toEqual({
      import: { types: "./dist/index.d.ts", default: "./dist/index.js" },
      require: { types: "./dist/index.d.cts", default: "./dist/index.cjs" },
    });
  });
});
