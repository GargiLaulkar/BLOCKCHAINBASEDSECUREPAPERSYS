// CR-01 "done when: builds for browser and Node" check.
//
// `pnpm build` already proves the Node/ESM build (tsc -> dist/*.js, then
// smoke tests import and run it under Node). This script proves the same
// source also bundles cleanly for a browser target: esbuild is asked to
// bundle with platform:"browser" and no platform-specific shims, so it
// fails loudly if any module reaches for a Node builtin (fs, crypto, etc.)
// instead of Web APIs — exactly what section 9 forbids ("no Node-only
// APIs in browser paths").
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const entry = join(here, "..", "src", "index.ts");

try {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2022",
    logLevel: "silent"
  });

  if (result.errors.length > 0) {
    console.error("Browser bundle failed:", result.errors);
    process.exit(1);
  }

  console.log(
    `Browser bundle OK: ${entry} -> ${result.outputFiles[0].contents.length} bytes, no Node-only built-ins required.`
  );
} catch (err) {
  console.error("Browser bundle failed — likely a Node-only import in a browser code path:");
  console.error(err.message ?? err);
  process.exit(1);
}
