let port = null;

// Maintain our own tab registry since browser.tabs.query() only returns
// tabs from the current Zen Space. Event listeners fire across all spaces.
const tabRegistry = new Map(); // tabId -> { url, windowId }

// Seed the registry with whatever tabs are visible now
browser.tabs.query({}).then((tabs) => {
  for (const t of tabs) {
    if (t.url) tabRegistry.set(t.id, { url: t.url, windowId: t.windowId });
  }
  console.log(`browser-tab-bridge: seeded registry with ${tabRegistry.size} tabs`);
});

// Track all tab changes across all spaces
browser.tabs.onCreated.addListener((tab) => {
  if (tab.url) tabRegistry.set(tab.id, { url: tab.url, windowId: tab.windowId });
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || tab.url) {
    tabRegistry.set(tabId, { url: changeInfo.url || tab.url, windowId: tab.windowId });
  }
});

browser.tabs.onRemoved.addListener((tabId) => {
  tabRegistry.delete(tabId);
});

function findTab(url) {
  const normalizedUrl = url.replace(/\/+$/, "");
  for (const [tabId, info] of tabRegistry) {
    if (!info.url) continue;
    const normalizedTab = info.url.replace(/\/+$/, "");
    if (
      normalizedTab === normalizedUrl ||
      normalizedTab.startsWith(normalizedUrl + "/") ||
      normalizedTab.startsWith(normalizedUrl + "?") ||
      normalizedTab.startsWith(normalizedUrl + "#")
    ) {
      return { tabId, ...info };
    }
  }
  return null;
}

function connect() {
  console.log("browser-tab-bridge: connecting to native host...");
  port = browser.runtime.connectNative("browser_tab_bridge");

  port.onMessage.addListener(async (msg) => {
    const { id, action, url } = msg;

    try {
      if (action === "getActiveTab") {
        const activeTabs = await browser.tabs.query({ active: true });
        const webTab = activeTabs.find(t => t.url?.startsWith("http"));
        port.postMessage({ id, status: webTab ? "found" : "not_found", url: webTab?.url ?? null });
      } else if (action === "openTab") {
        // Refresh registry with current space tabs
        const currentTabs = await browser.tabs.query({});
        for (const t of currentTabs) {
          if (t.url) tabRegistry.set(t.id, { url: t.url, windowId: t.windowId });
        }

        const match = findTab(url);

        if (match) {
          if (browser.zenSpaces) {
            await browser.zenSpaces.switchToTabWorkspace(match.tabId);
          }
          await browser.tabs.update(match.tabId, { active: true });
          await browser.windows.update(match.windowId, { focused: true });
          port.postMessage({ id, status: "found" });
        } else {
          await browser.tabs.create({ url, active: true });
          port.postMessage({ id, status: "new" });
        }
      } else {
        port.postMessage({ id, status: "error", message: `unknown action: ${action}` });
      }
    } catch (err) {
      console.error("browser-tab-bridge: error:", err);
      port.postMessage({ id, status: "error", message: err.message });
    }
  });

  port.onDisconnect.addListener(() => {
    const err = browser.runtime.lastError;
    console.error("browser-tab-bridge: disconnected", err?.message ?? port?.error?.message ?? "unknown reason");
    port = null;
    setTimeout(connect, 1000);
  });
}

connect();
