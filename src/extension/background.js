let port = null;

// Maintain our own tab registry since browser.tabs.query() only returns
// tabs from the current Zen Space. Event listeners fire across all spaces.
const tabRegistry = new Map(); // tabId -> { url, windowId }

// Seed the registry with whatever tabs are visible now
browser.tabs.query({}).then((tabs) => {
  for (const t of tabs) {
    if (t.url) tabRegistry.set(t.id, { url: t.url, windowId: t.windowId });
  }
  console.log(`open-in-browser-tab: seeded registry with ${tabRegistry.size} tabs`);
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
  port = browser.runtime.connectNative("open_in_browser_tab");

  port.onMessage.addListener(async (msg) => {
    const { id, url } = msg;

    try {
      // Refresh registry with current space tabs
      const currentTabs = await browser.tabs.query({});
      for (const t of currentTabs) {
        if (t.url) tabRegistry.set(t.id, { url: t.url, windowId: t.windowId });
      }

      const match = findTab(url);

      if (match) {
        // Switch Zen workspace if the tab is in a different space
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
    } catch (err) {
      console.error("open-in-browser-tab: error:", err);
      port.postMessage({ id, status: "error", message: err.message });
    }
  });

  port.onDisconnect.addListener(() => {
    port = null;
    setTimeout(connect, 1000);
  });
}

connect();
