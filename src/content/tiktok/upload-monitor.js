(() => {
  if (globalThis.__flowLauncherTikTokUploadMonitorInstalled) {
    return;
  }
  globalThis.__flowLauncherTikTokUploadMonitorInstalled = true;

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
  let statusTimerId = null;
  let statusStartedAt = 0;

  function formatStatusElapsed(milliseconds) {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const twoDigits = (value) => String(value).padStart(2, "0");
    return hours > 0
      ? `${hours}:${twoDigits(minutes)}:${twoDigits(seconds)}`
      : `${twoDigits(minutes)}:${twoDigits(seconds)}`;
  }

  function updateTikTokStatusTimer() {
    const elapsed = document.querySelector("#flow-launcher-tiktok-elapsed");
    if (!elapsed || !statusStartedAt) return;
    elapsed.textContent = formatStatusElapsed(Date.now() - statusStartedAt);
  }

  function ensureTikTokStatusCard() {
    let card = document.querySelector("#flow-launcher-tiktok-status");
    if (card) return card;

    card = document.createElement("section");
    card.id = "flow-launcher-tiktok-status";
    card.setAttribute("role", "status");
    Object.assign(card.style, {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      zIndex: "2147483647",
      width: "min(460px, calc(100vw - 32px))",
      overflow: "hidden",
      border: "1px solid rgba(129, 140, 248, 0.42)",
      borderRadius: "20px",
      color: "#f8fafc",
      background: "rgba(15, 23, 42, 0.96)",
      boxShadow: "0 28px 80px rgba(0, 0, 0, 0.58)",
      backdropFilter: "blur(18px)",
      fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
      textAlign: "left",
      pointerEvents: "none",
    });

    card.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 16px;border-bottom:1px solid rgba(148,163,184,.16);background:rgba(255,255,255,.025)">
        <span style="display:flex;align-items:center;gap:8px;color:#cbd5e1;font:650 11px/1.2 system-ui,sans-serif">
          <i id="flow-launcher-tiktok-dot" style="width:8px;height:8px;border-radius:50%;background:#818cf8;box-shadow:0 0 12px #818cf8"></i>
          <span>Flow Launcher · TikTok Studio</span>
        </span>
        <span style="display:flex;align-items:center;gap:7px;padding:6px 9px;border:1px solid rgba(129,140,248,.25);border-radius:999px;color:#c7d2fe;background:rgba(99,102,241,.1);font:700 12px/1 system-ui,sans-serif;font-variant-numeric:tabular-nums">
          <small style="color:#94a3b8;font-size:9px;font-weight:600">เวลาที่ใช้</small>
          <span id="flow-launcher-tiktok-elapsed">00:00</span>
        </span>
      </div>
      <div style="padding:17px 17px 15px">
        <div id="flow-launcher-tiktok-stage" style="margin-bottom:7px;color:#a5b4fc;font:750 10px/1.25 system-ui,sans-serif;letter-spacing:.06em">กำลังเตรียมการ</div>
        <div id="flow-launcher-tiktok-message" aria-live="polite" style="min-height:48px;color:#f8fafc;font:650 16px/1.55 system-ui,sans-serif;overflow-wrap:anywhere"></div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:15px;color:#94a3b8;font:600 11px/1.2 system-ui,sans-serif">
          <span id="flow-launcher-tiktok-queue">ความคืบหน้าโดยรวม</span>
          <span id="flow-launcher-tiktok-progress-value" style="color:#e0e7ff;font-weight:750;font-variant-numeric:tabular-nums">0%</span>
        </div>
        <div style="height:7px;margin-top:8px;overflow:hidden;border-radius:999px;background:rgba(148,163,184,.16)">
          <div id="flow-launcher-tiktok-progress-bar" style="width:0;height:100%;border-radius:inherit;background:linear-gradient(90deg,#6366f1,#60a5fa);box-shadow:0 0 14px rgba(96,165,250,.45);transition:width 500ms ease"></div>
        </div>
      </div>`;
    document.documentElement.append(card);
    return card;
  }

  function showTikTokFlowStatus(payload = {}) {
    const card = ensureTikTokStatusCard();
    const state = String(payload.state || "working");
    const progress = Math.max(0, Math.min(100, Math.round(Number(payload.progress) || 0)));
    const startedAt = Number(payload.startedAt) || Date.now();
    const queueIndex = Math.max(1, Number(payload.queueIndex) || 1);
    const queueTotal = Math.max(queueIndex, Number(payload.queueTotal) || 1);
    statusStartedAt = startedAt;

    card.querySelector("#flow-launcher-tiktok-stage").textContent =
      String(payload.stageLabel || "กำลังดำเนินการ");
    const messageElement = card.querySelector("#flow-launcher-tiktok-message");
    messageElement.textContent = String(payload.detail || "กำลังเตรียม TikTok Studio…");
    messageElement.setAttribute("aria-live", state === "error" ? "assertive" : "polite");
    card.querySelector("#flow-launcher-tiktok-queue").textContent =
      queueTotal > 1 ? `คลิป ${queueIndex}/${queueTotal} · ความคืบหน้าโดยรวม` : "ความคืบหน้าโดยรวม";
    card.querySelector("#flow-launcher-tiktok-progress-value").textContent = `${progress}%`;
    const bar = card.querySelector("#flow-launcher-tiktok-progress-bar");
    bar.style.width = `${progress}%`;

    const visual = state === "error"
      ? { border: "rgba(248,113,113,.48)", dot: "#f87171", bar: "#ef4444" }
      : state === "success"
        ? { border: "rgba(74,222,128,.4)", dot: "#4ade80", bar: "#22c55e" }
        : { border: "rgba(129,140,248,.42)", dot: "#818cf8", bar: "linear-gradient(90deg,#6366f1,#60a5fa)" };
    card.style.borderColor = visual.border;
    const dot = card.querySelector("#flow-launcher-tiktok-dot");
    dot.style.background = visual.dot;
    dot.style.boxShadow = `0 0 12px ${visual.dot}`;
    bar.style.background = visual.bar;

    updateTikTokStatusTimer();
    if (statusTimerId == null && state === "working") {
      statusTimerId = setInterval(updateTikTokStatusTimer, 1000);
    }
    if (state !== "working" && statusTimerId != null) {
      clearInterval(statusTimerId);
      statusTimerId = null;
    }
    if (state === "success" && progress >= 100) {
      setTimeout(() => card.remove(), 6000);
    }
  }

  function pageShowsUploadedState() {
    const pageText = normalize(document.body?.innerText);
    return /อัปโหลดแล้ว|upload complete|uploaded successfully|upload successful/i.test(
      pageText,
    );
  }

  function pageShowsUploadFailure() {
    const pageText = normalize(document.body?.innerText);
    return /อัปโหลดไม่สำเร็จ|การอัปโหลดล้มเหลว|upload failed|failed to upload/i.test(
      pageText,
    );
  }

  function pageHasVideoEditor() {
    const pageText = normalize(document.body?.innerText);
    const hasEditorText = /คำอธิบาย|รายละเอียด|description|caption/i.test(pageText);
    const hasPreview = [...document.querySelectorAll("video")].some((video) => {
      const rect = video.getBoundingClientRect();
      return rect.width >= 120 && rect.height >= 180;
    });
    return hasEditorText || hasPreview;
  }

  function pageHasExpectedVideo(expectedFilename) {
    const expected = normalize(expectedFilename).toLowerCase();
    if (!expected) return true;
    const pageText = normalize(document.body?.innerText).toLowerCase();
    const basename = expected.replace(/\.[a-z0-9]{2,5}$/i, "");
    return pageText.includes(expected) || (basename.length >= 4 && pageText.includes(basename));
  }

  function isVisible(element) {
    if (!(element instanceof Element)) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity) !== 0 &&
      rect.width > 0 &&
      rect.height > 0
    );
  }

  function getEditorText(element) {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      return normalize(element.value);
    }
    return normalize(element.innerText || element.textContent);
  }

  function findDescriptionEditor(expectedFilename = "") {
    const expected = normalize(expectedFilename).toLowerCase();
    const expectedBase = expected.replace(/\.[a-z0-9]{2,5}$/i, "");
    const descriptionLabels = [...document.querySelectorAll("body *")]
      .filter((element) => {
        if (!isVisible(element) || element.childElementCount > 2) return false;
        return /^(คำอธิบาย|description|caption)$/i.test(
          normalize(element.textContent),
        );
      })
      .map((element) => element.getBoundingClientRect());
    const candidates = [
      ...document.querySelectorAll(
        'textarea, input[type="text"], [contenteditable]:not([contenteditable="false"]), [role="textbox"], [data-lexical-editor="true"], [data-slate-editor="true"], .ProseMirror',
      ),
    ];
    return candidates
      .filter(isVisible)
      .map((element) => {
        const identity = normalize(
          `${element.getAttribute("aria-label") || ""} ${element.getAttribute("placeholder") || ""} ${element.getAttribute("data-placeholder") || ""}`,
        ).toLowerCase();
        const rect = element.getBoundingClientRect();
        const currentText = getEditorText(element).toLowerCase();
        let score = 0;
        if (/คำอธิบาย|description|caption/.test(identity)) score += 700;
        if (element.matches('[contenteditable="true"], [role="textbox"]')) score += 120;
        if (rect.width >= 300 && rect.height >= 60) score += 100;
        if (currentText) score += 40;
        if (
          expectedBase.length >= 4 &&
          (currentText.includes(expected) || currentText.includes(expectedBase))
        ) {
          score += 1600;
        }

        for (const labelRect of descriptionLabels) {
          const horizontalOverlap =
            Math.min(rect.right, labelRect.right + Math.max(500, rect.width)) -
            Math.max(rect.left, labelRect.left - 80);
          const verticalGap = rect.top - labelRect.bottom;
          if (horizontalOverlap > 0 && verticalGap >= -20 && verticalGap <= 260) {
            score += 900 - Math.max(0, verticalGap) * 2;
          }
        }

        let container = element.parentElement;
        for (let depth = 0; container && depth < 5; depth += 1) {
          const nearbyText = normalize(container.textContent).slice(0, 500);
          if (/คำอธิบาย|description|caption/i.test(nearbyText)) {
            score += 350 - depth * 30;
            break;
          }
          container = container.parentElement;
        }
        if (/search|ค้นหา/i.test(identity)) score -= 800;
        return { element, score };
      })
      .sort((left, right) => right.score - left.score)[0]?.element || null;
  }

  function prepareDescriptionEditor(expectedFilename = "") {
    const editor = findDescriptionEditor(expectedFilename);
    if (!editor) {
      return { ok: false, error: "ไม่พบช่องคำอธิบายของ TikTok" };
    }
    for (const marked of document.querySelectorAll(
      '[data-flow-launcher-tiktok-description="true"]',
    )) {
      if (marked !== editor) {
        marked.removeAttribute("data-flow-launcher-tiktok-description");
      }
    }
    editor.setAttribute("data-flow-launcher-tiktok-description", "true");
    return { ok: true, currentText: getEditorText(editor) };
  }

  function applyDescriptionFallback(text, expectedFilename = "") {
    const prepared = prepareDescriptionEditor(expectedFilename);
    if (!prepared.ok) return prepared;
    const editor = document.querySelector(
      '[data-flow-launcher-tiktok-description="true"]',
    );
    editor.focus();

    if (editor instanceof HTMLInputElement || editor instanceof HTMLTextAreaElement) {
      const prototype = editor instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(editor, text);
      editor.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        composed: true,
        inputType: "insertText",
        data: text,
      }));
      editor.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editor);
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand("delete", false);
      if (getEditorText(editor)) {
        editor.replaceChildren();
        editor.dispatchEvent(new InputEvent("input", {
          bubbles: true,
          composed: true,
          inputType: "deleteContentBackward",
          data: null,
        }));
      }
      const caret = document.createRange();
      caret.selectNodeContents(editor);
      caret.collapse(false);
      selection.removeAllRanges();
      selection.addRange(caret);
      const inserted = document.execCommand("insertText", false, text);
      if (!inserted || getEditorText(editor) !== normalize(text)) {
        editor.textContent = text;
        editor.dispatchEvent(new InputEvent("input", {
          bubbles: true,
          composed: true,
          inputType: "insertText",
          data: text,
        }));
      }
      selection.removeAllRanges();
    }
    editor.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true, text: getEditorText(editor) };
  }

  async function waitForUploadComplete(timeoutMs = 15 * 60 * 1000) {
    const startedAt = Date.now();
    let stableChecks = 0;
    while (Date.now() - startedAt < timeoutMs) {
      if (pageShowsUploadFailure()) {
        throw new Error("TikTok แจ้งว่าอัปโหลดวิดีโอไม่สำเร็จ");
      }

      if (pageShowsUploadedState() && pageHasVideoEditor()) {
        stableChecks += 1;
        if (stableChecks >= 2) {
          return true;
        }
      } else {
        stableChecks = 0;
      }
      await delay(1000);
    }
    throw new Error("หมดเวลารอ TikTok ยืนยันว่าอัปโหลดวิดีโอแล้ว");
  }

  function elementText(element) {
    return normalize(
      element?.innerText ||
      element?.textContent ||
      element?.getAttribute?.("aria-label") ||
      element?.getAttribute?.("title") ||
      "",
    );
  }

  function visibleButtons() {
    return [...document.querySelectorAll('button, [role="button"]')].filter(isVisible);
  }

  function findAddLinkButton() {
    const labels = [...document.querySelectorAll("body *")].filter((element) => {
      if (!isVisible(element) || element.childElementCount > 3) return false;
      return /^(เพิ่มลิงก์|add link)$/i.test(normalize(element.textContent));
    });
    const candidates = visibleButtons().filter((button) =>
      /^(?:\+\s*)?(เพิ่ม|add)$/i.test(elementText(button)),
    );

    return candidates
      .map((button) => {
        const rect = button.getBoundingClientRect();
        let score = 0;
        for (const label of labels) {
          const labelRect = label.getBoundingClientRect();
          const verticalGap = rect.top - labelRect.bottom;
          const horizontalDistance = Math.abs(rect.left - labelRect.left);
          if (verticalGap >= -12 && verticalGap <= 150) {
            score += 900 - Math.abs(verticalGap) * 3 - Math.min(horizontalDistance, 300);
          }
          let container = label.parentElement;
          for (let depth = 0; container && depth < 5; depth += 1) {
            if (container.contains(button)) {
              score += 700 - depth * 80;
              break;
            }
            container = container.parentElement;
          }
        }
        if (rect.width >= 180) score += 120;
        return { element: button, score };
      })
      .sort((left, right) => right.score - left.score)[0]?.element || null;
  }

  function findAddLinkNextButton() {
    return visibleButtons()
      .filter((button) => /^(ถัดไป|next)$/i.test(elementText(button)))
      .map((button) => {
        let score = 0;
        const rect = button.getBoundingClientRect();
        if (rect.width >= 80) score += 80;
        if (button.closest('[role="dialog"], [aria-modal="true"]')) score += 1000;
        let container = button.parentElement;
        for (let depth = 0; container && depth < 8; depth += 1) {
          const text = normalize(container.textContent);
          if (/เพิ่มลิงก์|add link/i.test(text)) score += 700 - depth * 35;
          if (/ประเภทของลิงก์|link type/i.test(text)) score += 700 - depth * 35;
          container = container.parentElement;
        }
        return { element: button, score };
      })
      .sort((left, right) => right.score - left.score)[0]?.element || null;
  }

  function findProductSearchInput() {
    const candidates = [...document.querySelectorAll(
      'input:not([type="hidden"]), textarea, [contenteditable="true"], [role="textbox"]',
    )].filter(isVisible);
    return candidates
      .map((element) => {
        const identity = normalize(
          `${element.getAttribute("placeholder") || ""} ${element.getAttribute("aria-label") || ""} ${element.getAttribute("name") || ""}`,
        );
        const rect = element.getBoundingClientRect();
        let score = 0;
        if (/ค้นหาสินค้า|search products?|product search/i.test(identity)) score += 1400;
        if (/ค้นหา|search/i.test(identity)) score += 500;
        if (rect.width >= 240) score += 100;
        let container = element.parentElement;
        for (let depth = 0; container && depth < 7; depth += 1) {
          const text = normalize(container.textContent);
          if (/เพิ่มลิงก์สินค้า|product link/i.test(text)) score += 550 - depth * 35;
          if (/ID สินค้า|product ID/i.test(text)) score += 250 - depth * 20;
          container = container.parentElement;
        }
        return { element, score };
      })
      .filter((candidate) => candidate.score >= 500)
      .sort((left, right) => right.score - left.score)[0]?.element || null;
  }

  function findProductResultRadio(productId) {
    const expectedId = normalize(productId);
    if (!expectedId) return null;
    const candidates = [...document.querySelectorAll(
      'input[type="radio"], [role="radio"], label, [class*="radio" i]',
    )].filter(isVisible);

    return candidates
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const identity = normalize(
          `${element.getAttribute("role") || ""} ${element.className || ""} ${element.getAttribute("aria-label") || ""}`,
        );
        let score = 0;
        if (element.matches('input[type="radio"], [role="radio"]')) score += 450;
        if (/radio/i.test(identity)) score += 220;
        if (rect.width >= 12 && rect.width <= 34 && rect.height >= 12 && rect.height <= 34) {
          score += 300;
        }
        let container = element;
        for (let depth = 0; container && depth < 9; depth += 1) {
          const text = normalize(container.innerText || container.textContent);
          if (text.includes(expectedId)) {
            score += 1800 - depth * 90;
            if (/ID สินค้า|product ID/i.test(text)) score += 250;
            break;
          }
          container = container.parentElement;
        }
        return { element, score };
      })
      .filter((candidate) => candidate.score >= 1500)
      .sort((left, right) => right.score - left.score)[0]?.element || null;
  }

  function findProductPickerNextButton(productId) {
    const expectedId = normalize(productId);
    return visibleButtons()
      .filter((button) => /^(ถัดไป|next)$/i.test(elementText(button)))
      .map((button) => {
        let score = 0;
        if (button.closest('[role="dialog"], [aria-modal="true"]')) score += 900;
        let container = button.parentElement;
        for (let depth = 0; container && depth < 9; depth += 1) {
          const text = normalize(container.innerText || container.textContent);
          if (expectedId && text.includes(expectedId)) score += 1200 - depth * 60;
          if (/เพิ่มลิงก์สินค้า|product link/i.test(text)) score += 450 - depth * 25;
          if (/ID สินค้า|product ID/i.test(text)) score += 350 - depth * 20;
          if (/ประเภทของลิงก์|link type/i.test(text)) score -= 700;
          container = container.parentElement;
        }
        return { element: button, score };
      })
      .sort((left, right) => right.score - left.score)[0]?.element || null;
  }

  function findConfirmAddProductButton() {
    return visibleButtons()
      .filter((button) => /^(เพิ่ม|add)$/i.test(elementText(button)))
      .map((button) => {
        let score = 0;
        if (button.closest('[role="dialog"], [aria-modal="true"]')) score += 1000;
        let container = button.parentElement;
        for (let depth = 0; container && depth < 9; depth += 1) {
          const text = normalize(container.innerText || container.textContent);
          if (/เพิ่มลิงก์สินค้า|product link/i.test(text)) score += 450 - depth * 25;
          if (/ชื่อสินค้า|product name/i.test(text)) score += 850 - depth * 45;
          if (/ชื่อนี้จะปรากฏขึ้นในวิดีโอ|appear.*video/i.test(text)) {
            score += 650 - depth * 35;
          }
          container = container.parentElement;
        }
        return { element: button, score };
      })
      .filter((candidate) => candidate.score >= 700)
      .sort((left, right) => right.score - left.score)[0]?.element || null;
  }

  function findPostTimeRadio(publishMode) {
    const targetPattern = publishMode === "schedule"
      ? /^(ตั้งเวลา|schedule)$/i
      : /^(ตอนนี้|now|post now)$/i;
    const candidates = [...document.querySelectorAll(
      'input[type="radio"], [role="radio"], label, [class*="radio" i]',
    )].filter(isVisible);

    return candidates
      .map((element) => {
        const rect = element.getBoundingClientRect();
        let score = targetPattern.test(elementText(element)) ? 800 : 0;
        if (element.matches('input[type="radio"], [role="radio"]')) score += 300;
        if (rect.width >= 12 && rect.width <= 34 && rect.height >= 12 && rect.height <= 34) {
          score += 180;
        }
        let container = element;
        for (let depth = 0; container && depth < 8; depth += 1) {
          const text = normalize(container.innerText || container.textContent);
          if (targetPattern.test(text)) score += 850 - depth * 55;
          if (/เวลาโพสต์|post time/i.test(text)) score += 750 - depth * 45;
          container = container.parentElement;
        }
        return { element, score };
      })
      .filter((candidate) => candidate.score >= 1200)
      .sort((left, right) => right.score - left.score)[0]?.element || null;
  }

  const aiGeneratedContentPattern = /^(เนื้อหาที่สร้างโดย\s*AI|AI[- ]generated content|content generated by\s*AI)$/i;

  function findAiGeneratedContentLabel() {
    return [...document.querySelectorAll("body *")]
      .filter((element) => {
        if (!isVisible(element)) return false;
        const text = normalize(element.innerText || element.textContent);
        const rect = element.getBoundingClientRect();
        return (
          rect.height <= 100 &&
          text.length <= 180 &&
          (
            aiGeneratedContentPattern.test(text) ||
            /เนื้อหาที่สร้างโดย\s*AI/i.test(text) ||
            /AI[- ]generated content/i.test(text)
          )
        );
      })
      .sort((left, right) => {
        const leftRect = left.getBoundingClientRect();
        const rightRect = right.getBoundingClientRect();
        const leftExact = aiGeneratedContentPattern.test(
          normalize(left.innerText || left.textContent),
        ) ? 1 : 0;
        const rightExact = aiGeneratedContentPattern.test(
          normalize(right.innerText || right.textContent),
        ) ? 1 : 0;
        if (leftExact !== rightExact) return rightExact - leftExact;
        return leftRect.width * leftRect.height - rightRect.width * rightRect.height;
      })[0] || null;
  }

  function findAiGeneratedContentTextRect() {
    const expectedTexts = [
      "เนื้อหาที่สร้างโดย AI",
      "AI-generated content",
      "AI generated content",
      "Content generated by AI",
    ];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const rawText = String(node.nodeValue || "");
      const parent = node.parentElement;
      if (parent && isVisible(parent)) {
        const expected = expectedTexts.find((text) =>
          rawText.toLowerCase().includes(text.toLowerCase()),
        );
        if (expected) {
          const start = rawText.toLowerCase().indexOf(expected.toLowerCase());
          const range = document.createRange();
          range.setStart(node, start);
          range.setEnd(node, start + expected.length);
          const rect = range.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) return rect;
        }
      }
      node = walker.nextNode();
    }
    return null;
  }

  function findShowMoreButton() {
    const exactTextElements = [...document.querySelectorAll("body *")]
      .filter((element) => {
        if (!isVisible(element) || element.childElementCount > 2) return false;
        return /^(แสดงเพิ่มเติม|show more)$/i.test(elementText(element));
      })
      .map((element) => element.closest('button, [role="button"]') || element);
    return [...new Set([...visibleButtons(), ...exactTextElements])]
      .filter((button) => /^(แสดงเพิ่มเติม|show more)$/i.test(elementText(button)))
      .map((button) => {
        const rect = button.getBoundingClientRect();
        let score = 0;
        if (rect.width >= 80 && rect.width <= 500) score += 250;
        let container = button.parentElement;
        for (let depth = 0; container && depth < 7; depth += 1) {
          const text = normalize(container.innerText || container.textContent);
          if (/การตั้งค่า|settings/i.test(text)) score += 900 - depth * 60;
          if (/เวลาโพสต์|post time/i.test(text)) score += 500 - depth * 35;
          container = container.parentElement;
        }
        return { element: button, score };
      })
      .sort((left, right) => right.score - left.score)[0]?.element || null;
  }

  function switchLooksEnabled(element) {
    if (!element) return false;
    if (element instanceof HTMLInputElement && element.type === "checkbox") {
      return element.checked;
    }
    const ariaChecked = element.getAttribute("aria-checked");
    if (ariaChecked === "true") return true;
    if (ariaChecked === "false") return false;
    const dataState = normalize(element.getAttribute("data-state")).toLowerCase();
    if (/^(checked|on|active|enabled)$/.test(dataState)) return true;
    if (/^(unchecked|off|inactive|disabled)$/.test(dataState)) return false;
    const identity = normalize(`${element.className || ""}`).toLowerCase();
    if (/(?:^|[-_ ])(?:checked|on|active|enabled)(?:$|[-_ ])/i.test(identity)) return true;

    const rect = element.getBoundingClientRect();
    const knobs = [...element.querySelectorAll("*")].filter((child) => {
      if (!isVisible(child)) return false;
      const childRect = child.getBoundingClientRect();
      return (
        childRect.width >= 8 && childRect.width <= 30 &&
        childRect.height >= 8 && childRect.height <= 30 &&
        childRect.width < rect.width * 0.75
      );
    });
    if (knobs.length) {
      const knobRect = knobs[0].getBoundingClientRect();
      if (Math.abs(knobRect.left + knobRect.width / 2 - (rect.left + rect.width / 2)) > 2) {
        return knobRect.left + knobRect.width / 2 > rect.left + rect.width / 2;
      }
    }

    const color = getComputedStyle(element).backgroundColor.match(/[\d.]+/g)?.map(Number) || [];
    if (color.length >= 3) {
      const [red, green, blue] = color;
      if (green >= red + 25 && blue >= red + 25) return true;
    }
    return false;
  }

  function findAiGeneratedContentSwitch() {
    const label = findAiGeneratedContentLabel();
    if (!label) return null;
    const labelRect = label.getBoundingClientRect();
    const exactTikTokSwitch = [...document.querySelectorAll(
      'div.Switch__content[aria-checked], div.Switch__content[data-state], [class~="Switch__content"][aria-checked]',
    )]
      .filter(isVisible)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const verticalDistance = Math.abs(
          rect.top + rect.height / 2 - (labelRect.top + labelRect.height / 2),
        );
        const horizontalGap = rect.left - labelRect.right;
        let score = 2400 - verticalDistance * 80 - Math.abs(horizontalGap) * 2;
        if (verticalDistance <= 12) score += 1800;
        if (horizontalGap >= -8 && horizontalGap <= 140) score += 900;
        if (label.contains(element)) score += 1600;
        else if (label.parentElement?.contains(element)) score += 1200;
        else if (label.parentElement?.parentElement?.contains(element)) score += 700;
        return { element, score };
      })
      .filter((candidate) => candidate.score >= 1000)
      .sort((left, right) => right.score - left.score)[0]?.element || null;
    if (exactTikTokSwitch) return exactTikTokSwitch;

    const semanticCandidates = [...document.querySelectorAll(
      'input[type="checkbox"], [role="switch"], [aria-checked], [class*="switch" i], [class*="toggle" i]',
    )];
    const localContainers = [label, label.parentElement, label.parentElement?.parentElement]
      .filter(Boolean);
    const localCandidates = localContainers.flatMap((container) =>
      [...container.querySelectorAll("*")].filter((element) => {
        if (!isVisible(element)) return false;
        const rect = element.getBoundingClientRect();
        return (
          rect.width >= 24 && rect.width <= 90 &&
          rect.height >= 12 && rect.height <= 48
        );
      }),
    );
    // Some TikTok builds render switches with generated class names and no role.
    // Include compact elements immediately to the right of the matching label.
    const geometricCandidates = [...document.querySelectorAll("body *")].filter((element) => {
      if (!isVisible(element)) return false;
      const rect = element.getBoundingClientRect();
      const verticalDistance = Math.abs(
        rect.top + rect.height / 2 - (labelRect.top + labelRect.height / 2),
      );
      const horizontalGap = rect.left - labelRect.right;
      return (
        rect.width >= 24 && rect.width <= 90 &&
        rect.height >= 12 && rect.height <= 48 &&
        verticalDistance <= 18 &&
        horizontalGap >= -4 && horizontalGap <= 140
      );
    });
    const candidates = [...new Set([
      ...semanticCandidates,
      ...localCandidates,
      ...geometricCandidates,
    ])]
      .filter((element) => {
        if (!isVisible(element)) return false;
        const rect = element.getBoundingClientRect();
        return rect.width >= 24 && rect.width <= 90 && rect.height >= 12 && rect.height <= 48;
      });

    return candidates
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const verticalDistance = Math.abs(
          rect.top + rect.height / 2 - (labelRect.top + labelRect.height / 2),
        );
        const horizontalDistance = Math.abs(rect.left - labelRect.right);
        let score = Math.max(0, 900 - verticalDistance * 12 - horizontalDistance);
        if (element.matches('input[type="checkbox"], [role="switch"], button[aria-checked]')) {
          score += 500;
        }
        if (label.contains(element)) score += 1800;
        else if (label.parentElement?.contains(element)) score += 1300;
        else if (label.parentElement?.parentElement?.contains(element)) score += 700;
        const horizontalGap = rect.left - labelRect.right;
        if (verticalDistance <= 10 && horizontalGap >= -4 && horizontalGap <= 80) {
          score += 1200 - Math.abs(horizontalGap) * 4;
        }
        if (rect.width >= 26 && rect.width <= 60 && rect.height >= 14 && rect.height <= 34) {
          score += 350;
        }
        let container = label.parentElement;
        for (let depth = 0; container && depth < 6; depth += 1) {
          if (container.contains(element)) {
            score += 900 - depth * 90;
            break;
          }
          container = container.parentElement;
        }
        return { element, score };
      })
      .filter((candidate) => candidate.score >= 700)
      .sort((left, right) => right.score - left.score)[0]?.element || null;
  }

  async function prepareShowMoreTarget(timeoutMs) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (findAiGeneratedContentLabel()) {
        return { ok: true, skipClick: true, alreadyExpanded: true };
      }
      const button = findShowMoreButton();
      if (button) {
        return prepareClickTarget(
          findShowMoreButton,
          Math.max(1000, timeoutMs - (Date.now() - startedAt)),
          'ไม่พบปุ่ม "แสดงเพิ่มเติม" ในการตั้งค่า TikTok',
        );
      }
      await delay(300);
    }
    throw new Error('ไม่พบปุ่ม "แสดงเพิ่มเติม" ในการตั้งค่า TikTok');
  }

  async function prepareAiGeneratedContentTarget(timeoutMs) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const toggle = findAiGeneratedContentSwitch();
      if (toggle) {
        if (switchLooksEnabled(toggle)) {
          return { ok: true, skipClick: true, alreadyEnabled: true };
        }
        return prepareClickTarget(
          findAiGeneratedContentSwitch,
          Math.max(1000, timeoutMs - (Date.now() - startedAt)),
          'ไม่พบสวิตช์ "เนื้อหาที่สร้างโดย AI"',
        );
      }
      const textRect = findAiGeneratedContentTextRect();
      if (textRect) {
        const x = Math.min(window.innerWidth - 8, textRect.right + 28);
        const y = textRect.top + textRect.height / 2;
        const hitElement = document.elementFromPoint(x, y);
        if (hitElement && isVisible(hitElement)) {
          return {
            ok: true,
            x,
            y,
            text: "เนื้อหาที่สร้างโดย AI",
            stateReadable: false,
            coordinateFallback: true,
          };
        }
      }
      await delay(300);
    }
    throw new Error('ไม่พบสวิตช์ "เนื้อหาที่สร้างโดย AI"');
  }

  function findValidationRow(labelPattern) {
    const label = [...document.querySelectorAll("body *")]
      .filter((element) => {
        if (!isVisible(element) || element.childElementCount > 3) return false;
        return labelPattern.test(normalize(element.innerText || element.textContent));
      })
      .sort((left, right) => {
        const leftRect = left.getBoundingClientRect();
        const rightRect = right.getBoundingClientRect();
        return leftRect.width * leftRect.height - rightRect.width * rightRect.height;
      })[0] || null;
    if (!label) return null;

    let best = label;
    let parent = label.parentElement;
    for (let depth = 0; parent && depth < 6; depth += 1) {
      const rect = parent.getBoundingClientRect();
      const text = normalize(parent.innerText || parent.textContent);
      const containsBothValidationRows =
        /การตรวจสอบลิขสิทธิ์เพลง|music copyright check|copyright check/i.test(text) &&
        /การตรวจสอบเนื้อหาแบบ\s*Lite|content check.*Lite|Lite content check/i.test(text);
      if (containsBothValidationRows) break;
      if (rect.height <= 150 && text.length <= 500 && labelPattern.test(text)) {
        best = parent;
      } else if (rect.height > 220) {
        break;
      }
      parent = parent.parentElement;
    }
    return best;
  }

  function classifyValidationRow(row) {
    if (!row) return { state: "missing", text: "" };
    const text = normalize(row.innerText || row.textContent);
    if (
      /ถึงขีดจำกัดการตรวจสอบ.*วันนี้|ถึงขีดจำกัด.*โปรดลองอีกครั้งในวันพรุ่งนี้|daily (?:check |review )?limit (?:has been )?reached|limit reached.*try again tomorrow|try again tomorrow/i.test(text)
    ) {
      return { state: "skipped", reason: "daily-limit", text };
    }
    if (
      /เนื้อหาอาจถูกจำกัด|ยังสามารถโพสต์วิดีโอได้|content may be restricted|you can still post (?:the )?video|may have limited visibility/i.test(text)
    ) {
      return { state: "advisory", reason: "limited-content", text };
    }
    if (/ไม่พบปัญหา|no issues?|check passed|passed/i.test(text)) {
      return { state: "success", text };
    }
    if (
      /กำลังดำเนินการตรวจสอบ|กำลังตรวจสอบ|อาจใช้เวลา|checking|processing|in progress/i.test(text)
    ) {
      return { state: "pending", text };
    }
    if (/พบปัญหา|ไม่ผ่าน|ละเมิด|failed|issue detected|violation|error/i.test(text)) {
      return { state: "failed", text };
    }
    return { state: "pending", text };
  }

  function readTikTokValidationState() {
    const copyright = classifyValidationRow(findValidationRow(
      /การตรวจสอบลิขสิทธิ์เพลง|music copyright check|copyright check/i,
    ));
    const content = classifyValidationRow(findValidationRow(
      /การตรวจสอบเนื้อหาแบบ\s*Lite|content check.*Lite|Lite content check/i,
    ));
    return {
      copyright,
      content,
      ready:
        copyright.state === "success" &&
        (content.state === "success" || content.state === "skipped"),
      failed: copyright.state === "failed" || content.state === "failed",
      needsDisableLite:
        copyright.state === "success" && content.state === "advisory",
      warning: content.state === "skipped"
        ? "ข้ามการตรวจสอบเนื้อหา Lite เพราะถึงขีดจำกัดรายวัน"
        : content.state === "advisory"
          ? "ปิดการตรวจสอบ Lite เพราะ TikTok แจ้งว่าเนื้อหาอาจถูกจำกัด"
        : "",
    };
  }

  async function waitForTikTokValidation(timeoutMs) {
    const startedAt = Date.now();
    let stableSuccesses = 0;
    let lastState = null;
    while (Date.now() - startedAt < timeoutMs) {
      lastState = readTikTokValidationState();
      if (lastState.failed) {
        const failedText = lastState.copyright.state === "failed"
          ? lastState.copyright.text
          : lastState.content.text;
        throw new Error(`TikTok ตรวจพบปัญหา: ${failedText}`);
      }
      if (lastState.needsDisableLite) {
        return {
          ok: true,
          ready: false,
          needsDisableLite: true,
          validationSkipped: true,
          ...lastState,
        };
      }
      if (lastState.ready) {
        stableSuccesses += 1;
        if (stableSuccesses >= 2) {
          return {
            ok: true,
            ready: true,
            validationSkipped: lastState.content.state === "skipped",
            ...lastState,
          };
        }
      } else {
        stableSuccesses = 0;
      }
      await delay(1000);
    }
    const copyrightText = lastState?.copyright?.text || "ยังไม่พบผลตรวจลิขสิทธิ์เพลง";
    const contentText = lastState?.content?.text || "ยังไม่พบผลตรวจเนื้อหา";
    throw new Error(`หมดเวลารอการตรวจสอบ TikTok (${copyrightText} / ${contentText})`);
  }

  function findLiteValidationSwitch() {
    const row = findValidationRow(
      /การตรวจสอบเนื้อหาแบบ\s*Lite|content check.*Lite|Lite content check/i,
    );
    if (!row) return null;
    const rowRect = row.getBoundingClientRect();
    return [...document.querySelectorAll(
      'div.Switch__content[aria-checked], [class~="Switch__content"][data-state], [role="switch"]',
    )]
      .filter(isVisible)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const verticalDistance = Math.abs(
          rect.top + rect.height / 2 - (rowRect.top + Math.min(rowRect.height, 42) / 2),
        );
        let score = 1800 - verticalDistance * 60;
        if (row.contains(element)) score += 2200;
        if (verticalDistance <= 16) score += 900;
        if (rect.width >= 24 && rect.width <= 70 && rect.height >= 12 && rect.height <= 40) {
          score += 400;
        }
        return { element, score };
      })
      .filter((candidate) => candidate.score >= 1000)
      .sort((left, right) => right.score - left.score)[0]?.element || null;
  }

  async function prepareDisableLiteTarget(timeoutMs) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const toggle = findLiteValidationSwitch();
      if (toggle) {
        if (!switchLooksEnabled(toggle)) {
          return { ok: true, skipClick: true, alreadyDisabled: true };
        }
        return prepareClickTarget(
          findLiteValidationSwitch,
          Math.max(1000, timeoutMs - (Date.now() - startedAt)),
          'ไม่พบสวิตช์ "การตรวจสอบเนื้อหาแบบ Lite"',
        );
      }
      await delay(300);
    }
    throw new Error('ไม่พบสวิตช์ "การตรวจสอบเนื้อหาแบบ Lite"');
  }

  function findFinalPublishButton(publishMode) {
    const targetPattern = publishMode === "schedule"
      ? /^(ตั้งเวลา|schedule)$/i
      : /^(โพสต์|post)$/i;
    return visibleButtons()
      .filter((button) => {
        if (!targetPattern.test(elementText(button))) return false;
        if (button.disabled || button.getAttribute("aria-disabled") === "true") return false;
        return true;
      })
      .map((button) => {
        const rect = button.getBoundingClientRect();
        let score = 0;
        if (rect.width >= 120 && rect.height >= 30) score += 700;
        if (rect.top > window.innerHeight * 0.45) score += 500;
        let container = button.parentElement;
        for (let depth = 0; container && depth < 8; depth += 1) {
          const text = normalize(container.innerText || container.textContent);
          if (/การตรวจสอบ|checks?|validation/i.test(text)) score += 900 - depth * 60;
          if (/บันทึกแบบร่าง|draft/i.test(text)) score += 500 - depth * 35;
          container = container.parentElement;
        }
        return { element: button, score };
      })
      .filter((candidate) => candidate.score >= 900)
      .sort((left, right) => right.score - left.score)[0]?.element || null;
  }

  function findScheduleInput(kind) {
    const candidates = [...document.querySelectorAll(
      'input:not([type="hidden"]):not([type="radio"]), [role="combobox"] input',
    )].filter(isVisible);
    return candidates
      .map((element) => {
        const value = normalize(element.value || element.getAttribute("value"));
        const identity = normalize(
          `${element.getAttribute("placeholder") || ""} ${element.getAttribute("aria-label") || ""} ${element.getAttribute("name") || ""}`,
        );
        let score = 0;
        if (kind === "time") {
          if (/^\d{1,2}:\d{2}$/.test(value)) score += 1000;
          if (/เวลา|time/i.test(identity)) score += 650;
          if (element.type === "time") score += 800;
        } else {
          if (/^\d{4}-\d{2}-\d{2}$/.test(value)) score += 1000;
          if (/วันที่|date/i.test(identity)) score += 650;
          if (element.type === "date") score += 800;
        }
        let container = element.parentElement;
        for (let depth = 0; container && depth < 8; depth += 1) {
          const text = normalize(container.innerText || container.textContent);
          if (/เวลาโพสต์|post time/i.test(text)) score += 600 - depth * 35;
          container = container.parentElement;
        }
        return { element, score };
      })
      .filter((candidate) => candidate.score >= 900)
      .sort((left, right) => right.score - left.score)[0]?.element || null;
  }

  async function prepareScheduleFields(timeoutMs) {
    const startedAt = Date.now();
    let timeInput = null;
    let dateInput = null;
    while (Date.now() - startedAt < timeoutMs) {
      timeInput = findScheduleInput("time");
      dateInput = findScheduleInput("date");
      if (timeInput && dateInput && timeInput !== dateInput) break;
      await delay(300);
    }
    if (!timeInput || !dateInput || timeInput === dateInput) {
      throw new Error("ไม่พบช่องวันและเวลาสำหรับตั้งเวลาโพสต์");
    }
    timeInput.setAttribute("data-flow-launcher-tiktok-schedule-time", "true");
    dateInput.setAttribute("data-flow-launcher-tiktok-schedule-date", "true");
    timeInput.scrollIntoView({ behavior: "auto", block: "center", inline: "center" });
    await delay(200);
    return {
      ok: true,
      currentTime: getEditorText(timeInput),
      currentDate: getEditorText(dateInput),
    };
  }

  function findTimePickerOption(kind, requestedValue) {
    const rawValue = String(requestedValue || "").padStart(2, "0");
    const acceptedValues = new Set([rawValue, String(Number(rawValue))]);
    const candidates = [...document.querySelectorAll(
      '[role="option"], li, [class*="timepicker" i] *, [class*="time-picker" i] *',
    )]
      .filter((element) => {
        if (!isVisible(element) || element.childElementCount > 1) return false;
        return acceptedValues.has(normalize(element.textContent));
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const identity = normalize(`${element.className || ""} ${element.getAttribute("role") || ""}`);
        let score = 0;
        if (element.getAttribute("role") === "option") score += 500;
        if (/timepicker|time-picker|time.*cell|list.*item/i.test(identity)) score += 500;
        if (rect.width >= 20 && rect.width <= 120 && rect.height >= 18 && rect.height <= 60) score += 220;
        let parent = element.parentElement;
        for (let depth = 0; parent && depth < 6; depth += 1) {
          const parentIdentity = normalize(`${parent.className || ""} ${parent.getAttribute("role") || ""}`);
          if (/timepicker|time-picker|listbox/i.test(parentIdentity)) {
            score += 600 - depth * 70;
            break;
          }
          parent = parent.parentElement;
        }
        return { element, score, x: rect.left + rect.width / 2 };
      })
      .filter((candidate) => candidate.score >= 500);

    if (!candidates.length) return null;
    candidates.sort((left, right) => {
      if (kind === "minute") return right.x - left.x || right.score - left.score;
      return left.x - right.x || right.score - left.score;
    });
    return candidates[0].element;
  }

  function findCalendarDateCell(dateValue) {
    const match = String(dateValue || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const year = match[1];
    const day = String(Number(match[3]));
    const namedPanels = [...document.querySelectorAll(
      '[class*="calendar" i], [class*="date-picker" i], [class*="datepicker" i], [class*="picker-panel" i], [role="grid"]',
    )].filter((element) => {
      if (!isVisible(element)) return false;
      const rect = element.getBoundingClientRect();
      return rect.width >= 220 && rect.width <= 650 && rect.height >= 180;
    });

    // TikTok sometimes renders the calendar with generated class names and plain
    // div/span date cells. Locate that popover from its year and 20+ day numbers
    // instead of relying only on semantic calendar selectors.
    const structuralPanels = [...document.querySelectorAll("body div")].filter((element) => {
      if (!isVisible(element)) return false;
      const rect = element.getBoundingClientRect();
      if (rect.width < 250 || rect.width > 700 || rect.height < 220 || rect.height > 620) {
        return false;
      }
      const text = normalize(element.innerText || element.textContent);
      if (!text.includes(year)) return false;
      const dateTokens = text.match(/(?:^|\s)(?:[1-9]|[12]\d|3[01])(?=\s|$)/g) || [];
      return dateTokens.length >= 20;
    });
    const panels = [...new Set([...namedPanels, ...structuralPanels])];
    const panel = panels
      .sort((left, right) => {
        const leftRect = left.getBoundingClientRect();
        const rightRect = right.getBoundingClientRect();
        const leftText = normalize(left.innerText || left.textContent);
        const rightText = normalize(right.innerText || right.textContent);
        const leftHasYear = leftText.includes(year) ? 1 : 0;
        const rightHasYear = rightText.includes(year) ? 1 : 0;
        if (leftHasYear !== rightHasYear) return rightHasYear - leftHasYear;
        return leftRect.width * leftRect.height - rightRect.width * rightRect.height;
      })[0] || document;

    const semanticCandidates = [...panel.querySelectorAll(
      '[role="gridcell"], td, button, [class*="picker-cell" i], [class*="date-value" i], [class*="picker-date" i]',
    )];
    const plainTextCandidates = [...panel.querySelectorAll("*")].filter((element) => {
      if (element.childElementCount > 0) return false;
      return normalize(element.innerText || element.textContent) === day;
    });
    const candidates = [...new Set([...semanticCandidates, ...plainTextCandidates])].filter((element) => {
      if (!isVisible(element)) return false;
      const text = normalize(element.innerText || element.textContent);
      const identity = normalize(
        `${element.getAttribute("aria-label") || ""} ${element.getAttribute("title") || ""} ${element.getAttribute("data-date") || ""} ${element.getAttribute("data-value") || ""}`,
      );
      return identity.includes(dateValue) || text === day;
    });

    return candidates
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const identity = normalize(
          `${element.className || ""} ${element.getAttribute("aria-label") || ""} ${element.getAttribute("title") || ""} ${element.getAttribute("data-date") || ""} ${element.getAttribute("data-value") || ""}`,
        );
        let score = 0;
        if (identity.includes(dateValue)) score += 2200;
        if (/in-view|current-month|cell-in/i.test(identity)) score += 850;
        if (/disabled|out-view|prev-month|next-month/i.test(identity)) score -= 1100;
        if (element.matches('[role="gridcell"], td')) score += 350;
        if (rect.width >= 24 && rect.width <= 70 && rect.height >= 24 && rect.height <= 70) score += 250;
        let parent = element.parentElement;
        for (let depth = 0; parent && depth < 7; depth += 1) {
          const parentIdentity = normalize(`${parent.className || ""} ${parent.getAttribute("role") || ""}`);
          if (/calendar|date-picker|datepicker|picker-panel|grid/i.test(parentIdentity)) {
            score += 650 - depth * 55;
            break;
          }
          parent = parent.parentElement;
        }
        let clickElement = element.querySelector?.(
          '[class*="date-value" i], [class*="picker-date-value" i]',
        ) || element;
        if (plainTextCandidates.includes(element)) {
          let clickableParent = element;
          let parent = element.parentElement;
          while (parent && parent !== panel) {
            const parentRect = parent.getBoundingClientRect();
            const parentText = normalize(parent.innerText || parent.textContent);
            if (
              parentText === day &&
              parentRect.width >= 24 && parentRect.width <= 80 &&
              parentRect.height >= 24 && parentRect.height <= 80
            ) {
              clickableParent = parent;
              parent = parent.parentElement;
              continue;
            }
            break;
          }
          clickElement = clickableParent;
          score += 900;
        }
        return { element: clickElement, score };
      })
      .filter((candidate) => candidate.score >= 600)
      .sort((left, right) => right.score - left.score)[0]?.element || null;
  }

  function readScheduleValue(kind) {
    const input = findScheduleInput(kind === "date" ? "date" : "time");
    return input ? normalize(input.value || input.getAttribute("value") || input.textContent) : "";
  }

  async function prepareDateTarget(dateValue, timeoutMs) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const cell = findCalendarDateCell(dateValue);
      if (cell) {
        cell.scrollIntoView({ behavior: "auto", block: "center", inline: "center" });
        await delay(180);
        const rect = cell.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const topElement = document.elementFromPoint(x, y);
        if (
          topElement &&
          (topElement === cell || cell.contains(topElement) || topElement.contains(cell))
        ) {
          return { ok: true, x, y, text: elementText(cell) };
        }
      }
      await delay(300);
    }
    throw new Error(`ไม่พบวันที่ ${dateValue} ในปฏิทิน TikTok`);
  }

  async function waitForElement(findElement, timeoutMs, errorMessage) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const element = findElement();
      if (element) return element;
      await delay(300);
    }
    throw new Error(errorMessage);
  }

  async function prepareClickTarget(findElement, timeoutMs, errorMessage) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const element = findElement();
      if (!element) {
        await delay(300);
        continue;
      }
      element.scrollIntoView({ behavior: "auto", block: "center", inline: "center" });
      await delay(250);
      const rect = element.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const topElement = document.elementFromPoint(x, y);
      const isTopmost = Boolean(
        topElement &&
        (topElement === element || element.contains(topElement) || topElement.contains(element)),
      );
      if (isVisible(element) && isTopmost) {
        return { ok: true, x, y, text: elementText(element) };
      }
      await delay(300);
    }
    throw new Error(errorMessage);
  }

  async function prepareProductSearch(timeoutMs) {
    const input = await waitForElement(
      findProductSearchInput,
      timeoutMs,
      "ไม่พบช่องค้นหาสินค้าใน Modal เพิ่มลิงก์",
    );
    for (const marked of document.querySelectorAll(
      '[data-flow-launcher-tiktok-product-search="true"]',
    )) {
      if (marked !== input) marked.removeAttribute("data-flow-launcher-tiktok-product-search");
    }
    input.setAttribute("data-flow-launcher-tiktok-product-search", "true");
    input.scrollIntoView({ behavior: "auto", block: "center", inline: "center" });
    await delay(200);
    return { ok: true, currentText: getEditorText(input) };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "SHOW_TIKTOK_FLOW_STATUS") {
      showTikTokFlowStatus(message);
      sendResponse({ ok: true });
      return false;
    }

    if (message?.type === "CHECK_TIKTOK_VIDEO_UPLOAD_READY") {
      sendResponse({
        ok: true,
        ready:
          pageShowsUploadedState() &&
          pageHasVideoEditor() &&
          pageHasExpectedVideo(message.expectedFilename),
      });
      return false;
    }

    if (message?.type === "APPLY_TIKTOK_DESCRIPTION_FALLBACK") {
      sendResponse(applyDescriptionFallback(
        String(message.text || ""),
        message.expectedFilename,
      ));
      return false;
    }

    if (message?.type === "PREPARE_TIKTOK_DESCRIPTION") {
      sendResponse(prepareDescriptionEditor(message.expectedFilename));
      return false;
    }

    if (message?.type === "READ_TIKTOK_DESCRIPTION") {
      const editor = document.querySelector(
        '[data-flow-launcher-tiktok-description="true"]',
      ) || findDescriptionEditor(message.expectedFilename);
      sendResponse({
        ok: Boolean(editor),
        text: editor ? getEditorText(editor) : "",
      });
      return false;
    }

    if (message?.type === "FIND_TIKTOK_ADD_LINK_BUTTON") {
      void prepareClickTarget(
        findAddLinkButton,
        Number(message.timeoutMs) || 60 * 1000,
        'ไม่พบปุ่ม "เพิ่ม" ในหัวข้อเพิ่มลิงก์',
      )
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: String(error) }));
      return true;
    }

    if (message?.type === "FIND_TIKTOK_LINK_NEXT_BUTTON") {
      void prepareClickTarget(
        findAddLinkNextButton,
        Number(message.timeoutMs) || 30 * 1000,
        'ไม่พบปุ่ม "ถัดไป" ใน Modal เพิ่มลิงก์',
      )
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: String(error) }));
      return true;
    }

    if (message?.type === "PREPARE_TIKTOK_PRODUCT_SEARCH") {
      void prepareProductSearch(Number(message.timeoutMs) || 60 * 1000)
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: String(error) }));
      return true;
    }

    if (message?.type === "READ_TIKTOK_PRODUCT_SEARCH") {
      const input = document.querySelector(
        '[data-flow-launcher-tiktok-product-search="true"]',
      ) || findProductSearchInput();
      sendResponse({
        ok: Boolean(input),
        text: input ? getEditorText(input) : "",
      });
      return false;
    }

    if (message?.type === "FIND_TIKTOK_PRODUCT_RADIO") {
      void prepareClickTarget(
        () => findProductResultRadio(message.productId),
        Number(message.timeoutMs) || 60 * 1000,
        `ไม่พบตัวเลือกสินค้าที่มี Product ID ${normalize(message.productId)}`,
      )
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: String(error) }));
      return true;
    }

    if (message?.type === "FIND_TIKTOK_PRODUCT_NEXT_BUTTON") {
      void prepareClickTarget(
        () => findProductPickerNextButton(message.productId),
        Number(message.timeoutMs) || 30 * 1000,
        'ไม่พบปุ่ม "ถัดไป" หลังเลือกสินค้า',
      )
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: String(error) }));
      return true;
    }

    if (message?.type === "FIND_TIKTOK_CONFIRM_ADD_BUTTON") {
      void prepareClickTarget(
        findConfirmAddProductButton,
        Number(message.timeoutMs) || 30 * 1000,
        'ไม่พบปุ่ม "เพิ่ม" ใน Modal ยืนยันสินค้า',
      )
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: String(error) }));
      return true;
    }

    if (message?.type === "FIND_TIKTOK_POST_TIME_RADIO") {
      void prepareClickTarget(
        () => findPostTimeRadio(message.publishMode),
        Number(message.timeoutMs) || 30 * 1000,
        message.publishMode === "schedule"
          ? 'ไม่พบ Radio "ตั้งเวลา" ในหัวข้อเวลาโพสต์'
          : 'ไม่พบ Radio "ตอนนี้" ในหัวข้อเวลาโพสต์',
      )
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: String(error) }));
      return true;
    }

    if (message?.type === "FIND_TIKTOK_SHOW_MORE_BUTTON") {
      void prepareShowMoreTarget(Number(message.timeoutMs) || 30 * 1000)
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: String(error) }));
      return true;
    }

    if (message?.type === "FIND_TIKTOK_AI_CONTENT_TOGGLE") {
      void prepareAiGeneratedContentTarget(Number(message.timeoutMs) || 30 * 1000)
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: String(error) }));
      return true;
    }

    if (message?.type === "READ_TIKTOK_AI_CONTENT_TOGGLE") {
      const toggle = findAiGeneratedContentSwitch();
      sendResponse({
        ok: Boolean(toggle),
        enabled: Boolean(toggle && switchLooksEnabled(toggle)),
      });
      return false;
    }

    if (message?.type === "WAIT_FOR_TIKTOK_VALIDATION") {
      void waitForTikTokValidation(Number(message.timeoutMs) || 15 * 60 * 1000)
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: String(error) }));
      return true;
    }

    if (message?.type === "FIND_TIKTOK_DISABLE_LITE_TOGGLE") {
      void prepareDisableLiteTarget(Number(message.timeoutMs) || 30 * 1000)
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: String(error) }));
      return true;
    }

    if (message?.type === "READ_TIKTOK_LITE_TOGGLE") {
      const toggle = findLiteValidationSwitch();
      sendResponse({
        ok: Boolean(toggle),
        enabled: Boolean(toggle && switchLooksEnabled(toggle)),
      });
      return false;
    }

    if (message?.type === "FIND_TIKTOK_FINAL_PUBLISH_BUTTON") {
      void prepareClickTarget(
        () => findFinalPublishButton(message.publishMode),
        Number(message.timeoutMs) || 30 * 1000,
        message.publishMode === "schedule"
          ? 'ไม่พบปุ่ม "ตั้งเวลา" หลังการตรวจสอบเสร็จ'
          : 'ไม่พบปุ่ม "โพสต์" หลังการตรวจสอบเสร็จ',
      )
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: String(error) }));
      return true;
    }

    if (message?.type === "PREPARE_TIKTOK_SCHEDULE_FIELDS") {
      void prepareScheduleFields(Number(message.timeoutMs) || 30 * 1000)
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: String(error) }));
      return true;
    }

    if (message?.type === "FIND_TIKTOK_SCHEDULE_CONTROL") {
      void prepareClickTarget(
        () => findScheduleInput(message.kind === "date" ? "date" : "time"),
        Number(message.timeoutMs) || 30 * 1000,
        message.kind === "date" ? "ไม่พบช่องวันที่โพสต์" : "ไม่พบช่องเวลาโพสต์",
      )
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: String(error) }));
      return true;
    }

    if (message?.type === "READ_TIKTOK_SCHEDULE_VALUE") {
      const value = readScheduleValue(message.kind);
      sendResponse({ ok: Boolean(value), value });
      return false;
    }

    if (message?.type === "FIND_TIKTOK_TIME_OPTION") {
      void prepareClickTarget(
        () => findTimePickerOption(message.kind, message.value),
        Number(message.timeoutMs) || 30 * 1000,
        `ไม่พบ${message.kind === "minute" ? "นาที" : "ชั่วโมง"} ${message.value} ในตัวเลือกเวลา`,
      )
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: String(error) }));
      return true;
    }

    if (message?.type === "FIND_TIKTOK_DATE_OPTION") {
      void prepareDateTarget(
        String(message.dateValue || ""),
        Number(message.timeoutMs) || 30 * 1000,
      )
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: String(error) }));
      return true;
    }

    if (message?.type !== "WAIT_FOR_TIKTOK_VIDEO_UPLOAD") {
      return false;
    }
    void waitForUploadComplete(Number(message.timeoutMs) || undefined)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  });
})();
