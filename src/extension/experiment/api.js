"use strict";

this.zenSpaces = class extends ExtensionAPI {
  getAPI(context) {
    return {
      zenSpaces: {
        async switchToTabWorkspace(tabId) {
          // Get the real browser tab element from the WebExtension tab ID
          const { tabManager } = context.extension;
          const nativeTab = tabManager.get(tabId)?.nativeTab;
          if (!nativeTab) return false;

          const workspaceId = nativeTab.getAttribute("zen-workspace-id");
          if (!workspaceId) return false;

          // Access the browser window's gZenWorkspaces
          const win = nativeTab.ownerGlobal;
          const zenWorkspaces = win.gZenWorkspaces;
          if (!zenWorkspaces) return false;

          // Check if already in the right workspace
          const activeWorkspace = zenWorkspaces.activeWorkspace;
          if (activeWorkspace === workspaceId) return true;

          await zenWorkspaces.changeWorkspaceWithID(workspaceId);
          return true;
        },
      },
    };
  }
};
