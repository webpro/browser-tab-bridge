import { chmodSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_EXT = join(ROOT, "src", "extension");
const SRC_HOST = join(ROOT, "src", "host");
const baseManifest = JSON.parse(readFileSync(join(SRC_EXT, "manifest.base.json"), "utf8"));

function cleanDir(path) {
  rmSync(path, { recursive: true, force: true });
  mkdirSync(path, { recursive: true });
}

function buildExtension(dir, manifest, extras) {
  cleanDir(dir);
  cpSync(join(SRC_EXT, "background.js"), join(dir, "background.js"));
  if (extras) cpSync(join(SRC_EXT, extras), join(dir, extras), { recursive: true });
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  execSync("zip -r $(basename $PWD).xpi .", { cwd: dir });
}

// Firefox
buildExtension(join(ROOT, "extension", "firefox"), baseManifest);

// Zen
buildExtension(join(ROOT, "extension", "zen"), {
  ...baseManifest,
  experiment_apis: {
    zenSpaces: {
      schema: "experiment/schema.json",
      parent: { scopes: ["addon_parent"], paths: [["zenSpaces"]], script: "experiment/api.js" },
    },
  },
}, "experiment");

// Native messaging host
const hostDir = join(ROOT, "host");
cleanDir(hostDir);
const hostScript = join(hostDir, "open-in-browser-tab-host.mjs");
cpSync(join(SRC_HOST, "open-in-browser-tab-host.mjs"), hostScript);
chmodSync(hostScript, 0o755);

console.log("Built: extension/firefox, extension/zen, host");
