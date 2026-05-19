import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const EXTENSION_ID = "browser-tab-bridge@webpro";
const HOST_NAME = "browser_tab_bridge";

function hostsDirsFor(browser) {
  const appSupport = join(homedir(), "Library", "Application Support");
  const mozilla = join(appSupport, "Mozilla", "NativeMessagingHosts");
  if (browser === "zen") {
    return [mozilla, join(appSupport, "zen", "NativeMessagingHosts")];
  }
  return [mozilla];
}

function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      browser: { type: "string" },
      hosts: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: false,
    tokens: true,
  });

  const parsed = {
    browser: values.browser ?? "firefox",
    hosts: values.hosts,
    help: values.help ?? false,
  };

  if (parsed.help) {
    console.log("Usage: node scripts/install-extension.mjs [--browser firefox|zen] [--hosts <path>]");
    process.exit(0);
  }

  if (parsed.browser !== "firefox" && parsed.browser !== "zen") {
    throw new Error(`Invalid --browser value: ${parsed.browser}`);
  }

  const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
  const hostScript = join(rootDir, "host", "browser-tab-bridge-host.mjs");
  const body = readFileSync(hostScript, "utf8").replace(/^#![^\n]*\n/, "");
  writeFileSync(hostScript, `#!${process.execPath}\n${body}`);
  chmodSync(hostScript, 0o755);

  const manifest =
    JSON.stringify(
      {
        name: HOST_NAME,
        description: "Native messaging host for browser-tab-bridge",
        path: hostScript,
        type: "stdio",
        allowed_extensions: [EXTENSION_ID],
      },
      null,
      2,
    ) + "\n";

  const hostsDirs = parsed.hosts ? [parsed.hosts] : hostsDirsFor(parsed.browser);
  for (const dir of hostsDirs) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${HOST_NAME}.json`), manifest);
    console.log(`Native host manifest: ${join(dir, `${HOST_NAME}.json`)}`);
  }

  console.log(`Native host installed for ${parsed.browser} (host: ${hostScript})`);
  console.log("Install the extension from file in browser UI (about:addons),");
  console.log("then fully restart the browser so it relaunches the native host.");
}

main();
