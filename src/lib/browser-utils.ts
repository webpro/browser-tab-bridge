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
