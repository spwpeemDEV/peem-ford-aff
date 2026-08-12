const FLOW_AI_URL = "https://labs.google/fx/tools/flow";
const TIKTOK_UPLOAD_URL =
  "https://www.tiktok.com/tiktokstudio/upload?from=creator_center&tab=video";
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

async function openOrFocusTikTokUploadPage() {
  const uploadTabs = await chrome.tabs.query({
    url: ["https://www.tiktok.com/tiktokstudio/upload*"],
  });
  const existingTab = uploadTabs
    .filter((tab) => Number.isInteger(tab.id))
    .sort((left, right) => (right.lastAccessed || 0) - (left.lastAccessed || 0))[0];

  if (existingTab) {
    if (Number.isInteger(existingTab.windowId)) {
      await chrome.windows.update(existingTab.windowId, { focused: true });
    }
    return {
      tab: await chrome.tabs.update(existingTab.id, { active: true }),
      reused: true,
    };
  }
  return {
    tab: await chrome.tabs.create({ url: TIKTOK_UPLOAD_URL, active: true }),
    reused: false,
  };
}

async function waitForTabComplete(tabId, timeoutMs = 90 * 1000) {
  const currentTab = await chrome.tabs.get(tabId);
  if (currentTab.status === "complete") return currentTab;
  return new Promise((resolve, reject) => {
    let timeoutId;
    const cleanup = () => {
      clearTimeout(timeoutId);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
    };
    const onUpdated = (updatedTabId, changeInfo, tab) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        cleanup();
        resolve(tab);
      }
    };
    const onRemoved = (removedTabId) => {
      if (removedTabId === tabId) {
        cleanup();
        reject(new Error("แท็บ TikTok Studio ถูกปิดก่อนอัปโหลดวิดีโอ"));
      }
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error("TikTok Studio โหลดไม่เสร็จภายในเวลาที่กำหนด"));
    }, timeoutMs);
  });
}

function nodeAttributes(node) {
  const result = {};
  for (let index = 0; index < (node.attributes || []).length; index += 2) {
    result[String(node.attributes[index] || "").toLowerCase()] = String(
      node.attributes[index + 1] || "",
    );
  }
  return result;
}

async function findTikTokVideoInput(debuggee) {
  const documentResult = await chrome.debugger.sendCommand(
    debuggee,
    "DOM.getDocument",
    { depth: -1, pierce: true },
  );
  const nodes = [];
  const visit = (node) => {
    if (!node) return;
    nodes.push(node);
    for (const child of node.children || []) visit(child);
    for (const shadowRoot of node.shadowRoots || []) visit(shadowRoot);
    visit(node.contentDocument);
  };
  visit(documentResult.root);

  return nodes
    .filter((node) => String(node.nodeName || "").toUpperCase() === "INPUT")
    .map((node) => {
      const attributes = nodeAttributes(node);
      if (attributes.type?.toLowerCase() !== "file" || "disabled" in attributes) {
        return { node, score: -1 };
      }
      const identity = `${attributes.accept || ""} ${attributes.name || ""} ${attributes.id || ""}`.toLowerCase();
      let score = 100;
      if (identity.includes("video")) score += 500;
      if (identity.includes(".mp4")) score += 300;
      if (identity.includes("image")) score -= 600;
      return { node, score };
    })
    .filter((candidate) => candidate.score >= 0)
    .sort((left, right) => right.score - left.score)[0]?.node || null;
}

async function setTikTokVideoFile(tabId, localPath, timeoutMs = 60 * 1000) {
  const debuggee = { tabId };
  await chrome.debugger.attach(debuggee, "1.3");
  try {
    const startedAt = Date.now();
    let lastError = null;
    while (Date.now() - startedAt < timeoutMs) {
      try {
        const input = await findTikTokVideoInput(debuggee);
        if (!input?.backendNodeId) {
          throw new Error("ยังไม่พบช่องเลือกวิดีโอของ TikTok");
        }
        await chrome.debugger.sendCommand(debuggee, "DOM.setFileInputFiles", {
          backendNodeId: input.backendNodeId,
          files: [localPath],
        });
        // TikTok replaces/clears the file input as soon as it consumes the
        // selected file. Checking input.files here can therefore create a
        // false failure and repeatedly attach the same video.
        return true;
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    throw lastError || new Error("ไม่พบช่องอัปโหลดวิดีโอของ TikTok");
  } finally {
    await chrome.debugger.detach(debuggee).catch(() => { });
  }
}

async function ensureTikTokUploadMonitor(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["src/content/tiktok/upload-monitor.js"],
  });
}

async function waitForTikTokUploadComplete(tabId) {
  await ensureTikTokUploadMonitor(tabId);
  const response = await chrome.tabs.sendMessage(tabId, {
    type: "WAIT_FOR_TIKTOK_VIDEO_UPLOAD",
    timeoutMs: 15 * 60 * 1000,
  });
  if (!response?.ok) {
    throw new Error(response?.error || "TikTok ยังไม่ยืนยันการอัปโหลดวิดีโอ");
  }
  return true;
}

function descriptionMatches(actualValue, expectedValue) {
  const normalizeText = (value) => String(value || "")
    .replace(/[\u200b-\u200d\ufeff]/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const actual = normalizeText(actualValue);
  const expected = normalizeText(expectedValue);
  if (!expected) return true;
  if (actual === expected || actual.includes(expected)) return true;
  const hashtags = expected.match(/#[^\s#]+/g) || [];
  return hashtags.length > 0 && hashtags.every((tag) => actual.includes(tag));
}

function findMarkedDescriptionNode(root) {
  const nodes = [];
  const visit = (node) => {
    if (!node) return;
    nodes.push(node);
    for (const child of node.children || []) visit(child);
    for (const shadowRoot of node.shadowRoots || []) visit(shadowRoot);
    visit(node.contentDocument);
  };
  visit(root);
  return nodes.find((node) => {
    const attributes = nodeAttributes(node);
    return attributes["data-flow-launcher-tiktok-description"] === "true";
  }) || null;
}

async function setTikTokDescription(tabId, description, expectedFilename = "") {
  const text = String(description || "").trim();
  if (!text) {
    return false;
  }

  const prepared = await chrome.tabs.sendMessage(tabId, {
    type: "PREPARE_TIKTOK_DESCRIPTION",
    expectedFilename,
  });
  if (!prepared?.ok) {
    throw new Error(prepared?.error || "ไม่พบช่องคำอธิบายของ TikTok");
  }

  const debuggee = { tabId };
  await chrome.debugger.attach(debuggee, "1.3");
  try {
    const documentResult = await chrome.debugger.sendCommand(
      debuggee,
      "DOM.getDocument",
      { depth: -1, pierce: true },
    );
    const editorNode = findMarkedDescriptionNode(documentResult.root);
    if (!editorNode?.backendNodeId) {
      throw new Error("ไม่พบตำแหน่งช่องคำอธิบายของ TikTok");
    }
    await chrome.debugger.sendCommand(debuggee, "DOM.focus", {
      backendNodeId: editorNode.backendNodeId,
    });
    const resolvedEditor = await chrome.debugger.sendCommand(
      debuggee,
      "DOM.resolveNode",
      { backendNodeId: editorNode.backendNodeId },
    );
    if (!resolvedEditor?.object?.objectId) {
      throw new Error("ไม่สามารถเข้าถึงช่องคำอธิบายของ TikTok");
    }
    const selectionResult = await chrome.debugger.sendCommand(
      debuggee,
      "Runtime.callFunctionOn",
      {
        objectId: resolvedEditor.object.objectId,
        functionDeclaration: `function () {
          this.focus();
          if (typeof this.select === "function" && "value" in this) {
            this.select();
            return true;
          }
          const selection = this.ownerDocument.defaultView.getSelection();
          const range = this.ownerDocument.createRange();
          range.selectNodeContents(this);
          selection.removeAllRanges();
          selection.addRange(range);
          return !selection.isCollapsed;
        }`,
        returnByValue: true,
      },
    );
    if (selectionResult?.result?.value !== true) {
      throw new Error("เลือกชื่อวิดีโอเดิมในช่องคำอธิบายไม่สำเร็จ");
    }
    await chrome.debugger.sendCommand(debuggee, "Input.insertText", { text });
  } finally {
    await chrome.debugger.detach(debuggee).catch(() => { });
  }

  await new Promise((resolve) => setTimeout(resolve, 500));
  const verified = await chrome.tabs.sendMessage(tabId, {
    type: "READ_TIKTOK_DESCRIPTION",
  });
  if (!verified?.ok || !descriptionMatches(verified.text, text)) {
    const fallback = await chrome.tabs.sendMessage(tabId, {
      type: "APPLY_TIKTOK_DESCRIPTION_FALLBACK",
      text,
      expectedFilename,
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    const fallbackVerified = await chrome.tabs.sendMessage(tabId, {
      type: "READ_TIKTOK_DESCRIPTION",
    });
    if (
      !fallback?.ok ||
      !fallbackVerified?.ok ||
      !descriptionMatches(fallbackVerified.text, text)
    ) {
      throw new Error(
        `วางข้อความและแฮชแท็กในช่องคำอธิบายไม่สำเร็จ (ค่าปัจจุบัน: ${fallbackVerified?.text || "ว่าง"})`,
      );
    }
  }
  return true;
}

chrome.runtime.onInstalled.addListener(enableSidePanel);
chrome.runtime.onStartup.addListener(enableSidePanel);

chrome.tabs.onRemoved.addListener((tabId) => {
  void removePendingProject(tabId);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "uploadVideoToTikTokStudio") {
    void (async () => {
      let videoUploaded = false;
      try {
        const localPath = String(message.localPath || "");
        if (!localPath) {
          throw new Error("ไม่พบ path ของไฟล์วิดีโอชั่วคราว");
        }
        const { tab, reused } = await openOrFocusTikTokUploadPage();
        await waitForTabComplete(tab.id);
        await ensureTikTokUploadMonitor(tab.id);
        const existingUpload = await chrome.tabs.sendMessage(tab.id, {
          type: "CHECK_TIKTOK_VIDEO_UPLOAD_READY",
          expectedFilename: message.originalName,
        });
        if (!existingUpload?.ready) {
          await setTikTokVideoFile(tab.id, localPath);
          await waitForTikTokUploadComplete(tab.id);
        }
        videoUploaded = true;
        const captionApplied = await setTikTokDescription(
          tab.id,
          message.caption,
          message.originalName,
        );
        sendResponse({ ok: true, reused, tabId: tab.id, captionApplied });
      } catch (error) {
        console.error("Could not upload video to TikTok Studio:", error);
        sendResponse({ ok: false, uploaded: videoUploaded, error: String(error) });
      }
    })();
    return true;
  }

  if (message?.type === "openTikTokUploadPage") {
    void (async () => {
      try {
        const uploadTabs = await chrome.tabs.query({
          url: ["https://www.tiktok.com/tiktokstudio/upload*"],
        });
        const existingTab = uploadTabs
          .filter((tab) => Number.isInteger(tab.id))
          .sort((left, right) => (right.lastAccessed || 0) - (left.lastAccessed || 0))[0];

        if (existingTab) {
          if (Number.isInteger(existingTab.windowId)) {
            await chrome.windows.update(existingTab.windowId, { focused: true });
          }
          await chrome.tabs.update(existingTab.id, { active: true });
          sendResponse({ ok: true, reused: true, tabId: existingTab.id });
          return;
        }

        const tab = await chrome.tabs.create({
          url: TIKTOK_UPLOAD_URL,
          active: true,
        });
        sendResponse({ ok: true, reused: false, tabId: tab.id });
      } catch (error) {
        console.error("Could not open TikTok Studio upload page:", error);
        sendResponse({ ok: false, error: String(error) });
      }
    })();
    return true;
  }

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
