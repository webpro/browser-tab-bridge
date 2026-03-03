import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const EXTENSION_ID = "open-in-browser-tab@webpro";
const HOST_NAME = "open_in_browser_tab";

function defaultsFor(browser) {
  const home = homedir();
  if (browser === "zen") {
    return {
      hostsDir: join(home, "Library", "Application Support", "zen", "NativeMessagingHosts"),
    };
  }

  return {
    hostsDir: join(home, "Library", "Application Support", "Mozilla", "NativeMessagingHosts"),
  };
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
  const defaults = defaultsFor(parsed.browser);

  const nativeHostsDir = parsed.hosts ?? defaults.hostsDir;
  const hostScript = join(rootDir, "host", "open-in-browser-tab-host.mjs");
  chmodSync(hostScript, 0o755);

  mkdirSync(nativeHostsDir, { recursive: true });
  writeFileSync(
    join(nativeHostsDir, `${HOST_NAME}.json`),
    JSON.stringify(
      {
        name: HOST_NAME,
        description: "Native messaging host for open-in-browser-tab",
        path: hostScript,
        type: "stdio",
        allowed_extensions: [EXTENSION_ID],
      },
      null,
      2,
    ),
  );

  console.log(`Native host installed for ${parsed.browser}`);
  console.log(`Native host manifest: ${join(nativeHostsDir, `${HOST_NAME}.json`)}`);
  console.log("Install the extension from file in browser UI (about:addons).");
}

main();
