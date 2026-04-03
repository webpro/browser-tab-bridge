import {
  BROWSER_BUNDLE_PREFIXES,
  CHROMIUM_BUNDLE_IDS,
  FIREFOX_BUNDLE_PREFIXES,
  escapeForAppleScript,
  extensionRequest,
  getDefaultBrowserBundleId,
  getRunningBrowserBundleIds,
  runOsascript,
  runOpen,
  runAppleScript,
} from "./browser-utils.ts";

export type BrowserApp = {
  name: string;
  bundleId: string;
};

export async function getInstalledBrowsers(): Promise<BrowserApp[]> {
  try {
    const json = await runOsascript(
      "JavaScript",
      `ObjC.import("AppKit");
      const ws = $.NSWorkspace.sharedWorkspace;
      const url = $.NSURL.URLWithString("https://example.com");
      const apps = ws.URLsForApplicationsToOpenURL(url);
      const out = [];
      if (apps) {
        const count = apps.count;
        for (let i = 0; i < count; i++) {
          const appUrl = apps.objectAtIndex(i);
          const bundle = $.NSBundle.bundleWithURL(appUrl);
          if (!bundle) continue;
          const bundleId = bundle.bundleIdentifier;
          const name = bundle.objectForInfoDictionaryKey("CFBundleName");
          if (!bundleId || !name) continue;
          out.push({ name: ObjC.unwrap(name), bundleId: ObjC.unwrap(bundleId) });
        }
      }
      JSON.stringify(out);`,
    );

    const apps = JSON.parse(json) as BrowserApp[];
    const filtered = apps.filter((app) => BROWSER_BUNDLE_PREFIXES.some((prefix) => app.bundleId.startsWith(prefix)));
    const byBundleId = new Map<string, BrowserApp>();
    for (const app of filtered) {
      byBundleId.set(app.bundleId, app);
    }
    return [...byBundleId.values()].sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

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

async function openInFirefoxBased(
  browserBundleId: string,
  url: string,
): Promise<boolean> {
  const activate = () =>
    runAppleScript(
      `tell application id "${escapeForAppleScript(browserBundleId)}" to activate`,
    ).catch(() => {});

  try {
    const result = await extensionRequest<{ status: string }>({ action: "openTab", url }, 350);
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

/**
 * Get the URL of the active browser tab.
 * Tries the default browser first, then any running browser.
 */
export async function getActiveTabUrl(): Promise<string | null> {
  const tried = new Set<string>();

  const tryBrowser = async (bundleId: string): Promise<string | null> => {
    if (!bundleId || tried.has(bundleId)) return null;
    tried.add(bundleId);

    const escaped = escapeForAppleScript(bundleId);

    if (bundleId.startsWith("com.apple.Safari")) {
      try {
        return await runAppleScript('tell application "Safari" to get URL of front document');
      } catch {}
    }

    if (CHROMIUM_BUNDLE_IDS.includes(bundleId)) {
      try {
        return await runAppleScript(`tell application id "${escaped}" to get URL of active tab of front window`);
      } catch {}
    }

    if (FIREFOX_BUNDLE_PREFIXES.some((p) => bundleId.startsWith(p))) {
      try {
        const result = await extensionRequest<{ status: string; url?: string }>({ action: "getActiveTab" });
        if (result.status === "found" && result.url) return result.url;
      } catch {}
    }

    return null;
  };

  try {
    const defaultId = await getDefaultBrowserBundleId();
    const url = await tryBrowser(defaultId);
    if (url) return url;
  } catch {}

  const running = await getRunningBrowserBundleIds();
  for (const id of running) {
    const url = await tryBrowser(id);
    if (url) return url;
  }

  return null;
}
