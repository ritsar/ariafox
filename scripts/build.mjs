#!/usr/bin/env node
import * as esbuild from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const watch = process.argv.includes("--watch");
const sourcemap = watch || process.argv.includes("--sourcemap");

function copyStatic() {
  mkdirSync(join(dist, "popup"), { recursive: true });
  mkdirSync(join(dist, "manager"), { recursive: true });
  mkdirSync(join(dist, "options"), { recursive: true });
  mkdirSync(join(dist, "shared"), { recursive: true });
  mkdirSync(join(dist, "icons"), { recursive: true });
  cpSync(join(root, "src/manifest.json"), join(dist, "manifest.json"));
  cpSync(join(root, "src/_locales"), join(dist, "_locales"), { recursive: true });
  cpSync(join(root, "src/shared/ui.css"), join(dist, "shared/ui.css"));
  cpSync(join(root, "src/popup/index.html"), join(dist, "popup/index.html"));
  cpSync(join(root, "src/popup/popup.css"), join(dist, "popup/popup.css"));
  cpSync(join(root, "src/manager/index.html"), join(dist, "manager/index.html"));
  cpSync(join(root, "src/manager/manager.css"), join(dist, "manager/manager.css"));
  cpSync(join(root, "src/options/index.html"), join(dist, "options/index.html"));
  cpSync(join(root, "src/options/options.css"), join(dist, "options/options.css"));
  cpSync(join(root, "assets/logo.svg"), join(dist, "manager/logo.svg"));
  cpSync(join(root, "assets/icons"), join(dist, "icons"), { recursive: true });
}

const buildOptions = {
  absWorkingDir: root,
  entryPoints: {
    background: "src/background/index.ts",
    "popup/popup": "src/popup/index.ts",
    "manager/manager": "src/manager/index.ts",
    "options/options": "src/options/index.ts",
  },
  outdir: dist,
  bundle: true,
  format: "esm",
  target: ["firefox128"],
  sourcemap,
  logLevel: "info",
};

rmSync(dist, { recursive: true, force: true });
copyStatic();

if (watch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log("Watching…");
} else {
  await esbuild.build(buildOptions);
  copyStatic();
}
