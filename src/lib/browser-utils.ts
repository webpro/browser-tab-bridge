import { execFile } from "node:child_process";

export function runOsascript(lang: string, script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "osascript",
      ["-l", lang, "-e", script],
      (error, stdout, stderr) => {
        if (error) reject(new Error(stderr || error.message));
        else resolve(stdout.trim());
      },
    );
  });
}

export function runAppleScript(script: string) {
  return runOsascript("AppleScript", script);
}

export function runOpen(url: string, bundleId?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = bundleId ? ["-b", bundleId, url] : [url];
    execFile("open", args, (error, _stdout, stderr) => {
      if (error) reject(new Error(stderr || error.message));
      else resolve();
    });
  });
}

export function escapeForAppleScript(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

let defaultBrowserBundleIdPromise: Promise<string> | undefined;

export function getDefaultBrowserBundleId(): Promise<string> {
  if (!defaultBrowserBundleIdPromise) {
    defaultBrowserBundleIdPromise = runOsascript(
      "JavaScript",
      `ObjC.import("AppKit");
      const ws = $.NSWorkspace.sharedWorkspace;
      const url = $.NSURL.URLWithString("https://example.com");
      const appUrl = ws.URLForApplicationToOpenURL(url);
      if (!appUrl) {
        throw new Error("No default application URL for https");
      }
      const bundle = $.NSBundle.bundleWithURL(appUrl);
      if (!bundle) {
        throw new Error("No bundle for default application URL");
      }
      const bundleId = bundle.bundleIdentifier;
      if (!bundleId) {
        throw new Error("No bundle identifier for default browser");
      }
      bundleId.js;`,
    )
      .then((bundleId) => {
        const normalized = bundleId.trim();
        if (!/^[A-Za-z0-9.-]+$/.test(normalized) || normalized === "[object Ref]") {
          throw new Error(`Invalid bundle identifier: ${normalized}`);
        }
        return normalized;
      })
      .catch((error) => {
        defaultBrowserBundleIdPromise = undefined;
        throw error;
      });
  }

  return defaultBrowserBundleIdPromise;
}

export const CHROMIUM_BUNDLE_IDS = [
  "com.google.Chrome",
  "com.google.Chrome.canary",
  "com.brave.Browser",
  "com.microsoft.edgemac",
  "com.vivaldi.Vivaldi",
  "company.thebrowser.Browser",
  "com.operasoftware.Opera",
  "org.chromium.Chromium",
];

export const FIREFOX_BUNDLE_PREFIXES = ["org.mozilla.firefox", "app.zen-browser."];

export const BROWSER_BUNDLE_PREFIXES = [
  "com.apple.Safari",
  "com.google.Chrome",
  "com.brave.",
  "com.microsoft.edge",
  "com.vivaldi.",
  "company.thebrowser.",
  "com.operasoftware.",
  "org.chromium.",
  "org.mozilla.firefox",
  "org.mozilla.pale moon",
  "app.zen-browser.",
  "com.duckduckgo.",
];

export function getRunningBrowserBundleIds(): Promise<string[]> {
  return runOsascript(
    "JavaScript",
    `ObjC.import("AppKit");
    const ws = $.NSWorkspace.sharedWorkspace;
    const apps = ws.runningApplications;
    const out = [];
    for (let i = 0; i < apps.count; i++) {
      const app = apps.objectAtIndex(i);
      const bid = ObjC.unwrap(app.bundleIdentifier);
      if (bid) out.push(bid);
    }
    JSON.stringify(out);`,
  )
    .then((json) => {
      const allIds = JSON.parse(json) as string[];
      return allIds.filter((id) => BROWSER_BUNDLE_PREFIXES.some((p) => id.startsWith(p)));
    })
    .catch(() => []);
}

export const EXTENSION_PORT = 9854;

export async function extensionRequest<T>(body: Record<string, unknown>, timeoutMs = 500): Promise<T> {
  const response = await fetch(`http://127.0.0.1:${EXTENSION_PORT}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  return response.json() as Promise<T>;
}
