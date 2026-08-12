(() => {
  if (globalThis.__flowLauncherTikTokUploadMonitorInstalled) {
    return;
  }
  globalThis.__flowLauncherTikTokUploadMonitorInstalled = true;

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();

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
      const inserted = document.execCommand("insertText", false, text);
      if (!inserted || !getEditorText(editor)) {
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

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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

    if (message?.type !== "WAIT_FOR_TIKTOK_VIDEO_UPLOAD") {
      return false;
    }
    void waitForUploadComplete(Number(message.timeoutMs) || undefined)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  });
})();
