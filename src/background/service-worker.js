const FLOW_AI_URL = "https://labs.google/fx/tools/flow";
const PENDING_PROJECTS_KEY = "pendingFlowProjects";
// A multi-product batch can legitimately run for several hours.
// Keep the tab/job mapping alive so cancellation and final cleanup continue
// to work throughout every product in every loop.
const PENDING_TTL_MS = 12 * 60 * 60 * 1000;

async function enableSidePanel() {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}

async function getPendingProjects() {
  const stored = await chrome.storage.session.get(PENDING_PROJECTS_KEY);
  const now = Date.now();
  const pendingProjects = {};
  const expiredJobKeys = [];

  for (const [tabId, project] of Object.entries(stored[PENDING_PROJECTS_KEY] ?? {})) {
    if (project?.createdAt && now - project.createdAt < PENDING_TTL_MS) {
      pendingProjects[tabId] = project;
    } else if (project?.jobId) {
      expiredJobKeys.push(`flowJob:${project.jobId}`);
    }
  }

  await chrome.storage.session.set({ [PENDING_PROJECTS_KEY]: pendingProjects });
  if (expiredJobKeys.length > 0) {
    await chrome.storage.local.remove(expiredJobKeys);
  }
  return pendingProjects;
}

async function addPendingProject(tabId, jobId) {
  const pendingProjects = await getPendingProjects();
  pendingProjects[tabId] = { jobId, createdAt: Date.now() };
  await chrome.storage.session.set({ [PENDING_PROJECTS_KEY]: pendingProjects });
}

async function removePendingProject(tabId) {
  const pendingProjects = await getPendingProjects();
  const project = pendingProjects[tabId];
  delete pendingProjects[tabId];
  await chrome.storage.session.set({ [PENDING_PROJECTS_KEY]: pendingProjects });
  if (project?.jobId) {
    await chrome.storage.local.remove(`flowJob:${project.jobId}`);
  }
}

async function getPendingProject(tabId) {
  const pendingProjects = await getPendingProjects();
  return pendingProjects[tabId] ?? null;
}

chrome.runtime.onInstalled.addListener(enableSidePanel);
chrome.runtime.onStartup.addListener(enableSidePanel);

chrome.tabs.onRemoved.addListener((tabId) => {
  void removePendingProject(tabId);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "createFlowProject") {
    void (async () => {
      let tabId;
      try {
        const jobId = String(message.jobId ?? "");
        const jobKey = `flowJob:${jobId}`;
        const storedJob = await chrome.storage.local.get(jobKey);
        if (!jobId || !storedJob[jobKey]) {
          throw new Error("Flow automation data is missing");
        }

        const tab = await chrome.tabs.create({ url: "about:blank" });
        tabId = tab.id;
        await addPendingProject(tabId, jobId);
        await chrome.tabs.update(tabId, { url: FLOW_AI_URL });
        sendResponse({ ok: true, tabId });
      } catch (error) {
        if (tabId != null) {
          await removePendingProject(tabId);
        } else if (message.jobId) {
          await chrome.storage.local.remove(`flowJob:${message.jobId}`);
        }
        console.error("Could not open Google Flow:", error);
        sendResponse({ ok: false, error: String(error) });
      }
    })();
    return true;
  }

  if (message?.type === "cancelFlowAutomation") {
    void (async () => {
      const requestedTabId = Number(message.tabId);
      const tabId = Number.isInteger(requestedTabId) ? requestedTabId : sender.tab?.id;
      const project = tabId != null ? await getPendingProject(tabId) : null;

      if (project) {
        await chrome.tabs.sendMessage(tabId, { type: "cancelFlowAutomation" }).catch(() => { });
        await removePendingProject(tabId);
      }

      await chrome.runtime.sendMessage({
        type: "flowAutomationStatus",
        status: "cancelled",
      }).catch(() => { });
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message?.type === "flowPageReady" && sender.tab?.id != null) {
    void (async () => {
      const project = await getPendingProject(sender.tab.id);
      sendResponse({
        createProject: Boolean(project),
        jobId: project?.jobId,
      });
    })();
    return true;
  }

  if (message?.type === "flowAutomationFinished" && sender.tab?.id != null) {
    void (async () => {
      await removePendingProject(sender.tab.id);
      await chrome.runtime.sendMessage({
        type: "flowAutomationStatus",
        status: message.status,
        detail: message.detail,
      }).catch(() => { });
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message?.type === "cdpClick" && sender.tab?.id != null) {
    void (async () => {
      const tabId = sender.tab.id;
      const debuggee = { tabId };
      const x = Number(message.x);
      const y = Number(message.y);
      try {
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          throw new Error("Invalid click coordinates");
        }
        await chrome.debugger.attach(debuggee, "1.3");
        try {
          await chrome.debugger.sendCommand(debuggee, "Input.dispatchMouseEvent", {
            type: "mouseMoved",
            x,
            y,
          });
          await chrome.debugger.sendCommand(debuggee, "Input.dispatchMouseEvent", {
            type: "mousePressed",
            x,
            y,
            button: "left",
            buttons: 1,
            clickCount: 1,
          });
          await chrome.debugger.sendCommand(debuggee, "Input.dispatchMouseEvent", {
            type: "mouseReleased",
            x,
            y,
            button: "left",
            buttons: 0,
            clickCount: 1,
          });
          sendResponse({ ok: true });
        } finally {
          await chrome.debugger.detach(debuggee).catch(() => { });
        }
      } catch (error) {
        console.error("CDP click failed:", error);
        sendResponse({ ok: false, error: String(error) });
      }
    })();
    return true;
  }

  if (message?.type === "cdpKeyPress" && sender.tab?.id != null) {
    void (async () => {
      const tabId = sender.tab.id;
      const debuggee = { tabId };
      const keyMap = {
        Enter: {
          key: "Enter",
          code: "Enter",
          windowsVirtualKeyCode: 13,
          nativeVirtualKeyCode: 13,
          text: "\r",
        },
        Tab: {
          key: "Tab",
          code: "Tab",
          windowsVirtualKeyCode: 9,
          nativeVirtualKeyCode: 9,
        },
        Backspace: {
          key: "Backspace",
          code: "Backspace",
          windowsVirtualKeyCode: 8,
          nativeVirtualKeyCode: 8,
        },
        ArrowRight: {
          key: "ArrowRight",
          code: "ArrowRight",
          windowsVirtualKeyCode: 39,
          nativeVirtualKeyCode: 39,
        },
      };
      const keyDef = keyMap[message.key];
      try {
        if (!keyDef) {
          throw new Error(`Unsupported key: ${message.key}`);
        }
        await chrome.debugger.attach(debuggee, "1.3");
        try {
          await chrome.debugger.sendCommand(debuggee, "Input.dispatchKeyEvent", {
            type: "rawKeyDown",
            ...keyDef,
          });
          if (keyDef.text) {
            await chrome.debugger.sendCommand(debuggee, "Input.dispatchKeyEvent", {
              type: "char",
              ...keyDef,
            });
          }
          await chrome.debugger.sendCommand(debuggee, "Input.dispatchKeyEvent", {
            type: "keyUp",
            ...keyDef,
          });
          sendResponse({ ok: true });
        } finally {
          await chrome.debugger.detach(debuggee).catch(() => { });
        }
      } catch (error) {
        console.error("CDP keyPress failed:", error);
        sendResponse({ ok: false, error: String(error) });
      }
    })();
    return true;
  }

  if (message?.type === "cdpInsertText" && sender.tab?.id != null) {
    void (async () => {
      const tabId = sender.tab.id;
      const debuggee = { tabId };
      try {
        await chrome.debugger.attach(debuggee, "1.3");
        try {
          await chrome.debugger.sendCommand(debuggee, "Input.insertText", {
            text: String(message.text ?? ""),
          });
          sendResponse({ ok: true });
        } finally {
          await chrome.debugger.detach(debuggee).catch(() => { });
        }
      } catch (error) {
        console.error("CDP insertText failed:", error);
        sendResponse({ ok: false, error: String(error) });
      }
    })();
    return true;
  }

  return false;
});
