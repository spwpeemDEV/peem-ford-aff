const FLOW_AI_URL = "https://labs.google/fx/tools/flow";
const TIKTOK_UPLOAD_URL =
  "https://www.tiktok.com/tiktokstudio/upload?from=creator_center&tab=video";
const TIKTOK_CLICK_SETTLE_MS = 800;
const TIKTOK_FIELD_SETTLE_MS = 900;
const TIKTOK_STAGE_SETTLE_MS = 1200;
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

async function navigateTikTokTabHandlingLeaveDialog(tabId, url) {
  const debuggee = { tabId };
  let attached = false;
  const onDebuggerEvent = (source, method) => {
    if (source.tabId !== tabId || method !== "Page.javascriptDialogOpening") return;
    void chrome.debugger.sendCommand(debuggee, "Page.handleJavaScriptDialog", {
      accept: true,
    }).catch(() => {});
  };

  try {
    await chrome.debugger.attach(debuggee, "1.3");
    attached = true;
    chrome.debugger.onEvent.addListener(onDebuggerEvent);
    await chrome.debugger.sendCommand(debuggee, "Page.enable");
    await chrome.debugger.sendCommand(debuggee, "Page.navigate", { url });
    // Keep the debugger attached briefly so a delayed beforeunload dialog can
    // be accepted before the next clip waits for page completion.
    await new Promise((resolve) => setTimeout(resolve, 1200));
  } finally {
    chrome.debugger.onEvent.removeListener(onDebuggerEvent);
    if (attached) {
      await chrome.debugger.detach(debuggee).catch(() => {});
    }
  }
  return chrome.tabs.get(tabId);
}

async function getReusableTikTokTab(preferredTabId) {
  const requestedTabId = Number(preferredTabId);
  if (Number.isInteger(requestedTabId)) {
    try {
      const preferredTab = await chrome.tabs.get(requestedTabId);
      if (/^https:\/\/www\.tiktok\.com\/tiktokstudio(?:\/|$)/i.test(
        String(preferredTab.url || ""),
      )) {
        return preferredTab;
      }
    } catch {
      // The remembered tab was closed. Fall back to another TikTok Studio tab
      // and create a new one only when none remains.
    }
  }

  const uploadTabs = await chrome.tabs.query({
    url: [
      "https://www.tiktok.com/tiktokstudio/upload*",
      "https://www.tiktok.com/tiktokstudio/*",
    ],
  });
  return uploadTabs
    .filter((tab) => Number.isInteger(tab.id))
    .sort((left, right) => (right.lastAccessed || 0) - (left.lastAccessed || 0))[0];
}

async function openOrFocusTikTokUploadPage({
  forceFresh = false,
  preferredTabId = null,
} = {}) {
  const existingTab = await getReusableTikTokTab(preferredTabId);

  if (existingTab) {
    if (Number.isInteger(existingTab.windowId)) {
      await chrome.windows.update(existingTab.windowId, { focused: true });
    }
    const tab = forceFresh
      ? await navigateTikTokTabHandlingLeaveDialog(
        existingTab.id,
        `${TIKTOK_UPLOAD_URL}&flow_queue=${Date.now()}`,
      )
      : await chrome.tabs.update(existingTab.id, { active: true });
    return {
      tab,
      reused: true,
      refreshed: forceFresh,
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
  return actual === expected;
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

async function dispatchSelectAll(debuggee) {
  await chrome.debugger.sendCommand(debuggee, "Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    key: "a",
    code: "KeyA",
    modifiers: 2,
    windowsVirtualKeyCode: 65,
    nativeVirtualKeyCode: 65,
  });
  await chrome.debugger.sendCommand(debuggee, "Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "a",
    code: "KeyA",
    modifiers: 2,
    windowsVirtualKeyCode: 65,
    nativeVirtualKeyCode: 65,
  });
}

async function readTikTokDescription(tabId, expectedFilename = "") {
  return chrome.tabs.sendMessage(tabId, {
    type: "READ_TIKTOK_DESCRIPTION",
    expectedFilename,
  });
}

async function descriptionRemainsExact(tabId, text, expectedFilename = "") {
  // TikTok may reconcile its controlled editor shortly after an input event.
  // Require repeated exact reads so a temporarily correct DOM value is not
  // accepted while the old generated filename is still in React state.
  for (let check = 0; check < 3; check += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const current = await readTikTokDescription(tabId, expectedFilename);
    if (!current?.ok || !descriptionMatches(current.text, text)) {
      return { ok: false, text: current?.text || "" };
    }
  }
  return { ok: true, text };
}

async function setTikTokDescription(
  tabId,
  description,
  expectedFilename = "",
  attempt = 0,
) {
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
  // The editor is React-controlled and can still be hydrating even after it
  // becomes visible. Let it settle before selecting its generated filename.
  await new Promise((resolve) => setTimeout(resolve, TIKTOK_FIELD_SETTLE_MS));

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
      // The native shortcut below is more reliable for React/contenteditable
      // editors. Keep going even when the DOM Range cannot report selection.
    }
    await dispatchSelectAll(debuggee);
    await new Promise((resolve) => setTimeout(resolve, 350));
    await chrome.debugger.sendCommand(debuggee, "Input.dispatchKeyEvent", {
      type: "rawKeyDown",
      key: "Backspace",
      code: "Backspace",
      windowsVirtualKeyCode: 8,
      nativeVirtualKeyCode: 8,
    });
    await chrome.debugger.sendCommand(debuggee, "Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Backspace",
      code: "Backspace",
      windowsVirtualKeyCode: 8,
      nativeVirtualKeyCode: 8,
    });
    await new Promise((resolve) => setTimeout(resolve, TIKTOK_FIELD_SETTLE_MS));
    const clearedResult = await chrome.debugger.sendCommand(
      debuggee,
      "Runtime.callFunctionOn",
      {
        objectId: resolvedEditor.object.objectId,
        functionDeclaration: `function () {
          const read = () => String("value" in this ? this.value : (this.innerText || this.textContent || ""));
          if (read().replace(/\\s+/g, " ").trim()) {
            if ("value" in this) {
              const prototype = this instanceof HTMLTextAreaElement
                ? HTMLTextAreaElement.prototype
                : HTMLInputElement.prototype;
              Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(this, "");
            } else {
              this.replaceChildren();
            }
            this.dispatchEvent(new InputEvent("input", {
              bubbles: true,
              composed: true,
              inputType: "deleteContentBackward",
              data: null,
            }));
            this.dispatchEvent(new Event("change", { bubbles: true }));
          }
          this.focus();
          return read().replace(/\\s+/g, " ").trim();
        }`,
        returnByValue: true,
      },
    );
    if (String(clearedResult?.result?.value || "").trim()) {
      throw new Error("ลบชื่อวิดีโอเดิมในช่องคำอธิบายไม่สำเร็จ");
    }
    await new Promise((resolve) => setTimeout(resolve, TIKTOK_FIELD_SETTLE_MS));
    await chrome.debugger.sendCommand(debuggee, "DOM.focus", {
      backendNodeId: editorNode.backendNodeId,
    });
    // Select/delete once more immediately before insertion. This prevents a
    // late TikTok reconciliation from restoring the filename between clear
    // and insert, which otherwise produces "filename#hashtag".
    await dispatchSelectAll(debuggee);
    await chrome.debugger.sendCommand(debuggee, "Input.dispatchKeyEvent", {
      type: "rawKeyDown",
      key: "Backspace",
      code: "Backspace",
      windowsVirtualKeyCode: 8,
      nativeVirtualKeyCode: 8,
    });
    await chrome.debugger.sendCommand(debuggee, "Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Backspace",
      code: "Backspace",
      windowsVirtualKeyCode: 8,
      nativeVirtualKeyCode: 8,
    });
    await new Promise((resolve) => setTimeout(resolve, TIKTOK_FIELD_SETTLE_MS));
    await chrome.debugger.sendCommand(debuggee, "Input.insertText", { text });
  } finally {
    await chrome.debugger.detach(debuggee).catch(() => { });
  }

  // Wait for TikTok to commit the controlled-editor value before reading it.
  await new Promise((resolve) => setTimeout(resolve, TIKTOK_STAGE_SETTLE_MS));
  const verified = await descriptionRemainsExact(tabId, text, expectedFilename);
  if (!verified.ok && attempt < 1) {
    await new Promise((resolve) => setTimeout(resolve, TIKTOK_STAGE_SETTLE_MS));
    return setTikTokDescription(tabId, text, expectedFilename, attempt + 1);
  }
  if (!verified.ok) {
    const fallback = await chrome.tabs.sendMessage(tabId, {
      type: "APPLY_TIKTOK_DESCRIPTION_FALLBACK",
      text,
      expectedFilename,
    });
    await new Promise((resolve) => setTimeout(resolve, TIKTOK_STAGE_SETTLE_MS));
    const fallbackVerified = await descriptionRemainsExact(
      tabId,
      text,
      expectedFilename,
    );
    if (
      !fallback?.ok ||
      !fallbackVerified.ok
    ) {
      throw new Error(
        `วางข้อความและแฮชแท็กในช่องคำอธิบายไม่สำเร็จ (ค่าปัจจุบัน: ${fallbackVerified.text || "ว่าง"})`,
      );
    }
  }
  return true;
}

function findMarkedProductSearchNode(root) {
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
    return attributes["data-flow-launcher-tiktok-product-search"] === "true";
  }) || null;
}

function findMarkedScheduleNode(root, kind) {
  const attributeName = kind === "time"
    ? "data-flow-launcher-tiktok-schedule-time"
    : "data-flow-launcher-tiktok-schedule-date";
  const nodes = [];
  const visit = (node) => {
    if (!node) return;
    nodes.push(node);
    for (const child of node.children || []) visit(child);
    for (const shadowRoot of node.shadowRoots || []) visit(shadowRoot);
    visit(node.contentDocument);
  };
  visit(root);
  return nodes.find((node) => nodeAttributes(node)[attributeName] === "true") || null;
}

async function clickTikTokCoordinate(tabId, target) {
  const x = Number(target?.x);
  const y = Number(target?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error("ไม่พบตำแหน่งปุ่มที่ต้องคลิกใน TikTok Studio");
  }
  const debuggee = { tabId };
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
  } finally {
    await chrome.debugger.detach(debuggee).catch(() => { });
  }
  await new Promise((resolve) => setTimeout(resolve, TIKTOK_CLICK_SETTLE_MS));
}

async function findAndClickTikTokTarget(tabId, messageType, timeoutMs, payload = {}) {
  const target = await chrome.tabs.sendMessage(tabId, {
    type: messageType,
    timeoutMs,
    ...payload,
  });
  if (!target?.ok) {
    throw new Error(target?.error || "ไม่พบปุ่มใน TikTok Studio");
  }
  if (!target.skipClick) {
    await clickTikTokCoordinate(tabId, target);
  }
  return target;
}

async function enterTikTokProductId(tabId, productId) {
  const value = String(productId || "").trim();
  if (!value) throw new Error("ไม่พบ Product ID สำหรับค้นหาสินค้า");

  const prepared = await chrome.tabs.sendMessage(tabId, {
    type: "PREPARE_TIKTOK_PRODUCT_SEARCH",
    timeoutMs: 60 * 1000,
  });
  if (!prepared?.ok) {
    throw new Error(prepared?.error || "ไม่พบช่องค้นหาสินค้าใน TikTok Studio");
  }

  const debuggee = { tabId };
  await chrome.debugger.attach(debuggee, "1.3");
  try {
    const documentResult = await chrome.debugger.sendCommand(
      debuggee,
      "DOM.getDocument",
      { depth: -1, pierce: true },
    );
    const inputNode = findMarkedProductSearchNode(documentResult.root);
    if (!inputNode?.backendNodeId) {
      throw new Error("ไม่พบตำแหน่งช่องค้นหาสินค้าใน TikTok Studio");
    }
    await chrome.debugger.sendCommand(debuggee, "DOM.focus", {
      backendNodeId: inputNode.backendNodeId,
    });
    const resolvedInput = await chrome.debugger.sendCommand(
      debuggee,
      "DOM.resolveNode",
      { backendNodeId: inputNode.backendNodeId },
    );
    if (!resolvedInput?.object?.objectId) {
      throw new Error("ไม่สามารถเข้าถึงช่องค้นหาสินค้าของ TikTok");
    }
    await chrome.debugger.sendCommand(debuggee, "Runtime.callFunctionOn", {
      objectId: resolvedInput.object.objectId,
      functionDeclaration: `function () {
        this.focus();
        if (typeof this.select === "function") this.select();
        return true;
      }`,
      returnByValue: true,
    });
    await chrome.debugger.sendCommand(debuggee, "Input.insertText", { text: value });
    const readResult = await chrome.debugger.sendCommand(
      debuggee,
      "Runtime.callFunctionOn",
      {
        objectId: resolvedInput.object.objectId,
        functionDeclaration: `function () {
          return String("value" in this ? this.value : (this.innerText || this.textContent || ""));
        }`,
        returnByValue: true,
      },
    );
    if (!String(readResult?.result?.value || "").includes(value)) {
      throw new Error("วาง Product ID ในช่องค้นหาสินค้าไม่สำเร็จ");
    }
    await chrome.debugger.sendCommand(debuggee, "Input.dispatchKeyEvent", {
      type: "rawKeyDown",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
    });
    await chrome.debugger.sendCommand(debuggee, "Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
    });
  } finally {
    await chrome.debugger.detach(debuggee).catch(() => { });
  }
  await new Promise((resolve) => setTimeout(resolve, TIKTOK_STAGE_SETTLE_MS));
  return true;
}

async function prepareTikTokScheduleFields(tabId) {
  const prepared = await chrome.tabs.sendMessage(tabId, {
    type: "PREPARE_TIKTOK_SCHEDULE_FIELDS",
    timeoutMs: 30 * 1000,
  });
  if (!prepared?.ok) {
    throw new Error(prepared?.error || "ไม่พบช่องวันและเวลาสำหรับตั้งเวลาโพสต์");
  }
  return prepared;
}

async function setTikTokScheduleField(tabId, kind, value) {
  const expected = String(value || "").trim();
  const debuggee = { tabId };
  await chrome.debugger.attach(debuggee, "1.3");
  try {
    const documentResult = await chrome.debugger.sendCommand(
      debuggee,
      "DOM.getDocument",
      { depth: -1, pierce: true },
    );
    const inputNode = findMarkedScheduleNode(documentResult.root, kind);
    if (!inputNode?.backendNodeId) {
      throw new Error(`ไม่พบช่อง${kind === "time" ? "เวลา" : "วันที่"}โพสต์ของ TikTok`);
    }
    await chrome.debugger.sendCommand(debuggee, "DOM.focus", {
      backendNodeId: inputNode.backendNodeId,
    });
    const resolvedInput = await chrome.debugger.sendCommand(
      debuggee,
      "DOM.resolveNode",
      { backendNodeId: inputNode.backendNodeId },
    );
    if (!resolvedInput?.object?.objectId) {
      throw new Error(`ไม่สามารถเข้าถึงช่อง${kind === "time" ? "เวลา" : "วันที่"}โพสต์`);
    }
    await chrome.debugger.sendCommand(debuggee, "Runtime.callFunctionOn", {
      objectId: resolvedInput.object.objectId,
      functionDeclaration: `function () {
        this.focus();
        if (typeof this.select === "function") this.select();
        return true;
      }`,
      returnByValue: true,
    });
    await chrome.debugger.sendCommand(debuggee, "Input.insertText", { text: expected });
    let readResult = await chrome.debugger.sendCommand(
      debuggee,
      "Runtime.callFunctionOn",
      {
        objectId: resolvedInput.object.objectId,
        functionDeclaration: `function () { return String(this.value || this.textContent || ""); }`,
        returnByValue: true,
      },
    );
    if (!String(readResult?.result?.value || "").includes(expected)) {
      readResult = await chrome.debugger.sendCommand(
        debuggee,
        "Runtime.callFunctionOn",
        {
          objectId: resolvedInput.object.objectId,
          functionDeclaration: `function (nextValue) {
            if ("value" in this) {
              const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
              setter?.call(this, nextValue);
            } else {
              this.textContent = nextValue;
            }
            this.dispatchEvent(new InputEvent("input", {
              bubbles: true,
              composed: true,
              inputType: "insertReplacementText",
              data: nextValue,
            }));
            this.dispatchEvent(new Event("change", { bubbles: true }));
            return String(this.value || this.textContent || "");
          }`,
          arguments: [{ value: expected }],
          returnByValue: true,
        },
      );
    }
    if (!String(readResult?.result?.value || "").includes(expected)) {
      throw new Error(`กรอก${kind === "time" ? "เวลา" : "วันที่"}โพสต์ไม่สำเร็จ`);
    }
    await chrome.debugger.sendCommand(debuggee, "Input.dispatchKeyEvent", {
      type: "rawKeyDown",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
    });
    await chrome.debugger.sendCommand(debuggee, "Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
    });
  } finally {
    await chrome.debugger.detach(debuggee).catch(() => { });
  }
  await new Promise((resolve) => setTimeout(resolve, TIKTOK_CLICK_SETTLE_MS));
}

async function configureTikTokPostTime(tabId, publishMode, scheduledAt) {
  const mode = publishMode === "schedule" ? "schedule" : "now";
  await findAndClickTikTokTarget(
    tabId,
    "FIND_TIKTOK_POST_TIME_RADIO",
    30 * 1000,
    { publishMode: mode },
  );
  if (mode === "now") return true;

  const scheduledValue = String(scheduledAt || "").trim();
  const match = scheduledValue.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (!match) throw new Error("รูปแบบวันและเวลาที่ตั้งไว้ไม่ถูกต้อง");
  const [, dateValue, timeValue] = match;
  const [hourValue, minuteValue] = timeValue.split(":");

  const currentTime = await chrome.tabs.sendMessage(tabId, {
    type: "READ_TIKTOK_SCHEDULE_VALUE",
    kind: "time",
  });
  if (String(currentTime?.value || "").trim() !== timeValue) {
    await findAndClickTikTokTarget(
      tabId,
      "FIND_TIKTOK_SCHEDULE_CONTROL",
      30 * 1000,
      { kind: "time" },
    );
    await findAndClickTikTokTarget(
      tabId,
      "FIND_TIKTOK_TIME_OPTION",
      30 * 1000,
      { kind: "hour", value: hourValue },
    );
    await findAndClickTikTokTarget(
      tabId,
      "FIND_TIKTOK_TIME_OPTION",
      30 * 1000,
      { kind: "minute", value: minuteValue },
    );
  }

  const scheduleDateMatches = (actualValue, expectedValue) => {
    const actual = String(actualValue || "").trim();
    const expectedMatch = String(expectedValue || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!actual || !expectedMatch) return false;
    const [, year, month, day] = expectedMatch;
    const buddhistYear = String(Number(year) + 543);
    const normalizedActual = actual.replace(/[.]/g, "/").replace(/-/g, "/");
    const shortMonth = String(Number(month));
    const shortDay = String(Number(day));
    const parsedTimestamp = Date.parse(actual);
    if (Number.isFinite(parsedTimestamp)) {
      const parsedDate = new Date(parsedTimestamp);
      if (
        parsedDate.getFullYear() === Number(year)
        && parsedDate.getMonth() + 1 === Number(month)
        && parsedDate.getDate() === Number(day)
      ) {
        return true;
      }
    }
    const variants = [
      `${year}/${month}/${day}`,
      `${month}/${day}/${year}`,
      `${day}/${month}/${year}`,
      `${year}/${shortMonth}/${shortDay}`,
      `${shortMonth}/${shortDay}/${year}`,
      `${shortDay}/${shortMonth}/${year}`,
      `${buddhistYear}/${month}/${day}`,
      `${month}/${day}/${buddhistYear}`,
      `${day}/${month}/${buddhistYear}`,
      `${buddhistYear}/${shortMonth}/${shortDay}`,
      `${shortMonth}/${shortDay}/${buddhistYear}`,
      `${shortDay}/${shortMonth}/${buddhistYear}`,
    ];
    return actual.includes(`${year}-${month}-${day}`)
      || variants.some((variant) => normalizedActual.includes(variant));
  };

  const currentDate = await chrome.tabs.sendMessage(tabId, {
    type: "READ_TIKTOK_SCHEDULE_VALUE",
    kind: "date",
  });
  if (!scheduleDateMatches(currentDate?.value, dateValue)) {
    await findAndClickTikTokTarget(
      tabId,
      "FIND_TIKTOK_SCHEDULE_CONTROL",
      30 * 1000,
      { kind: "date" },
    );
    let selectedDate = false;
    for (let attempt = 0; attempt < 14; attempt += 1) {
      const target = await findAndClickTikTokTarget(
        tabId,
        "FIND_TIKTOK_DATE_OPTION",
        30 * 1000,
        { dateValue },
      );
      if (target.action === "date") {
        selectedDate = true;
        break;
      }
      if (!String(target.action || "").startsWith("navigate-")) {
        throw new Error(`ไม่สามารถเลือกวันที่ ${dateValue} ในปฏิทิน TikTok`);
      }
    }
    if (!selectedDate) {
      throw new Error(`ปฏิทิน TikTok เลื่อนไปยังวันที่ ${dateValue} ไม่สำเร็จ`);
    }

    let appliedDate = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      appliedDate = await chrome.tabs.sendMessage(tabId, {
        type: "READ_TIKTOK_SCHEDULE_VALUE",
        kind: "date",
      });
      if (scheduleDateMatches(appliedDate?.value, dateValue)) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!scheduleDateMatches(appliedDate?.value, dateValue)) {
      throw new Error(
        `TikTok ไม่ยืนยันวันที่ ${dateValue} (ค่าปัจจุบัน: ${String(appliedDate?.value || "ว่าง")})`,
      );
    }
  }
  return true;
}

async function openTikTokProductLinkSearch(tabId, productId) {
  await findAndClickTikTokTarget(tabId, "FIND_TIKTOK_ADD_LINK_BUTTON", 60 * 1000);
  await findAndClickTikTokTarget(tabId, "FIND_TIKTOK_LINK_NEXT_BUTTON", 30 * 1000);
  await enterTikTokProductId(tabId, productId);
  await findAndClickTikTokTarget(
    tabId,
    "FIND_TIKTOK_PRODUCT_RADIO",
    60 * 1000,
    { productId },
  );
  await findAndClickTikTokTarget(
    tabId,
    "FIND_TIKTOK_PRODUCT_NEXT_BUTTON",
    30 * 1000,
    { productId },
  );
  await findAndClickTikTokTarget(
    tabId,
    "FIND_TIKTOK_CONFIRM_ADD_BUTTON",
    30 * 1000,
  );
  return true;
}

async function enableTikTokAiGeneratedContent(tabId) {
  await findAndClickTikTokTarget(
    tabId,
    "FIND_TIKTOK_SHOW_MORE_BUTTON",
    30 * 1000,
  );
  await new Promise((resolve) => setTimeout(resolve, TIKTOK_CLICK_SETTLE_MS));
  const toggleTarget = await findAndClickTikTokTarget(
    tabId,
    "FIND_TIKTOK_AI_CONTENT_TOGGLE",
    30 * 1000,
  );

  if (toggleTarget.stateReadable === false) {
    await new Promise((resolve) => setTimeout(resolve, TIKTOK_FIELD_SETTLE_MS));
    return true;
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < 8 * 1000) {
    const state = await chrome.tabs.sendMessage(tabId, {
      type: "READ_TIKTOK_AI_CONTENT_TOGGLE",
    });
    if (state?.enabled) return true;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error('เปิดสวิตช์ "เนื้อหาที่สร้างโดย AI" ไม่สำเร็จ');
}

async function waitForTikTokPublishConfirmation(
  tabId,
  publishMode,
  timeoutMs = 2 * 60 * 1000,
) {
  const startedAt = Date.now();
  const initialTab = await chrome.tabs.get(tabId);
  const initialUrl = String(initialTab.url || "");
  let stableChecks = 0;

  while (Date.now() - startedAt < timeoutMs) {
    const currentTab = await chrome.tabs.get(tabId);
    const currentUrl = String(currentTab.url || "");
    if (
      currentUrl &&
      currentUrl !== initialUrl &&
      !/\/tiktokstudio\/upload/i.test(currentUrl)
    ) {
      return { ok: true, ready: true, evidence: "navigation" };
    }

    let status = null;
    try {
      if (currentTab.status === "complete") {
        await ensureTikTokUploadMonitor(tabId);
      }
      status = await chrome.tabs.sendMessage(tabId, {
        type: "CHECK_TIKTOK_PUBLISH_RESULT",
        publishMode,
      });
    } catch {
      // A successful post can replace the document while we are polling.
      // Re-read the tab on the next pass instead of treating that as failure.
    }

    if (status?.failed) {
      throw new Error(status.error || "TikTok แจ้งว่าโพสต์ไม่สำเร็จ");
    }
    if (status?.ready) {
      stableChecks += 1;
      if (stableChecks >= 2) return status;
    } else {
      stableChecks = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  throw new Error(
    publishMode === "schedule"
      ? "หมดเวลารอ TikTok ยืนยันว่าตั้งเวลาโพสต์สำเร็จ"
      : "หมดเวลารอ TikTok ยืนยันว่าโพสต์สำเร็จ",
  );
}

async function waitForTikTokValidationAndPublish(tabId, publishMode) {
  let validation = await chrome.tabs.sendMessage(tabId, {
    type: "WAIT_FOR_TIKTOK_VALIDATION",
    timeoutMs: 15 * 60 * 1000,
  });
  if (validation?.needsDisableLite) {
    await findAndClickTikTokTarget(
      tabId,
      "FIND_TIKTOK_DISABLE_LITE_TOGGLE",
      30 * 1000,
    );
    const startedAt = Date.now();
    let disabled = false;
    while (Date.now() - startedAt < 8 * 1000) {
      const state = await chrome.tabs.sendMessage(tabId, {
        type: "READ_TIKTOK_LITE_TOGGLE",
      });
      if (state?.ok && !state.enabled) {
        disabled = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
    if (!disabled) {
      throw new Error('ปิดสวิตช์ "การตรวจสอบเนื้อหาแบบ Lite" ไม่สำเร็จ');
    }
    validation = {
      ...validation,
      ok: true,
      ready: true,
      validationSkipped: true,
      warning: validation.warning || "ปิด Lite เพราะเนื้อหาอาจถูกจำกัด",
    };
  }
  if (!validation?.ok || !validation.ready) {
    throw new Error(validation?.error || "การตรวจสอบของ TikTok ยังไม่เสร็จ");
  }
  await new Promise((resolve) => setTimeout(resolve, TIKTOK_CLICK_SETTLE_MS));
  await findAndClickTikTokTarget(
    tabId,
    "FIND_TIKTOK_FINAL_PUBLISH_BUTTON",
    30 * 1000,
    { publishMode: publishMode === "schedule" ? "schedule" : "now" },
  );
  const publishConfirmation = await waitForTikTokPublishConfirmation(
    tabId,
    publishMode === "schedule" ? "schedule" : "now",
  );
  if (!publishConfirmation?.ok || !publishConfirmation.ready) {
    throw new Error(
      publishConfirmation?.error ||
      "TikTok ยังไม่ยืนยันผลการโพสต์ กรุณาตรวจสอบหน้า TikTok Studio",
    );
  }
  return {
    ok: true,
    publishConfirmed: true,
    publishEvidence: String(publishConfirmation.evidence || ""),
    validationSkipped: Boolean(validation.validationSkipped),
    warning: String(validation.warning || ""),
  };
}

async function sendTikTokFlowStatus(tabId, options = {}) {
  if (!Number.isInteger(tabId)) return;
  const queueIndex = Math.max(1, Number(options.queueIndex) || 1);
  const queueTotal = Math.max(queueIndex, Number(options.queueTotal) || 1);
  const localProgress = Math.max(0, Math.min(100, Number(options.localProgress) || 0));
  const overallProgress = Math.round(
    (((queueIndex - 1) * 100) + localProgress) / queueTotal,
  );
  await chrome.tabs.sendMessage(tabId, {
    type: "SHOW_TIKTOK_FLOW_STATUS",
    detail: String(options.detail || "กำลังเตรียม TikTok Studio…"),
    stageLabel: String(options.stageLabel || "กำลังดำเนินการ"),
    state: String(options.state || "working"),
    progress: overallProgress,
    queueIndex,
    queueTotal,
    startedAt: Number(options.startedAt) || Date.now(),
  }).catch(() => {});
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
      let stage = "upload";
      let tabId = null;
      let localProgress = 0;
      const queueIndex = Math.max(1, Number(message.queueIndex) || 1);
      const queueTotal = Math.max(queueIndex, Number(message.queueTotal) || 1);
      const flowStartedAt = Number(message.queueStartedAt) || Date.now();
      const reportStatus = async (detail, stageLabel, progress, state = "working") => {
        localProgress = progress;
        await sendTikTokFlowStatus(tabId, {
          detail,
          stageLabel,
          localProgress: progress,
          state,
          queueIndex,
          queueTotal,
          startedAt: flowStartedAt,
        });
      };
      try {
        const localPath = String(message.localPath || "");
        if (!localPath) {
          throw new Error("ไม่พบ path ของไฟล์วิดีโอชั่วคราว");
        }
        const forceFreshUpload = Boolean(message.forceFreshUpload);
        const { tab, reused } = await openOrFocusTikTokUploadPage({
          forceFresh: forceFreshUpload,
          preferredTabId: message.tiktokTabId,
        });
        tabId = tab.id;
        await waitForTabComplete(tab.id);
        await ensureTikTokUploadMonitor(tab.id);
        await reportStatus(
          `กำลังเตรียมคลิป ${queueIndex}/${queueTotal}`,
          "เตรียม TikTok Studio",
          5,
        );
        const existingUpload = forceFreshUpload
          ? { ready: false }
          : await chrome.tabs.sendMessage(tab.id, {
            type: "CHECK_TIKTOK_VIDEO_UPLOAD_READY",
            expectedFilename: message.originalName,
          });
        if (forceFreshUpload || !existingUpload?.ready) {
          await reportStatus(
            "กำลังส่งไฟล์วิดีโอไปยังช่องอัปโหลด…",
            "อัปโหลดวิดีโอ",
            12,
          );
          await setTikTokVideoFile(tab.id, localPath);
          await reportStatus(
            "TikTok กำลังประมวลผลวิดีโอ กรุณารอสักครู่…",
            "อัปโหลดวิดีโอ",
            20,
          );
          await waitForTikTokUploadComplete(tab.id);
        }
        videoUploaded = true;
        await reportStatus(
          "อัปโหลดวิดีโอเสร็จแล้ว กำลังเตรียมรายละเอียด…",
          "อัปโหลดวิดีโอ",
          30,
        );
        await new Promise((resolve) => setTimeout(resolve, TIKTOK_STAGE_SETTLE_MS));
        stage = "caption";
        await reportStatus(
          "กำลังใส่ข้อความและแฮชแท็ก…",
          "คำอธิบายวิดีโอ",
          36,
        );
        const captionApplied = await setTikTokDescription(
          tab.id,
          message.caption,
          message.originalName,
        );
        let productSearchStarted = false;
        if (String(message.productId || "").trim()) {
          // Description/hashtags must be fully committed before opening the
          // product modal; otherwise TikTok can restore the generated title.
          await new Promise((resolve) => setTimeout(resolve, TIKTOK_STAGE_SETTLE_MS));
          stage = "product-link";
          await reportStatus(
            `กำลังผูกสินค้า ${String(message.productName || message.productId || "").trim()}…`,
            "ปักตะกร้าสินค้า",
            48,
          );
          productSearchStarted = await openTikTokProductLinkSearch(
            tab.id,
            message.productId,
          );
          stage = "post-time";
          await reportStatus(
            message.publishMode === "schedule"
              ? "กำลังตั้งวันและเวลาโพสต์…"
              : "กำลังตั้งค่าโพสต์ทันที…",
            "ตั้งเวลาโพสต์",
            63,
          );
          await configureTikTokPostTime(
            tab.id,
            message.publishMode,
            message.scheduledAt,
          );
          stage = "ai-label";
          await reportStatus(
            "กำลังเปิดป้ายเนื้อหาที่สร้างโดย AI…",
            "ตั้งค่าเนื้อหา AI",
            74,
          );
          await enableTikTokAiGeneratedContent(tab.id);
          stage = "validation";
          await reportStatus(
            "กำลังรอ TikTok ตรวจสอบวิดีโอให้เสร็จ…",
            "ตรวจสอบก่อนโพสต์",
            84,
          );
          var publishResult = await waitForTikTokValidationAndPublish(
            tab.id,
            message.publishMode,
          );
        }
        await reportStatus(
          productSearchStarted
            ? `คลิป ${queueIndex}/${queueTotal} โพสต์เรียบร้อยแล้ว`
            : "เตรียมวิดีโอและคำอธิบายเรียบร้อยแล้ว",
          productSearchStarted ? "สำเร็จ" : "พร้อมใช้งาน",
          100,
          queueIndex === queueTotal ? "success" : "working",
        );
        sendResponse({
          ok: true,
          reused,
          refreshedForQueue: forceFreshUpload,
          tabId: tab.id,
          captionApplied,
          productSearchStarted,
          postTimingConfigured: productSearchStarted,
          aiContentLabeled: productSearchStarted,
          published: Boolean(productSearchStarted && publishResult?.publishConfirmed),
          validationSkipped: Boolean(publishResult?.validationSkipped),
          warning: String(publishResult?.warning || ""),
          productId: String(message.productId || "").trim(),
        });
      } catch (error) {
        console.error("Could not upload video to TikTok Studio:", error);
        await reportStatus(
          `หยุดที่ขั้นตอน ${stage}: ${String(error)}`,
          "ดำเนินการไม่สำเร็จ",
          localProgress,
          "error",
        );
        sendResponse({
          ok: false,
          uploaded: videoUploaded,
          stage,
          tabId,
          error: String(error),
        });
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
