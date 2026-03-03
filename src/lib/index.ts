import { request } from "node:http";
import {
  CHROMIUM_BUNDLE_IDS,
  escapeForAppleScript,
  getDefaultBrowserBundleId,
  runOpen,
  runAppleScript,
} from "./browser-utils.ts";

const EXTENSION_PORT = 9854;
const EXTENSION_REQUEST_TIMEOUT_MS = 350;

/**
 * Focus an existing browser tab whose URL starts with the given URL,
 * or open a new tab. Automatically detects the default browser.
 *
 * - Chromium-based & Safari: full tab search via AppleScript
 * - Firefox-based (Zen, Firefox, etc.): uses a companion WebExtension
 *   via native messaging for tab search, falls back to `open location`
 */
export async function openInBrowserTab(
  url: string,
): Promise<boolean | undefined> {
  const escaped = escapeForAppleScript(url);

  let browserBundleId: string;
  try {
    browserBundleId = await getDefaultBrowserBundleId();
  } catch {
    await runOpen(url);
    return undefined;
  }

  if (CHROMIUM_BUNDLE_IDS.includes(browserBundleId)) {
    return (await openInChromium(browserBundleId, escaped)) === "found";
  }

  if (browserBundleId === "com.apple.Safari") {
    return (await openInSafari(escaped)) === "found";
  }

  return openInFirefoxBased(browserBundleId, url);
}

function openInChromium(browserBundleId: string, url: string) {
  return runAppleScript(`
    tell application id "${escapeForAppleScript(browserBundleId)}"
      activate
      set targetUrl to "${url}"
      repeat with win in windows
        set tabIndex to 0
        repeat with t in tabs of win
          set tabIndex to tabIndex + 1
          if URL of t starts with targetUrl then
            set active tab index of win to tabIndex
            return "found"
          end if
        end repeat
      end repeat
      if not (exists window 1) then
        make new window
      end if
      tell window 1 to make new tab with properties {URL:targetUrl}
      return "new"
    end tell`);
}

function openInSafari(url: string) {
  return runAppleScript(`
    tell application "Safari"
      activate
      set targetUrl to "${url}"
      if not (exists document 1) then
        make new document
      end if
      repeat with win in windows
        repeat with t in tabs of win
          if URL of t starts with targetUrl then
            set current tab of win to t
            return "found"
          end if
        end repeat
      end repeat
      tell window 1
        set newTab to make new tab with properties {URL:targetUrl}
        set current tab to newTab
      end tell
      return "new"
    end tell`);
}

/**
 * Try the companion WebExtension (HTTP → native messaging host → extension).
 * Falls back to activate + open location if the extension isn't installed.
 */
async function openInFirefoxBased(
  browserBundleId: string,
  url: string,
): Promise<boolean> {
  const activate = () =>
    runAppleScript(
      `tell application id "${escapeForAppleScript(browserBundleId)}" to activate`,
    ).catch(() => {});

  try {
    const result = await new Promise<{ status: string }>((resolve, reject) => {
      const req = request(
        {
          hostname: "127.0.0.1",
          port: EXTENSION_PORT,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          timeout: EXTENSION_REQUEST_TIMEOUT_MS,
        },
        (res) => {
          let data = "";
          res.on("data", (c) => (data += c));
          res.on("end", () => {
            try {
              resolve(JSON.parse(data));
            } catch {
              reject(new Error("invalid json"));
            }
          });
        },
      );
      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("timeout"));
      });
      req.end(JSON.stringify({ url }));
    });
    if (result.status === "found" || result.status === "new") {
      await activate();
      return result.status === "found";
    }
  } catch {
    // Extension not running — fall back
  }

  await runOpen(url, browserBundleId);
  return false;
}
