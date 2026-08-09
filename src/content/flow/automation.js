const AUTOMATION_BUILD = chrome.runtime.getManifest().version;

if (
  !globalThis.FlowLauncherConfig ||
  !globalThis.FlowLauncherDom ||
  !globalThis.FlowLauncherMedia ||
  !globalThis.FlowLauncherRuntime
) {
  throw new Error("Flow Launcher modules were not loaded");
}

const {
  AUTOMATION_TIMEOUT_MS,
  CLICK_DELAY_MS,
  IMAGE_GENERATION_FALLBACK_MS,
  IMAGE_GENERATION_MIN_WAIT_MS,
  IMAGE_GENERATION_TIMEOUT_MS,
  INGREDIENT_SETTLE_DELAY_MS,
  PROJECT_SETTLE_DELAY_MS,
  PROMPT_VERIFY_DELAY_MS,
  RETRY_INTERVAL_MS,
  UPLOAD_HARD_SETTLE_MS,
  UPLOAD_TIMEOUT_MS,
} = globalThis.FlowLauncherConfig.TIMING;
const {
  ADD_REFERENCE: ADD_REFERENCE_LABELS,
  ADD_TO_PROMPT: ADD_TO_PROMPT_LABELS,
  DIRECT_UPLOAD: DIRECT_UPLOAD_LABELS,
  ENTER_FLOW: ENTER_FLOW_LABELS,
  FRAMES_MODE: FRAMES_MODE_LABELS,
  IMAGE_MODE: IMAGE_MODE_LABELS,
  IMAGE_MODEL: BANANA_2_LABELS,
  NEW_PROJECT: NEW_PROJECT_LABELS,
  PORTRAIT_RATIO: PORTRAIT_RATIO_LABELS,
  VIDEO_DURATION: EIGHT_SECOND_LABELS,
  VIDEO_MODE: VIDEO_MODE_LABELS,
  VIDEO_MODEL: VEO_31_LITE_LABELS,
} = globalThis.FlowLauncherConfig.LABELS;
const { getOutputCountLabels } = globalThis.FlowLauncherConfig;

const {
  activateElement,
  delay,
  findAction,
  findTextControl,
  getDirectText,
  getElementLabels,
  getSelectedState,
  interactiveSelector: INTERACTIVE_SELECTOR,
  isVisible,
  matchesControlText,
  normalizeLabel,
  promoteToClickableControl,
} = globalThis.FlowLauncherDom.createDomTools({ clickDelayMs: CLICK_DELAY_MS });
const workflowState = globalThis.FlowLauncherRuntime.createWorkflowState({
  build: AUTOMATION_BUILD,
});
const WORKFLOW_STAGES = globalThis.FlowLauncherRuntime.STAGES;

let automationCancelled = false;

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "cancelFlowAutomation") {
    return;
  }

  automationCancelled = true;
  showAutomationStatus("ยกเลิกการทำงานแล้ว");
  setTimeout(() => document.querySelector("#flow-launcher-status")?.remove(), 2500);
});

function findPromptField() {
  const candidates = [
    ...document.querySelectorAll(
      'textarea, [contenteditable]:not([contenteditable="false"]), input[type="text"]',
    ),
  ].filter(
    (element) =>
      isVisible(element) &&
      !element.matches(":disabled, [aria-disabled='true'], [readonly]"),
  );

  const scored = candidates
    .map((element) => {
      const labels = getElementLabels(element).join(" ");
      let score = 0;

      if (/prompt|describe|what do you want|ask flow|คำสั่ง|อธิบาย|พรอมต์/i.test(labels)) {
        score += 100;
      }
      if (/search|filter|ค้นหา/i.test(labels)) {
        score -= 200;
      }
      if (element.tagName === "TEXTAREA") {
        score += 40;
      }
      if (element.getAttribute("contenteditable") === "true") {
        score += 30;
      }

      return { element, score };
    })
    .sort((left, right) => right.score - left.score);

  return scored[0]?.score >= 0 ? scored[0].element : null;
}

function findSettingsButton() {
  const candidates = [
    ...document.querySelectorAll(INTERACTIVE_SELECTOR),
  ].filter((element) => isVisible(element));

  const interactiveMatch = candidates
    .map((element) => {
      const label = getElementLabels(element).join(" ");
      let score = 0;
      if (/nano banana|banana 2|imagen|gemini|video|veo/i.test(label)) {
        score += 100;
      }
      if (/\bx\s*[1-4]\b/i.test(label)) {
        score += 30;
      }
      if (/generate|สร้าง/i.test(label)) {
        score -= 100;
      }
      return { element, score };
    })
    .sort((left, right) => right.score - left.score)
    .find((candidate) => candidate.score > 0)?.element;

  if (interactiveMatch) {
    return interactiveMatch;
  }

  const fallbackMatch = [...document.querySelectorAll("body *")]
    .filter((element) => {
      if (!isVisible(element)) {
        return false;
      }
      const label = getElementLabels(element).join(" ");
      return (
        /nano banana|banana 2|imagen|gemini|video|veo/i.test(label) &&
        /x\s*[1-4]/i.test(label)
      );
    })
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return { element, area: rect.width * rect.height };
    })
    .sort((left, right) => left.area - right.area)[0]?.element;

  return fallbackMatch
    ? promoteToClickableControl(fallbackMatch, document)
    : null;
}

function findCommonContainer(elements) {
  let container = elements[0]?.parentElement;
  while (container && container !== document.body) {
    if (elements.every((element) => container.contains(element))) {
      return container;
    }
    container = container.parentElement;
  }
  return document;
}

function getVisibleSettingsControls(outputCount = 1) {
  const outputCountLabels = getOutputCountLabels(outputCount);
  const imageModeButton =
    findTextControl(IMAGE_MODE_LABELS) || findAction(IMAGE_MODE_LABELS);
  const portraitButton =
    findTextControl(PORTRAIT_RATIO_LABELS) || findAction(PORTRAIT_RATIO_LABELS);
  const outputCountButton =
    findTextControl(outputCountLabels) || findAction(outputCountLabels);

  if (!imageModeButton || !portraitButton || !outputCountButton) {
    return null;
  }

  return { imageModeButton, portraitButton, outputCountButton };
}

async function waitForSettingsControls(outputCount) {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    if (automationCancelled) {
      return null;
    }
    const controls = getVisibleSettingsControls(outputCount);
    if (controls) {
      return controls;
    }
    await delay(250);
  }
  return null;
}

async function configureImageSettings(outputCount = 1) {
  if (automationCancelled) {
    return false;
  }
  const settingsButton = findSettingsButton();
  if (!settingsButton) {
    return false;
  }

  const outputCountLabels = getOutputCountLabels(outputCount);
  let controls = getVisibleSettingsControls(outputCount);
  if (!controls) {
    await activateElement(settingsButton);
    controls = await waitForSettingsControls(outputCount);
  }

  if (!controls) {
    return false;
  }

  const { imageModeButton, portraitButton, outputCountButton } = controls;

  let settingsPanel = findCommonContainer([
    imageModeButton,
    portraitButton,
    outputCountButton,
  ]);

  await activateElement(imageModeButton);
  await delay(400);
  const refreshedImageMode =
    findTextControl(IMAGE_MODE_LABELS, settingsPanel) ||
    findAction(IMAGE_MODE_LABELS, settingsPanel);
  if (getSelectedState(refreshedImageMode || imageModeButton) === false) {
    await activateElement(refreshedImageMode || imageModeButton);
    await delay(300);
  }

  const refreshedControls = getVisibleSettingsControls(outputCount);
  if (refreshedControls) {
    settingsPanel = findCommonContainer([
      refreshedControls.imageModeButton,
      refreshedControls.portraitButton,
      refreshedControls.outputCountButton,
    ]);
  }

  const portraitOption =
    findTextControl(PORTRAIT_RATIO_LABELS, settingsPanel) ||
    findAction(PORTRAIT_RATIO_LABELS, settingsPanel);
  if (!portraitOption) {
    return false;
  }
  await activateElement(portraitOption);
  await delay(350);

  const selectedModel = [...settingsPanel.querySelectorAll(INTERACTIVE_SELECTOR)].find(
    (element) =>
      isVisible(element) &&
      getElementLabels(element).some((label) => BANANA_2_LABELS.some((pattern) => pattern.test(label))),
  );

  if (!selectedModel) {
    const modelMenuButton =
      findTextControl([/banana|imagen|gemini|model|video|veo/i], settingsPanel) ||
      [...settingsPanel.querySelectorAll(INTERACTIVE_SELECTOR)].find((element) => {
        const label = getElementLabels(element).join(" ");
        return isVisible(element) && /banana|imagen|gemini|model|video|veo/i.test(label);
      });

    if (!modelMenuButton) {
      return false;
    }
    await activateElement(modelMenuButton);
    await delay(500);
    const banana2Option =
      findTextControl(BANANA_2_LABELS) || findAction(BANANA_2_LABELS);
    if (!banana2Option) {
      return false;
    }
    await activateElement(banana2Option);
    await delay(250);
  }

  const outputCountOption =
    findTextControl(outputCountLabels, settingsPanel) ||
    findAction(outputCountLabels, settingsPanel);
  if (!outputCountOption) {
    return false;
  }
  await activateElement(outputCountOption);
  await delay(400);

  const refreshedOutputCount =
    findTextControl(outputCountLabels, settingsPanel) ||
    findAction(outputCountLabels, settingsPanel);
  if (getSelectedState(refreshedOutputCount || outputCountOption) === false) {
    await activateElement(refreshedOutputCount || outputCountOption);
    await delay(300);
  }

  if (getVisibleSettingsControls(outputCount)) {
    await activateElement(settingsButton);
    await delay(350);
  }

  const summary = getElementLabels(findSettingsButton() || settingsButton).join(" ");
  return (
    /nano banana 2|banana 2/i.test(summary) &&
    new RegExp(`x\\s*${outputCount}`, "i").test(summary)
  );
}

async function waitForControl(patterns, root = document, attempts = 24) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (automationCancelled) {
      return null;
    }
    const control = findTextControl(patterns, root) || findAction(patterns, root);
    if (control) {
      return control;
    }
    await delay(250);
  }
  return null;
}

function findVisibleTextElement(patterns, root = document) {
  return [...root.querySelectorAll("*")]
    .filter(
      (element) =>
        isVisible(element) &&
        !element.closest("#flow-launcher-status") &&
        getElementLabels(element).some((label) =>
          patterns.some((pattern) => pattern.test(label)),
        ),
    )
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return { element, area: rect.width * rect.height };
    })
    .sort((left, right) => left.area - right.area)[0]?.element || null;
}

function findVideoModeSibling(imageModeButton, settingsPanel) {
  let imageControl = imageModeButton;

  for (let level = 0; imageControl && level < 5; level += 1) {
    const parent = imageControl.parentElement;
    if (!parent || !settingsPanel.contains(parent)) {
      break;
    }

    const imageRect = imageControl.getBoundingClientRect();
    const siblings = [...parent.children].filter(
      (element) => element !== imageControl && isVisible(element),
    );
    const labeledVideoSibling = siblings.find((element) =>
      getElementLabels(element).some((label) =>
        VIDEO_MODE_LABELS.some((pattern) => pattern.test(label)),
      ),
    );
    if (labeledVideoSibling) {
      return promoteToClickableControl(labeledVideoSibling, settingsPanel);
    }

    const rightSibling = siblings
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.left >= imageRect.right - 4 &&
          Math.abs(rect.top - imageRect.top) <= 12 &&
          Math.abs(rect.height - imageRect.height) <= 16
        );
      })
      .sort(
        (left, right) =>
          left.getBoundingClientRect().left - right.getBoundingClientRect().left,
      )[0];
    if (rightSibling) {
      return promoteToClickableControl(rightSibling, settingsPanel);
    }

    imageControl = parent;
  }

  return null;
}

async function configureVideoSettings(fallbackPromptField = null) {
  if (automationCancelled) {
    return false;
  }

  let controls = getVisibleSettingsControls(1);
  let settingsButton = null;

  // Add to Prompt causes Flow to rebuild the composer repeatedly. Never keep
  // a chip reference across retries: query a fresh element immediately before
  // every click and stop as soon as the popup controls become visible.
  for (let attempt = 0; attempt < 24 && !controls; attempt += 1) {
    if (automationCancelled) {
      return false;
    }
    showAutomationStatus(
      `รอ composer พร้อม แล้วกำลังกดชิปตั้งค่า… (${attempt + 1}/24)`,
      "working",
      70 + Math.min(3, Math.floor(attempt / 8)),
    );

    const freshSettingsLabel =
      findVisibleTextElement(BANANA_2_LABELS) ||
      findVisibleTextElement([/video.*(?:8\s*s|x\s*1)/i]);
    settingsButton =
      findSettingsButton() ||
      (freshSettingsLabel
        ? promoteToClickableControl(freshSettingsLabel, document)
        : null);
    const freshPromptField = getUsablePromptField(fallbackPromptField);

    if (attempt % 3 === 0 && settingsButton) {
      await activateElement(settingsButton);
    } else if (attempt % 3 === 1 && (freshSettingsLabel || settingsButton)) {
      await cdpClickElement(freshSettingsLabel || settingsButton);
    } else if (freshPromptField) {
      await cdpClickPromptSettingsChip(freshPromptField);
    }

    for (let check = 0; check < 4 && !controls; check += 1) {
      await delay(250);
      controls = getVisibleSettingsControls(1);
    }
  }
  if (!controls) {
    throw new Error("VIDEO_STAGE:OPEN_SETTINGS");
  }
  settingsButton = findSettingsButton() || settingsButton;

  const settingsPanel = findCommonContainer([
    controls.imageModeButton,
    controls.portraitButton,
    controls.outputCountButton,
  ]);
  showAutomationStatus("เปิดตั้งค่าแล้ว กำลังสลับ Image → Video…", "working", 74);
  const videoModeButton =
    findVideoModeSibling(controls.imageModeButton, settingsPanel) ||
    findTextControl(VIDEO_MODE_LABELS, settingsPanel) ||
    findAction(VIDEO_MODE_LABELS, settingsPanel);
  const videoTextElement = findVisibleTextElement(VIDEO_MODE_LABELS, settingsPanel);
  if (!videoModeButton && !videoTextElement) {
    throw new Error("VIDEO_STAGE:FIND_VIDEO_TAB");
  }

  await activateElement(videoModeButton || videoTextElement);
  // The exact visible text is the safest coordinate target: even if its
  // parent is a non-semantic div, the click still bubbles to Flow's tab.
  await cdpClickElement(videoTextElement || videoModeButton);
  await delay(650);

  let framesButton = await waitForControl(FRAMES_MODE_LABELS, settingsPanel, 8);
  if (!framesButton) {
    // Keyboard fallback for Flow's tablist: focus the known-good Image tab,
    // move once to its Video sibling, then activate it.
    controls.imageModeButton.focus({ preventScroll: true });
    await chrome.runtime.sendMessage({ type: "cdpKeyPress", key: "ArrowRight" }).catch(() => { });
    await delay(250);
    await chrome.runtime.sendMessage({ type: "cdpKeyPress", key: "Enter" }).catch(() => { });
    await delay(650);
    framesButton = await waitForControl(FRAMES_MODE_LABELS, settingsPanel, 16);
  }
  if (!framesButton) {
    throw new Error("VIDEO_STAGE:SWITCH_VIDEO_TAB");
  }
  await activateElement(framesButton);
  await delay(400);

  const portraitButton = await waitForControl(PORTRAIT_RATIO_LABELS, settingsPanel);
  if (!portraitButton) {
    throw new Error("VIDEO_STAGE:SELECT_9_16");
  }
  await activateElement(portraitButton);
  await delay(400);

  let veoLiteControl =
    findTextControl(VEO_31_LITE_LABELS, settingsPanel) ||
    findAction(VEO_31_LITE_LABELS, settingsPanel);
  if (!veoLiteControl) {
    const modelMenuButton =
      findTextControl([/veo|model|โมเดล/i], settingsPanel) ||
      findAction([/veo|model|โมเดล/i], settingsPanel);
    if (!modelMenuButton) {
      throw new Error("VIDEO_STAGE:OPEN_MODEL_MENU");
    }
    await activateElement(modelMenuButton);
    await delay(500);
    veoLiteControl = await waitForControl(VEO_31_LITE_LABELS);
    if (!veoLiteControl) {
      throw new Error("VIDEO_STAGE:SELECT_VEO_LITE");
    }
    await activateElement(veoLiteControl);
    await delay(400);
  }

  const durationButton = await waitForControl(EIGHT_SECOND_LABELS, settingsPanel);
  if (!durationButton) {
    throw new Error("VIDEO_STAGE:SELECT_8S");
  }
  await activateElement(durationButton);
  await delay(350);

  const singleOutputButton = await waitForControl(getOutputCountLabels(1), settingsPanel);
  if (!singleOutputButton) {
    throw new Error("VIDEO_STAGE:SELECT_X1");
  }
  await activateElement(singleOutputButton);
  await delay(400);

  settingsButton = findSettingsButton() || settingsButton;
  if (findTextControl(FRAMES_MODE_LABELS, settingsPanel)) {
    await activateElement(settingsButton);
    await delay(350);
  }

  const summary = getElementLabels(findSettingsButton() || settingsButton).join(" ");
  if (!/video|วิดีโอ/i.test(summary) || !/8\s*s/i.test(summary) || !/x\s*1/i.test(summary)) {
    throw new Error("VIDEO_STAGE:VERIFY_SETTINGS");
  }
  return true;
}

function findNearbyAction(promptField, patterns) {
  let container = promptField.parentElement;

  for (let level = 0; container && level < 6; level += 1) {
    const action = findAction(patterns, container);
    if (action) {
      return action;
    }
    container = container.parentElement;
  }

  return null;
}

function findImageFileInput() {
  return [...document.querySelectorAll('input[type="file"]')].find((input) => {
    const accept = String(input.accept ?? "").toLowerCase();
    return !input.disabled && (!accept || accept.includes("image") || accept.includes(".png"));
  });
}

function dataUrlToFile(image) {
  const [header, encodedData] = image.dataUrl.split(",", 2);
  const mimeType = header.match(/^data:([^;]+)/)?.[1] || image.type || "image/png";
  const binary = atob(encodedData);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new File([bytes], image.name, { type: mimeType });
}

function attachImage(fileInput, image) {
  const transfer = new DataTransfer();
  transfer.items.add(dataUrlToFile(image));
  fileInput.files = transfer.files;
  fileInput.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  fileInput.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
}

function findUploadedAsset(imageName) {
  const normalizedName = normalizeLabel(imageName).toLowerCase();
  const promptField = findPromptField();
  const promptContainer = promptField ? getPromptDropTarget(promptField) : null;
  const candidates = new Set([
    ...document.querySelectorAll(
      [
        "img",
        "canvas",
        "video",
        '[role="img"]',
        '[draggable="true"]',
        '[data-testid*="asset" i]',
        '[data-testid*="media" i]',
        '[class*="asset" i]',
        '[class*="media" i]',
        '[style*="background-image"]',
        "figure",
        "article",
      ].join(", "),
    ),
  ]);

  for (const element of document.querySelectorAll("body div")) {
    const rect = element.getBoundingClientRect();
    if (
      rect.width >= 80 &&
      rect.height >= 100 &&
      rect.width <= 500 &&
      rect.height <= 700 &&
      rect.top < window.innerHeight - 160
    ) {
      candidates.add(element);
    }
  }

  return [...candidates]
    .map((element) => {
      if (
        !isVisible(element) ||
        element.closest("#flow-launcher-status, nav, header, [role='navigation']") ||
        (promptContainer && (element === promptContainer || element.contains(promptField)))
      ) {
        return { element, score: -1 };
      }

      const rect = element.getBoundingClientRect();
      if (
        rect.width < 70 ||
        rect.height < 70 ||
        rect.width > window.innerWidth * 0.55 ||
        rect.height > window.innerHeight * 0.78 ||
        rect.bottom > window.innerHeight - 110
      ) {
        return { element, score: -1 };
      }

      const label = getElementLabels(element).join(" ").toLowerCase();
      const backgroundImage = getComputedStyle(element).backgroundImage;
      let score = Math.min(rect.width * rect.height, 120000) / 1000;
      if (normalizedName && label.includes(normalizedName)) {
        score += 500;
      }
      if (element.matches('[draggable="true"]')) {
        score += 160;
      }
      if (["IMG", "CANVAS", "VIDEO"].includes(element.tagName)) {
        score += 250;
      }
      if (backgroundImage && backgroundImage !== "none") {
        score += 220;
      }
      if (/asset|media|upload/i.test(String(element.className))) {
        score += 180;
      }
      if (rect.left < window.innerWidth * 0.45) {
        score += 80;
      }
      if (rect.height > rect.width) {
        score += 40;
      }
      if (element.childElementCount < 10) {
        score += 20;
      }
      if (/trash|tools|all media|search|filter/i.test(label)) {
        score -= 300;
      }

      return { element, score };
    })
    .sort((left, right) => right.score - left.score)
    .find((candidate) => candidate.score >= 100)?.element;
}

function hasUploadProgress() {
  // A page-wide search for text such as "100%" is too broad: Flow can leave
  // unrelated percentage labels in the DOM after an upload has completed.
  // Only trust actual progress controls that still report an unfinished value.
  return [...document.querySelectorAll('[role="progressbar"], progress, [aria-valuenow]')].some(
    (element) => {
      if (!isVisible(element) || element.closest("#flow-launcher-status")) {
        return false;
      }

      const value = Number(
        element.getAttribute("aria-valuenow") ??
        (element instanceof HTMLProgressElement ? element.value : NaN),
      );
      const maximum = Number(
        element.getAttribute("aria-valuemax") ??
        (element instanceof HTMLProgressElement ? element.max : 100),
      );
      return Number.isFinite(value) && Number.isFinite(maximum) && value >= 0 && value < maximum;
    },
  );
}

function getUsablePromptField(fallbackPromptField = null) {
  const livePromptField = findPromptField();
  if (livePromptField) {
    return livePromptField;
  }

  if (
    fallbackPromptField?.isConnected &&
    isVisible(fallbackPromptField) &&
    !fallbackPromptField.matches(":disabled, [aria-disabled='true'], [readonly]")
  ) {
    return fallbackPromptField;
  }

  return null;
}

function hasPromptIngredient(promptField) {
  const state = capturePromptState(promptField);
  return state.previewCount > 0 || state.dismissControlCount > 0;
}

async function waitForUploadOutcome(
  imageName,
  promptStateBeforeUpload,
  fallbackPromptField,
) {
  const startedAt = Date.now();
  let stableSettledChecks = 0;
  let stableIngredientChecks = 0;

  while (!automationCancelled && Date.now() - startedAt < UPLOAD_TIMEOUT_MS) {
    const promptField = getUsablePromptField(fallbackPromptField);
    // Current Flow inserts an uploaded image directly into the composer. Its
    // DOM may be re-rendered before our before/after snapshot can see a delta,
    // so also accept a visible ingredient already beside the prompt field.
    if (
      promptField &&
      (hasNewIngredient(promptField, promptStateBeforeUpload) ||
        hasPromptIngredient(promptField))
    ) {
      stableIngredientChecks += 1;
      if (stableIngredientChecks >= 2) {
        return { type: "ingredient", promptField };
      }
    } else {
      stableIngredientChecks = 0;
    }

    const asset = findUploadedAsset(imageName);
    const elapsed = Date.now() - startedAt;
    const uploadHadTimeToSettle = Date.now() - startedAt >= 5000;
    if (uploadHadTimeToSettle && !hasUploadProgress()) {
      stableSettledChecks += 1;
      if (stableSettledChecks >= 4) {
        // Flow does not always expose the uploaded asset as an identifiable DOM
        // card. Continue through the + / Add to Prompt picker even without it.
        return { type: "asset", asset };
      }
    } else {
      stableSettledChecks = 0;
    }

    // Upload progress in Flow can remain mounted after the image is already
    // usable. Never let that stale node block prompt entry indefinitely.
    if (elapsed >= UPLOAD_HARD_SETTLE_MS && promptField) {
      return { type: "ingredient", promptField, inferred: true };
    }
    await delay(500);
  }

  return null;
}

function getPromptDropTarget(promptField) {
  let container = promptField.parentElement;
  let bestMatch = null;
  for (let level = 0; container && level < 7; level += 1) {
    const rect = container.getBoundingClientRect();
    if (rect.width >= 320 && rect.height >= 60 && rect.height <= 280) {
      bestMatch = container;
    }
    container = container.parentElement;
  }
  return bestMatch || promptField;
}

const {
  findLatestPickerAsset,
  getWorkspaceMediaSignatures,
} = globalThis.FlowLauncherMedia.createMediaTools({
  getElementLabels,
  getPromptDropTarget,
  isVisible,
  normalizeLabel,
  promoteToClickableControl,
});

function getPromptVicinity(promptField) {
  const fieldRect = promptField.getBoundingClientRect();
  const containerRect = getPromptDropTarget(promptField).getBoundingClientRect();
  return {
    left: Math.max(0, Math.min(containerRect.left, fieldRect.left - 48)),
    right: Math.min(
      window.innerWidth,
      Math.max(containerRect.right, fieldRect.right + 160),
    ),
    top: Math.max(0, Math.min(containerRect.top, fieldRect.top - 180)),
    bottom: Math.min(
      window.innerHeight,
      Math.max(containerRect.bottom, fieldRect.bottom + 100),
    ),
  };
}

function isInsideRect(element, bounds) {
  const rect = element.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  return (
    centerX >= bounds.left &&
    centerX <= bounds.right &&
    centerY >= bounds.top &&
    centerY <= bounds.bottom
  );
}

function countIngredientPreviews(promptField) {
  const container = getPromptDropTarget(promptField);
  const vicinity = getPromptVicinity(promptField);
  const candidates = new Set([
    ...document.querySelectorAll(
      'img, canvas, video, [role="img"], [style*="background-image"], [class*="asset" i], [class*="media" i], [class*="thumbnail" i], [class*="preview" i]',
    ),
  ]);

  // Flow's current composer can render the ingredient thumbnail as a div with
  // a stylesheet-provided background image, rather than an <img> or an inline
  // style. Include only small visible divs near the prompt to avoid treating
  // unrelated media cards elsewhere on the page as ingredients.
  for (const element of document.querySelectorAll("body div")) {
    const rect = element.getBoundingClientRect();
    if (
      isVisible(element) &&
      (container.contains(element) || isInsideRect(element, vicinity)) &&
      rect.width >= 24 &&
      rect.height >= 24 &&
      rect.width <= 180 &&
      rect.height <= 180 &&
      getComputedStyle(element).backgroundImage !== "none"
    ) {
      candidates.add(element);
    }
  }

  return [...candidates].filter((element) => {
    if (
      !isVisible(element) ||
      element.closest("#flow-launcher-status") ||
      (!container.contains(element) && !isInsideRect(element, vicinity))
    ) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    if (
      rect.width < 24 ||
      rect.height < 24 ||
      rect.width > 180 ||
      rect.height > 180
    ) {
      return false;
    }

    const style = getComputedStyle(element);
    return (
      ["IMG", "CANVAS", "VIDEO"].includes(element.tagName) ||
      element.getAttribute("role") === "img" ||
      style.backgroundImage !== "none" ||
      /asset|media|thumbnail|preview/i.test(String(element.className))
    );
  }).length;
}

function countIngredientDismissControls(promptField) {
  const container = getPromptDropTarget(promptField);
  const vicinity = getPromptVicinity(promptField);
  return [...document.querySelectorAll(INTERACTIVE_SELECTOR)].filter((element) => {
    if (
      !isVisible(element) ||
      element.closest("#flow-launcher-status") ||
      (!container.contains(element) && !isInsideRect(element, vicinity))
    ) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    if (rect.width > 64 || rect.height > 64) {
      return false;
    }

    const directText = normalizeLabel(getDirectText(element));
    const labels = getElementLabels(element).join(" ");
    return (
      /^[x×✕✖]$/i.test(directText) ||
      /close|remove|delete|clear|dismiss|เอาออก|ลบ/i.test(labels)
    );
  }).length;
}

function capturePromptState(promptField) {
  const container = getPromptDropTarget(promptField);
  return {
    previewCount: countIngredientPreviews(promptField),
    dismissControlCount: countIngredientDismissControls(promptField),
    height: container.getBoundingClientRect().height,
  };
}

function hasNewIngredient(promptField, previousState) {
  const currentState = capturePromptState(promptField);
  return (
    currentState.previewCount > previousState.previewCount ||
    currentState.dismissControlCount > previousState.dismissControlCount ||
    currentState.height > previousState.height + 24
  );
}

async function waitForAddToPromptAction() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (automationCancelled) {
      return null;
    }
    const action =
      findTextControl(ADD_TO_PROMPT_LABELS) ||
      findAction(ADD_TO_PROMPT_LABELS);
    if (action) {
      return action;
    }
    await delay(250);
  }
  return null;
}

function findSmallActionButtonsIn(container, maxSize) {
  return [...container.querySelectorAll(INTERACTIVE_SELECTOR)].filter((element) => {
    if (!isVisible(element)) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    const label = getElementLabels(element).join(" ");
    return (
      rect.width <= maxSize &&
      rect.height <= maxSize &&
      !/agent|close|remove|delete|cancel|nano banana|x\s*[1-4]/i.test(label)
    );
  });
}

// getPromptDropTarget() picks one ancestor container based on a fixed height
// range (60–280px). A long, multi-line prompt (or an attached image
// thumbnail) can push the real composer taller than that, so no ancestor
// matches and it silently falls back to the prompt field itself — which does
// NOT contain the "+" or send-arrow buttons (they're siblings, not
// descendants, of the text box). Walking outward level by level and testing
// each ancestor directly avoids that single bad guess.
function findActionButtonNearPromptField(promptField, maxSize, sortFn) {
  let container = promptField.parentElement;
  for (let level = 0; container && level < 8; level += 1) {
    const rect = container.getBoundingClientRect();
    if (rect.width >= 280) {
      const candidates = findSmallActionButtonsIn(container, maxSize);
      if (candidates.length > 0) {
        return candidates.sort(sortFn)[0];
      }
    }
    container = container.parentElement;
  }
  return null;
}

function findPromptAddButton(promptField) {
  return findActionButtonNearPromptField(
    promptField,
    80,
    (left, right) => left.getBoundingClientRect().left - right.getBoundingClientRect().left,
  );
}

function getMediaPickerContainer(addToPromptAction) {
  const dialog = addToPromptAction.closest('[role="dialog"]');
  if (dialog) {
    return dialog;
  }

  let container = addToPromptAction.parentElement;
  for (let level = 0; container && level < 8; level += 1) {
    const rect = container.getBoundingClientRect();
    if (rect.width >= 500 && rect.height >= 300) {
      return container;
    }
    container = container.parentElement;
  }
  return document;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findPickerThumbnail(picker) {
  return [...picker.querySelectorAll('img, canvas, [role="img"]')]
    .filter((element) => {
      if (!isVisible(element)) {
        return false;
      }
      const rect = element.getBoundingClientRect();
      return rect.width >= 32 && rect.height >= 32 && rect.width <= 180 && rect.height <= 180;
    })
    .sort((left, right) => {
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      return leftRect.width * leftRect.height - rightRect.width * rightRect.height;
    })[0];
}

async function openPromptMediaPicker(promptField, imageName) {
  const addButton = findPromptAddButton(promptField);
  if (!addButton) {
    return null;
  }

  await activateElement(addButton);
  const initialAddToPromptAction = await waitForAddToPromptAction();
  if (!initialAddToPromptAction) {
    return null;
  }

  const picker = getMediaPickerContainer(initialAddToPromptAction);
  const baseName = imageName.replace(/\.[^.]+$/, "");
  const namePattern = new RegExp(escapeRegExp(baseName), "i");
  const namedAsset = findTextControl([namePattern], picker);
  const assetToSelect = namedAsset || findPickerThumbnail(picker);
  if (assetToSelect) {
    await activateElement(assetToSelect);
    await delay(700);
  }

  for (let attempt = 0; attempt < 16; attempt += 1) {
    const addToPromptAction =
      findTextControl(ADD_TO_PROMPT_LABELS, picker) ||
      findAction(ADD_TO_PROMPT_LABELS, picker);
    if (
      addToPromptAction &&
      !addToPromptAction.matches(":disabled, [aria-disabled='true'], [data-disabled='true']")
    ) {
      return addToPromptAction;
    }
    await delay(250);
  }

  return null;
}

async function addAssetAsIngredient(imageName, promptField) {
  if (automationCancelled) {
    return null;
  }
  const addToPromptAction = await openPromptMediaPicker(promptField, imageName);
  if (!addToPromptAction) {
    return null;
  }

  await activateElement(addToPromptAction);
  // Do not wait for Flow's changing Ingredient DOM. Give the composer time to
  // finish its animation, then continue directly to prompt entry.
  await delay(INGREDIENT_SETTLE_DELAY_MS);
  return findPromptField() || promptField;
}

// --- "+" media picker upload path ---------------------------------------
// Flow does not always expose a ready-to-use <input type="file"> on the
// composer itself (that is what makes the plain drag/attach approach flaky).
// The reliable path is the same one a human uses: press the small "+" next
// to the prompt box, use the picker's own "Upload media" control (which is
// guaranteed to own a real file input once clicked), wait for the uploaded
// asset to appear/auto-select inside the picker, then press "Add to Prompt".

function findAddIngredientButton(promptField) {
  return findPromptAddButton(promptField) || findNearbyAction(promptField, ADD_REFERENCE_LABELS);
}

async function openIngredientPicker(promptField) {
  const addButton = findAddIngredientButton(promptField);
  console.log("[flow-launcher] picker: '+' button found?", Boolean(addButton));
  if (!addButton) {
    return null;
  }

  await activateElement(addButton);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (automationCancelled) {
      return null;
    }
    const uploadTrigger = findAction(DIRECT_UPLOAD_LABELS);
    const addToPromptAction = findTextControl(ADD_TO_PROMPT_LABELS) || findAction(ADD_TO_PROMPT_LABELS);
    const anchor = uploadTrigger || addToPromptAction;
    if (anchor) {
      console.log("[flow-launcher] picker: dialog opened, anchor =", anchor);
      return getMediaPickerContainer(anchor);
    }
    await delay(250);
  }

  console.warn("[flow-launcher] picker: dialog never appeared after clicking '+'");
  return null;
}

async function uploadImageIntoPicker(picker, image) {
  // A synthetic (non-trusted) click cannot make the browser open the native
  // "choose a file" OS dialog — browsers only allow that from a real user
  // gesture. So clicking "Upload media" first is unreliable and can even be
  // counterproductive (some buttons swap the picker to another view while
  // waiting on a dialog that will never appear). Instead: look for the file
  // input Flow already has mounted (usually hidden, still findable in the
  // DOM) and attach straight to it. Only click "Upload media" as a fallback
  // if no input is found at all.
  let fileInput = findImageFileInput();
  console.log("[flow-launcher] picker: file input present before click?", Boolean(fileInput));

  if (!fileInput) {
    const uploadTrigger = findAction(DIRECT_UPLOAD_LABELS, picker) || findAction(DIRECT_UPLOAD_LABELS);
    console.log("[flow-launcher] picker: 'Upload media' trigger found?", Boolean(uploadTrigger));
    if (uploadTrigger) {
      await activateElement(uploadTrigger);
      await delay(400);
    }

    for (let attempt = 0; attempt < 12; attempt += 1) {
      if (automationCancelled) {
        return false;
      }
      fileInput = findImageFileInput();
      if (fileInput) {
        break;
      }
      await delay(250);
    }
  }

  if (!fileInput) {
    console.warn("[flow-launcher] picker: no file input found, giving up on this path");
    return false;
  }

  attachImage(fileInput, image);
  console.log("[flow-launcher] picker: file attached to input", fileInput);
  return true;
}

async function waitForPickerAssetReady(picker, imageName) {
  const startedAt = Date.now();
  const baseName = imageName.replace(/\.[^.]+$/, "");
  const namePattern = new RegExp(escapeRegExp(baseName), "i");
  let triedSelectingNamedAsset = false;

  while (!automationCancelled && Date.now() - startedAt < UPLOAD_TIMEOUT_MS) {
    if (!hasUploadProgress()) {
      if (!triedSelectingNamedAsset) {
        const namedAsset = findTextControl([namePattern], picker);
        if (namedAsset) {
          triedSelectingNamedAsset = true;
          await activateElement(namedAsset);
          await delay(500);
        }
      }

      const addToPromptAction =
        findTextControl(ADD_TO_PROMPT_LABELS, picker) || findAction(ADD_TO_PROMPT_LABELS, picker);
      if (
        addToPromptAction &&
        !addToPromptAction.matches(":disabled, [aria-disabled='true'], [data-disabled='true']")
      ) {
        console.log("[flow-launcher] picker: 'Add to Prompt' is ready", addToPromptAction);
        return addToPromptAction;
      }
    }
    await delay(400);
  }

  console.warn("[flow-launcher] picker: timed out waiting for asset / 'Add to Prompt'");
  return null;
}

async function attachImageViaAddToPrompt(promptField, image) {
  const picker = await openIngredientPicker(promptField);
  if (!picker) {
    return null;
  }

  const uploaded = await uploadImageIntoPicker(picker, image);
  if (!uploaded) {
    return null;
  }

  const addToPromptAction = await waitForPickerAssetReady(picker, image.name);
  if (!addToPromptAction) {
    return null;
  }

  await activateElement(addToPromptAction);
  // Do not wait for Flow's changing Ingredient DOM. Give the composer time to
  // finish its animation, then continue directly to prompt entry.
  await delay(INGREDIENT_SETTLE_DELAY_MS);
  return findPromptField() || promptField;
}

function hasGenerationActivity() {
  if (hasUploadProgress()) {
    return true;
  }
  return [...document.querySelectorAll("body *")].some((element) => {
    if (
      !isVisible(element) ||
      element.closest("#flow-launcher-status") ||
      element.childElementCount > 2
    ) {
      return false;
    }
    const text = normalizeLabel(getDirectText(element));
    return /^(generating|creating|rendering|processing)|กำลังสร้าง|กำลังประมวลผล/i.test(text);
  });
}

async function waitForGeneratedImageReady(previousSignatures, fallbackPromptField) {
  const startedAt = Date.now();
  let stableReadyChecks = 0;
  let lastReportedProgress = -1;

  while (!automationCancelled && Date.now() - startedAt < IMAGE_GENERATION_TIMEOUT_MS) {
    const elapsed = Date.now() - startedAt;
    const estimatedProgress = Math.min(
      60,
      52 + Math.floor((elapsed / IMAGE_GENERATION_FALLBACK_MS) * 8),
    );
    if (estimatedProgress !== lastReportedProgress) {
      lastReportedProgress = estimatedProgress;
      showAutomationStatus(
        "กำลังรอ AI สร้างรูปให้เสร็จ…",
        "working",
        estimatedProgress,
      );
    }
    const active = hasGenerationActivity();
    const promptField = getUsablePromptField(fallbackPromptField);
    const signatures = getWorkspaceMediaSignatures(promptField);
    const hasNewMedia = [...signatures].some((signature) => !previousSignatures.has(signature));
    const canAcceptReadyState = elapsed >= IMAGE_GENERATION_MIN_WAIT_MS;

    if (canAcceptReadyState && !active && hasNewMedia) {
      stableReadyChecks += 1;
      if (stableReadyChecks >= 3) {
        return {
          signatures,
          newSignatures: new Set(
            [...signatures].filter((signature) => !previousSignatures.has(signature)),
          ),
        };
      }
    } else {
      stableReadyChecks = 0;
    }

    // Some Flow builds draw the result into an existing canvas and expose no
    // generation status in the DOM. After a generous wait, continue to the
    // Recent media picker, whose Add to Prompt button is the final readiness check.
    if (elapsed >= IMAGE_GENERATION_FALLBACK_MS && !active && hasNewMedia) {
      return {
        signatures,
        newSignatures: new Set(
          [...signatures].filter((signature) => !previousSignatures.has(signature)),
        ),
      };
    }
    await delay(1000);
  }
  return false;
}

async function attachLatestGeneratedImage(
  promptField,
  originalImageName,
  preferredSignatures,
) {
  const picker = await openIngredientPicker(promptField);
  if (!picker) {
    return null;
  }
  await delay(1000);

  let latestAsset = null;
  for (let attempt = 0; attempt < 30 && !latestAsset; attempt += 1) {
    latestAsset = findLatestPickerAsset(
      picker,
      originalImageName,
      preferredSignatures,
    );
    if (!latestAsset) {
      await delay(500);
    }
  }
  if (!latestAsset) {
    return null;
  }
  await activateElement(latestAsset);
  await delay(700);

  for (let attempt = 0; attempt < 24; attempt += 1) {
    if (automationCancelled) {
      return null;
    }
    const addToPromptAction =
      findTextControl(ADD_TO_PROMPT_LABELS, picker) ||
      findAction(ADD_TO_PROMPT_LABELS, picker);
    if (
      addToPromptAction &&
      !addToPromptAction.matches(":disabled, [aria-disabled='true'], [data-disabled='true']")
    ) {
      await activateElement(addToPromptAction);
      await delay(INGREDIENT_SETTLE_DELAY_MS);
      // A successful Add to Prompt is enough to continue. Flow often replaces
      // the composer node at this exact moment, so requiring the old/new text
      // field to be discoverable here incorrectly aborts before Video setup.
      return true;
    }
    await delay(250);
  }
  return null;
}

async function waitForUsablePromptField(fallbackPromptField, timeoutMs = 20 * 1000) {
  const timeoutAt = Date.now() + timeoutMs;
  while (!automationCancelled && Date.now() < timeoutAt) {
    const promptField = getUsablePromptField(fallbackPromptField);
    if (promptField) {
      return promptField;
    }
    await delay(400);
  }
  return null;
}

function collapseSelectionToEnd(promptField) {
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(promptField);
  // Do not select-and-replace the whole composer: Flow keeps an uploaded
  // image ingredient inside it, and replacing its contents removes the image.
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
  return selection;
}

function dispatchPromptInputEvents(promptField, prompt) {
  promptField.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      composed: true,
      data: prompt,
      inputType: "insertText",
    }),
  );
  promptField.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
}

// The Flow prompt composer is a contenteditable controlled by a framework
// (Lexical/Slate/ProseMirror-style) that keeps its own internal document
// state and re-renders the DOM from it. Synthetic events dispatched from a
// content script always have isTrusted === false, and this class of editor
// can silently ignore or reconcile away execCommand-inserted text on its
// next re-render — the text visibly appears then vanishes, or worse, gets
// spliced into the placeholder in a corrupted way if multiple insertion
// methods stack on top of each other without clearing between attempts.
//
// The reliable fix is to type through the Chrome DevTools Protocol via
// chrome.debugger (see service-worker.js "cdpInsertText"). CDP-injected input is
// applied at the real browser input pipeline, the same layer tools like
// Puppeteer/Selenium use, so the editor cannot distinguish it from genuine
// user typing. This requires the "debugger" permission and briefly shows
// Chrome's "extension is debugging this browser" bar while it runs.
async function fillPromptViaCdp(prompt) {
  const response = await chrome.runtime
    .sendMessage({ type: "cdpInsertText", text: prompt })
    .catch((error) => ({ ok: false, error: String(error) }));
  return Boolean(response?.ok);
}

async function fillPrompt(promptField, prompt) {
  promptField.focus();

  if (promptField instanceof HTMLInputElement || promptField instanceof HTMLTextAreaElement) {
    const prototype =
      promptField instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const valueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    valueSetter?.call(promptField, prompt);
    dispatchPromptInputEvents(promptField, prompt);
    return;
  }

  collapseSelectionToEnd(promptField);
  const cdpSucceeded = await fillPromptViaCdp(prompt);

  if (!cdpSucceeded) {
    // Debugger attach can fail (e.g. another DevTools session already
    // attached to the tab). Fall back to the old best-effort method rather
    // than leaving the field untouched.
    console.warn("[flow-launcher] CDP insertText unavailable, falling back to execCommand");
    collapseSelectionToEnd(promptField);
    document.execCommand("insertText", false, prompt);
    dispatchPromptInputEvents(promptField, prompt);
  }
}

function getPromptValue(promptField) {
  if (promptField instanceof HTMLInputElement || promptField instanceof HTMLTextAreaElement) {
    return normalizeLabel(promptField.value);
  }
  return normalizeLabel(promptField.innerText || promptField.textContent);
}

function getVisiblePromptFields() {
  return [
    ...document.querySelectorAll(
      'textarea, [contenteditable]:not([contenteditable="false"]), input[type="text"]',
    ),
  ].filter(
    (element) =>
      isVisible(element) &&
      !element.matches(":disabled, [aria-disabled='true'], [readonly]") &&
      !/search|filter|ค้นหา/i.test(getElementLabels(element).join(" ")),
  );
}

function isPromptPresent(expectedPrompt) {
  return getVisiblePromptFields().some((field) => {
    const currentValue = getPromptValue(field);
    return (
      currentValue === expectedPrompt ||
      currentValue.includes(expectedPrompt)
    );
  });
}

// The send/generate button's accessible name includes the Material Symbols
// icon ligature "arrow_forward" plus a visually-hidden "Create" label (seen
// via DevTools Accessibility panel). Matching on that text is far more
// reliable than guessing by position/size, which can occasionally grab a
// neighboring control (model picker, x1 chip) instead.
const SUBMIT_BUTTON_LABELS = [
  /arrow_forward/i,
  /^create$/i,
  /\bsend\b/i,
  /\bgenerate\b/i,
  /\bsubmit\b/i,
  /generate video/i,
  /create video/i,
  /run prompt/i,
  /^สร้าง$/i,
  /^ส่ง$/i,
  /ส่งข้อความ/i,
  /เริ่มสร้าง/i,
];

// Some Flow UI variants (e.g. the "Agent" chat composer) render the send
// control as a bare clickable element with no button/role/tabindex and no
// accessible name at all — just an icon inside a div with a click handler
// and CSS cursor:pointer. INTERACTIVE_SELECTOR-based lookups (findAction /
// findTextControl / findSmallActionButtonsIn) can never see these, which is
// the most likely reason the labeled/positional search comes back empty
// forever and submitPromptForGeneration() times out. This helper widens the
// net to *any* visible, appropriately-sized element with pointer cursor.
function findPointerCursorCandidatesNear(promptField, maxSize = 90) {
  let container = promptField.parentElement;
  const seen = new Set();
  const results = [];

  for (let level = 0; container && level < 8; level += 1) {
    const rect = container.getBoundingClientRect();
    if (rect.width >= 280) {
      const all = container.querySelectorAll("*");
      for (const element of all) {
        if (seen.has(element) || !isVisible(element)) {
          continue;
        }
        seen.add(element);
        const elRect = element.getBoundingClientRect();
        if (elRect.width === 0 || elRect.height === 0) {
          continue;
        }
        if (elRect.width > maxSize || elRect.height > maxSize) {
          continue;
        }
        const style = getComputedStyle(element);
        if (style.cursor !== "pointer") {
          continue;
        }
        const label = getElementLabels(element).join(" ");
        if (/agent|close|remove|delete|cancel|nano banana|x\s*[1-4]/i.test(label)) {
          continue;
        }
        results.push(element);
      }
    }
    container = container.parentElement;
  }

  // Prefer elements furthest to the bottom-right (where send/generate
  // controls conventionally sit next to a prompt composer).
  return results.sort((left, right) => {
    const l = left.getBoundingClientRect();
    const r = right.getBoundingClientRect();
    return r.bottom * 2 + r.right - (l.bottom * 2 + l.right);
  });
}

function findPromptSubmitButton(promptField) {
  let container = promptField.parentElement;
  for (let level = 0; container && level < 8; level += 1) {
    const rect = container.getBoundingClientRect();
    if (rect.width >= 280) {
      const labeledMatch =
        findTextControl(SUBMIT_BUTTON_LABELS, container) || findAction(SUBMIT_BUTTON_LABELS, container);
      if (labeledMatch) {
        return labeledMatch;
      }
    }
    container = container.parentElement;
  }

  // Fallback: old position-based heuristic (closest small, bottom-right button).
  const positional = findActionButtonNearPromptField(promptField, 90, (left, right) => {
    const leftRect = left.getBoundingClientRect();
    const rightRect = right.getBoundingClientRect();
    return rightRect.bottom * 2 + rightRect.right - (leftRect.bottom * 2 + leftRect.right);
  });
  if (positional) {
    return positional;
  }

  // Last resort: any small pointer-cursor element near the composer, even
  // without a button role/tabindex/aria-label. See
  // findPointerCursorCandidatesNear() for why this tier exists.
  return findPointerCursorCandidatesNear(promptField)[0] ?? null;
}

function isPromptSubmitReady(promptField) {
  const submitButton = findPromptSubmitButton(promptField);
  if (!submitButton) {
    return true;
  }
  // Real <button>/[role=button] elements should be focusable (tabIndex >= 0)
  // when enabled; the pointer-cursor fallback tier in
  // findPromptSubmitButton() can return plain divs/spans that are never
  // focusable at all, so we only enforce the tabIndex check for elements
  // that actually claim an interactive role/tag — otherwise a legitimate
  // fallback match would always be reported as "not ready".
  const claimsInteractiveRole = submitButton.matches(INTERACTIVE_SELECTOR);
  const opacity = Number(getComputedStyle(submitButton).opacity);
  return (
    !submitButton.matches(":disabled, [aria-disabled='true'], [data-disabled='true']") &&
    !/\bdisabled\b|\bloading\b/i.test(String(submitButton.className)) &&
    (!claimsInteractiveRole || submitButton.tabIndex >= 0) &&
    getComputedStyle(submitButton).pointerEvents !== "none" &&
    !(Number.isFinite(opacity) && opacity > 0 && opacity < 0.5)
  );
}

// Some Flow UI builds only re-run the "is the prompt/ingredient ready"
// validation on a real input event tied to the composer, not on a passive
// poll of its value. If we filled the prompt/attached the image
// programmatically and the button is still aria-disabled long after both
// look correct on screen, nudging the field (type a space, delete it) often
// forces that validation to re-run.
async function nudgePromptField(promptField) {
  try {
    promptField.focus({ preventScroll: true });
  } catch {
    // ignore
  }
  await delay(120);
  await chrome.runtime.sendMessage({ type: "cdpInsertText", text: " " }).catch(() => { });
  await delay(200);
  await chrome.runtime.sendMessage({ type: "cdpKeyPress", key: "Backspace" }).catch(() => { });
  await delay(200);
}

// Real, trusted click at the button's on-screen coordinates via the Chrome
// DevTools Protocol (same mechanism as our CDP text/key input). Unlike
// element.click()/dispatchEvent(), CDP-dispatched mouse events are
// indistinguishable from a real user click (isTrusted-equivalent), which
// matters if Flow's click handler is ignoring our synthetic clicks even
// though the button reports as enabled.
async function cdpClickElement(element) {
  element.scrollIntoView({ block: "center", inline: "center" });
  await delay(150);
  const rect = element.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  try {
    const response = await chrome.runtime.sendMessage({ type: "cdpClick", x, y });
    return Boolean(response?.ok);
  } catch (error) {
    console.warn("[flow-launcher] cdpClickElement failed:", error);
    return false;
  }
}

async function cdpClickPromptSettingsChip(promptField) {
  const composer = getPromptDropTarget(promptField);
  const composerRect = composer.getBoundingClientRect();
  const submitButton = findPromptSubmitButton(promptField);
  const submitRect = submitButton?.getBoundingClientRect();

  // The settings chip is the wide control immediately to the left of the
  // circular submit arrow. Anchor to the composer's bottom-right corner so
  // prompt height and React's changing div/class names do not matter.
  const x = submitRect
    ? Math.max(composerRect.left + composerRect.width * 0.55, submitRect.left - 80)
    : composerRect.right - 120;
  const y = submitRect
    ? submitRect.top + submitRect.height / 2
    : composerRect.bottom - 28;

  try {
    const response = await chrome.runtime.sendMessage({ type: "cdpClick", x, y });
    console.log("[flow-launcher] composer-relative settings click", {
      x,
      y,
      composer: {
        left: composerRect.left,
        top: composerRect.top,
        right: composerRect.right,
        bottom: composerRect.bottom,
      },
    });
    return Boolean(response?.ok);
  } catch (error) {
    console.warn("[flow-launcher] composer-relative settings click failed:", error);
    return false;
  }
}

// Sends a trusted (CDP-level) Enter keypress to the currently focused
// element. Many chat-style composers (including Flow's newer "Agent" panel)
// submit on Enter regardless of whether we can locate/click their send
// button in the DOM, so this sidesteps button-lookup issues entirely.
async function pressEnterToSubmit(promptField) {
  try {
    promptField.focus({ preventScroll: true });
  } catch {
    // ignore focus errors
  }
  await delay(150);
  try {
    const response = await chrome.runtime.sendMessage({ type: "cdpKeyPress", key: "Enter" });
    return Boolean(response?.ok);
  } catch (error) {
    console.warn("[flow-launcher] pressEnterToSubmit failed:", error);
    return false;
  }
}

// The arrow/send button next to the prompt box that actually kicks off
// generation. We wait until it reports as enabled (not just present) before
// clicking, since Flow disables it while the prompt/ingredient is still
// settling.
async function submitPromptForGeneration(fallbackPromptField) {
  const timeoutAt = Date.now() + UPLOAD_TIMEOUT_MS;
  const startedAt = Date.now();
  let lastLoggedState = "";
  let clickAttempts = 0;
  let enterAttempts = 0;
  let nudgeAttempts = 0;
  let lastNudgeAt = 0;
  const ENTER_FALLBACK_AFTER_MS = 12 * 1000;
  const NUDGE_AFTER_MS = 5 * 1000;
  const NUDGE_INTERVAL_MS = 4 * 1000;

  while (!automationCancelled && Date.now() < timeoutAt) {
    const promptField = getUsablePromptField(fallbackPromptField);
    if (promptField) {
      const submitButton = findPromptSubmitButton(promptField);
      const ready = submitButton ? isPromptSubmitReady(promptField) : false;
      const state = `found=${Boolean(submitButton)} ready=${ready}`;
      if (state !== lastLoggedState) {
        lastLoggedState = state;
        console.log(
          "[flow-launcher] submit: button state ->",
          state,
          submitButton,
          submitButton ? getElementLabels(submitButton).join(" | ") : "",
        );
      }

      if (submitButton && ready) {
        const promptValueBeforeClick = getPromptValue(promptField);
        clickAttempts += 1;

        // The person confirmed pressing Enter manually actually submits —
        // so try that first (via a trusted CDP keypress), twice, before
        // falling back to clicking the button itself.
        let submissionMethod;
        if (clickAttempts <= 2) {
          submissionMethod = "enter";
          console.log(`[flow-launcher] submit: pressing Enter (attempt ${clickAttempts})`);
          await pressEnterToSubmit(promptField);
        } else {
          submissionMethod = clickAttempts <= 4 ? "cdp-click" : "synthetic-click";
          console.log(
            `[flow-launcher] submit: clicking generate button via ${submissionMethod} (attempt ${clickAttempts})`,
            submitButton,
          );
          const clickedViaCdp =
            submissionMethod === "cdp-click" ? await cdpClickElement(submitButton) : false;
          if (!clickedViaCdp) {
            await activateElement(submitButton);
          }
        }
        await delay(1200);

        const fieldAfterClick = getUsablePromptField(promptField);
        const buttonAfterClick = fieldAfterClick ? findPromptSubmitButton(fieldAfterClick) : null;
        const stillReady = buttonAfterClick ? isPromptSubmitReady(fieldAfterClick) : false;
        const promptValueAfterClick = fieldAfterClick
          ? getPromptValue(fieldAfterClick)
          : promptValueBeforeClick;
        const looksSubmitted =
          !stillReady || promptValueAfterClick !== promptValueBeforeClick || !fieldAfterClick;

        console.log("[flow-launcher] submit: post-attempt check ->", {
          submissionMethod,
          stillReady,
          promptChanged: promptValueAfterClick !== promptValueBeforeClick,
          looksSubmitted,
          clickAttempts,
        });

        if (looksSubmitted) {
          return true;
        }

        if (clickAttempts >= 6) {
          // We genuinely don't know if this worked — Enter, CDP click, and
          // synthetic click all produced zero visible change repeatedly.
          // Report failure honestly instead of pretending it sent, so the
          // person knows to check/press it manually.
          console.warn(
            "[flow-launcher] submit: tried Enter + CDP click + synthetic click 6 times with no visible change — giving up honestly",
          );
          return false;
        }
      } else if (
        submitButton &&
        !ready &&
        Date.now() - startedAt >= NUDGE_AFTER_MS &&
        Date.now() - lastNudgeAt >= NUDGE_INTERVAL_MS
      ) {
        // Button exists (confirmed: aria-disabled="true" on the real
        // arrow_forward/"Create" button) but never flips to enabled purely
        // from us polling its value. Nudge the composer with a real
        // keystroke to force Flow's own validation to re-run.
        nudgeAttempts += 1;
        lastNudgeAt = Date.now();
        console.log(`[flow-launcher] submit: nudging prompt field (attempt ${nudgeAttempts})`);
        await nudgePromptField(promptField);
        const readyAfterNudge = isPromptSubmitReady(promptField);
        console.log("[flow-launcher] submit: ready after nudge ->", readyAfterNudge);
      } else if (
        !submitButton &&
        Date.now() - startedAt >= ENTER_FALLBACK_AFTER_MS &&
        enterAttempts < 3 &&
        Date.now() - startedAt - ENTER_FALLBACK_AFTER_MS >= enterAttempts * 4000
      ) {
        // No clickable/ready submit control was found by any DOM heuristic.
        // Try a trusted Enter keypress instead — this works even when the
        // send control is an unlabeled, non-focusable element our scanners
        // can't see (see findPointerCursorCandidatesNear() above).
        enterAttempts += 1;
        console.log(
          `[flow-launcher] submit: no button found, trying Enter keypress fallback (attempt ${enterAttempts})`,
        );
        const promptValueBeforeEnter = getPromptValue(promptField);
        const enterSent = await pressEnterToSubmit(promptField);
        await delay(900);
        const fieldAfterEnter = getUsablePromptField(promptField);
        const promptValueAfterEnter = fieldAfterEnter
          ? getPromptValue(fieldAfterEnter)
          : promptValueBeforeEnter;
        const looksSubmittedViaEnter =
          enterSent && (promptValueAfterEnter !== promptValueBeforeEnter || !fieldAfterEnter);
        console.log("[flow-launcher] submit: Enter fallback result ->", {
          enterSent,
          looksSubmittedViaEnter,
        });
        if (looksSubmittedViaEnter) {
          return true;
        }
      }
    } else {
      console.warn("[flow-launcher] submit: no usable prompt field this pass");
    }
    await delay(300);
  }

  // Final diagnostics: dump what we could see near the composer so this can
  // be diagnosed from the console output instead of guessing blind. Look at
  // these logs (search the console for "[flow-launcher]") and share them —
  // in particular whether findPromptSubmitButton ever returned an element at
  // all ("found=true") and, if so, its tag/class/aria-label.
  const debugField = getUsablePromptField(fallbackPromptField);
  if (debugField) {
    const pointerCandidates = findPointerCursorCandidatesNear(debugField).slice(0, 5);
    console.warn(
      "[flow-launcher] submit: generate button never became ready. Nearby pointer-cursor candidates:",
      pointerCandidates.map((element) => ({
        tag: element.tagName,
        class: element.className,
        ariaLabel: element.getAttribute("aria-label"),
        outerHTML: element.outerHTML.slice(0, 300),
      })),
    );
  } else {
    console.warn(
      "[flow-launcher] submit: generate button never became ready, and no usable prompt field either.",
    );
  }
  return false;
}

async function fillPromptAndVerify(prompt, fallbackPromptField = null) {
  const expectedPrompt = normalizeLabel(prompt);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (automationCancelled) {
      return false;
    }

    const promptField = getUsablePromptField(fallbackPromptField);
    if (!promptField) {
      await delay(PROMPT_VERIFY_DELAY_MS);
      continue;
    }

    if (!getPromptValue(promptField).includes(expectedPrompt)) {
      await fillPrompt(promptField, prompt);
    }
    await delay(PROMPT_VERIFY_DELAY_MS);

    // Only verify the text itself landed in the composer. Whether the send
    // button happens to be enabled yet is a separate concern (Flow can keep
    // it disabled briefly while re-validating a long prompt + attachment)
    // and is already handled — with much more patience — by
    // submitPromptForGeneration() right after this call succeeds.
    if (isPromptPresent(expectedPrompt)) {
      console.log("[flow-launcher] prompt: text verified in composer");
      return true;
    }
  }

  console.warn("[flow-launcher] prompt: text never verified as present after retries");
  return false;
}

async function generateVideoFromLatestImage(
  videoPrompt,
  fallbackPromptField,
  mediaSignaturesBeforeImageGeneration,
  originalImageName,
) {
  showAutomationStatus("กำลังรอ AI สร้างรูปให้เสร็จ…", "working", 52);
  const generatedMedia = await waitForGeneratedImageReady(
    mediaSignaturesBeforeImageGeneration,
    fallbackPromptField,
  );
  if (!generatedMedia || automationCancelled) {
    throw new Error("VIDEO_STAGE:WAIT_IMAGE_RESULT");
  }

  let promptField = getUsablePromptField(fallbackPromptField);
  if (!promptField) {
    throw new Error("VIDEO_STAGE:FIND_PROMPT_BEFORE_ADD");
  }

  showAutomationStatus(
    "รูปพร้อมแล้ว กำลังกด + และนำรูปใหม่เข้า Prompt…",
    "working",
    62,
    WORKFLOW_STAGES.GENERATED_MEDIA,
  );
  await attachLatestGeneratedImage(
    promptField,
    originalImageName,
    generatedMedia.newSignatures,
  );
  // Do not gate the Video phase on DOM verification here. Flow can show the
  // generated image inside the composer while replacing/removing the picker
  // nodes that this function was observing, producing a false failure even
  // though Add to Prompt already succeeded visually.
  await delay(1500);

  showAutomationStatus(
    "กำลังเลือก Video · Frames · 9:16 · Veo 3.1 Lite · 8s · x1…",
    "working",
    68,
    WORKFLOW_STAGES.VIDEO_SETUP,
  );
  const videoSettingsReady = await configureVideoSettings(promptField);
  if (!videoSettingsReady) {
    throw new Error("VIDEO_STAGE:CONFIGURE_SETTINGS");
  }

  promptField = await waitForUsablePromptField(promptField);
  if (!promptField) {
    throw new Error("VIDEO_STAGE:FIND_VIDEO_PROMPT_FIELD");
  }
  await delay(750);
  showAutomationStatus(
    "กำลังใส่ Video Prompt…",
    "working",
    84,
    WORKFLOW_STAGES.VIDEO_PROMPT,
  );
  const videoPromptReady = await fillPromptAndVerify(videoPrompt, promptField);
  if (!videoPromptReady) {
    throw new Error("VIDEO_STAGE:FILL_VIDEO_PROMPT");
  }

  showAutomationStatus(
    "กำลังกด Enter เพื่อเริ่มสร้างวิดีโอ…",
    "working",
    94,
    WORKFLOW_STAGES.VIDEO_GENERATION,
  );
  return submitPromptForGeneration(promptField);
}

function showAutomationStatus(
  message,
  state = "working",
  progress = null,
  stage = null,
) {
  const workflowSnapshot = workflowState.update(message, state, progress, stage);
  let toast = document.querySelector("#flow-launcher-status");

  if (!toast) {
    toast = document.createElement("div");
    toast.id = "flow-launcher-status";
    Object.assign(toast.style, {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      zIndex: "2147483647",
      width: "min(420px, calc(100vw - 40px))",
      padding: "20px 24px",
      border: "1px solid rgba(255, 255, 255, 0.16)",
      borderRadius: "16px",
      color: "#fff",
      background: "#1f2937",
      boxShadow: "0 20px 60px rgba(0, 0, 0, 0.45)",
      font: "600 16px/1.5 system-ui, sans-serif",
      textAlign: "center",
    });

    const messageElement = document.createElement("div");
    messageElement.id = "flow-launcher-status-message";

    const progressMeta = document.createElement("div");
    progressMeta.id = "flow-launcher-progress-meta";
    Object.assign(progressMeta.style, {
      display: "flex",
      marginTop: "14px",
      alignItems: "center",
      justifyContent: "space-between",
      color: "rgba(255, 255, 255, 0.78)",
      font: "600 12px/1.2 system-ui, sans-serif",
    });
    const progressLabel = document.createElement("span");
    progressLabel.textContent = "ความคืบหน้า";
    const progressValue = document.createElement("span");
    progressValue.id = "flow-launcher-progress-value";
    progressMeta.append(progressLabel, progressValue);

    const progressTrack = document.createElement("div");
    progressTrack.id = "flow-launcher-progress-track";
    Object.assign(progressTrack.style, {
      height: "8px",
      marginTop: "7px",
      overflow: "hidden",
      borderRadius: "999px",
      background: "rgba(255, 255, 255, 0.16)",
    });
    const progressBar = document.createElement("div");
    progressBar.id = "flow-launcher-progress-bar";
    Object.assign(progressBar.style, {
      width: "0%",
      height: "100%",
      borderRadius: "inherit",
      background: "linear-gradient(90deg, #a78bfa, #60a5fa)",
      transition: "width 500ms ease",
    });
    progressTrack.append(progressBar);

    const buildElement = document.createElement("div");
    buildElement.textContent = `Flow Launcher v${AUTOMATION_BUILD}`;
    Object.assign(buildElement.style, {
      marginBottom: "8px",
      color: "rgba(255, 255, 255, 0.62)",
      font: "500 11px/1.2 system-ui, sans-serif",
      letterSpacing: "0.03em",
    });

    const cancelButton = document.createElement("button");
    cancelButton.id = "flow-launcher-cancel";
    cancelButton.type = "button";
    cancelButton.textContent = "ยกเลิกการทำงาน";
    Object.assign(cancelButton.style, {
      display: "block",
      width: "100%",
      marginTop: "14px",
      padding: "10px 14px",
      border: "1px solid rgba(254, 202, 202, 0.42)",
      borderRadius: "10px",
      color: "#fee2e2",
      background: "rgba(127, 29, 29, 0.72)",
      font: "600 14px/1.4 system-ui, sans-serif",
      cursor: "pointer",
    });
    cancelButton.addEventListener("click", async () => {
      if (automationCancelled) {
        return;
      }

      automationCancelled = true;
      cancelButton.disabled = true;
      messageElement.textContent = "กำลังยกเลิก…";
      await chrome.runtime.sendMessage({ type: "cancelFlowAutomation" }).catch(() => { });
      messageElement.textContent = "ยกเลิกการทำงานแล้ว";
      cancelButton.hidden = true;
      cancelButton.style.display = "none";
      setTimeout(() => toast.remove(), 2500);
    });

    toast.append(buildElement, messageElement, progressMeta, progressTrack, cancelButton);
    document.documentElement.append(toast);
  }

  toast.querySelector("#flow-launcher-status-message").textContent = message;
  toast.querySelector("#flow-launcher-progress-value").textContent = `${workflowSnapshot.progress}%`;
  toast.querySelector("#flow-launcher-progress-bar").style.width = `${workflowSnapshot.progress}%`;
  const cancelButton = toast.querySelector("#flow-launcher-cancel");
  cancelButton.hidden = state !== "working" || automationCancelled;
  cancelButton.style.display = cancelButton.hidden ? "none" : "block";
  cancelButton.disabled = automationCancelled;
  toast.style.background = state === "error" ? "#991b1b" : "#1f2937";

  void chrome.runtime.sendMessage({
    type: "flowAutomationStatus",
    status: state,
    detail: message,
    progress: workflowSnapshot.progress,
    stage: workflowSnapshot.stage,
  }).catch(() => { });
}

async function finishAutomation(status, detail) {
  await chrome.runtime.sendMessage({
    type: "flowAutomationFinished",
    status,
    detail,
  });
}

async function automateProjectCreation() {
  const response = await chrome.runtime.sendMessage({ type: "flowPageReady" });
  if (!response?.createProject || !response.jobId) {
    return;
  }

  const jobKey = `flowJob:${response.jobId}`;
  const stored = await chrome.storage.local.get(jobKey);
  const job = stored[jobKey];
  if (!job?.image?.dataUrl || !job?.prompt || !job?.videoPrompt) {
    throw new Error("Flow automation data is incomplete");
  }
  workflowState.reset();
  const requestedOutputCount = Number(job.outputCount);
  const outputCount = [1, 2, 3, 4].includes(requestedOutputCount)
    ? requestedOutputCount
    : 1;

  showAutomationStatus(
    "กำลังค้นหาปุ่ม + New project…",
    "working",
    3,
    WORKFLOW_STAGES.PROJECT_SETUP,
  );
  const startedAt = Date.now();
  let clickedEnterFlow = false;
  let clickedNewProject = false;
  let editorSeenAt = 0;
  let settingsConfigured = false;
  let imageAttached = false;
  let lastUploadActionAt = 0;
  let triedPickerUpload = false;

  while (!automationCancelled && Date.now() - startedAt < AUTOMATION_TIMEOUT_MS) {
    const newProjectButton = findAction(NEW_PROJECT_LABELS);
    if (!clickedNewProject && newProjectButton) {
      clickedNewProject = true;
      await activateElement(newProjectButton);
      showAutomationStatus("สร้างโปรเจกต์แล้ว รอหน้าโหลดให้พร้อม…", "working", 8);
      await delay(PROJECT_SETTLE_DELAY_MS);
      continue;
    }

    const promptField = findPromptField();
    if (promptField) {
      if (!editorSeenAt) {
        editorSeenAt = Date.now();
        showAutomationStatus("พบหน้าโปรเจกต์แล้ว รอระบบนิ่งสักครู่…", "working", 12);
      }

      const remainingSettleTime = PROJECT_SETTLE_DELAY_MS - (Date.now() - editorSeenAt);
      if (remainingSettleTime > 0) {
        await delay(Math.min(remainingSettleTime, RETRY_INTERVAL_MS));
        continue;
      }

      if (!settingsConfigured) {
        showAutomationStatus(
          `กำลังเลือก Image · 9:16 · Nano Banana 2 · x${outputCount}…`,
          "working",
          18,
          WORKFLOW_STAGES.IMAGE_SETUP,
        );
        settingsConfigured = await configureImageSettings(outputCount);
        if (!settingsConfigured) {
          await delay(RETRY_INTERVAL_MS);
          continue;
        }
        showAutomationStatus(
          "ตั้งค่าภาพเรียบร้อย กำลังเตรียมอัปโหลด…",
          "working",
          25,
          WORKFLOW_STAGES.SOURCE_MEDIA,
        );
        await delay(750);
      }

      if (!imageAttached && !triedPickerUpload) {
        triedPickerUpload = true;
        showAutomationStatus("กำลังกด + เพื่อเปิดคลังสื่อและอัปโหลดรูป…", "working", 30);
        const promptViaPicker = await attachImageViaAddToPrompt(promptField, job.image);

        if (promptViaPicker) {
          imageAttached = true;
          showAutomationStatus("เพิ่ม Ingredient แล้ว รอช่อง Prompt ให้พร้อม…", "working", 36);
          await delay(1000);
          showAutomationStatus(
            "กำลังใส่และตรวจสอบ Image Prompt…",
            "working",
            41,
            WORKFLOW_STAGES.IMAGE_PROMPT,
          );
          const promptWasFilled = await fillPromptAndVerify(job.prompt, promptViaPicker);
          if (!promptWasFilled) {
            throw new Error("Image prompt did not remain in the prompt field");
          }
          const mediaBeforeImageGeneration = getWorkspaceMediaSignatures(promptViaPicker);
          showAutomationStatus(
            "กำลังกด Enter เพื่อเริ่มสร้างรูป…",
            "working",
            47,
            WORKFLOW_STAGES.IMAGE_GENERATION,
          );
          const submitted = await submitPromptForGeneration(promptViaPicker);
          if (!submitted) {
            throw new Error("Could not start image generation");
          }
          const videoSubmitted = await generateVideoFromLatestImage(
            job.videoPrompt,
            promptViaPicker,
            mediaBeforeImageGeneration,
            job.image.name,
          );
          if (!videoSubmitted) {
            throw new Error("Could not complete image-to-video generation");
          }
          showAutomationStatus(
            `สร้างรูป x${outputCount} แล้ว และเริ่มสร้างวิดีโอ Veo 3.1 Lite · 8s · x1 แล้ว`,
            "success",
            100,
          );
          await finishAutomation(
            "prepared",
            `สร้างรูป x${outputCount} แล้ว และเริ่มสร้างวิดีโอ 9:16 · Veo 3.1 Lite · 8s · x1 แล้ว`,
          );
          setTimeout(() => document.querySelector("#flow-launcher-status")?.remove(), 5000);
          return;
        }

        if (!automationCancelled) {
          showAutomationStatus("วิธี + ไม่สำเร็จ กำลังลองอัปโหลดโดยตรงแทน…");
        }
      }

      if (!imageAttached) {
        const fileInput = findImageFileInput();
        if (fileInput) {
          const promptStateBeforeUpload = capturePromptState(promptField);
          attachImage(fileInput, job.image);
          imageAttached = true;
          showAutomationStatus("กำลังอัปโหลดรูปภาพ กรุณารอสักครู่…", "working", 32);

          const uploadOutcome = await waitForUploadOutcome(
            job.image.name,
            promptStateBeforeUpload,
            promptField,
          );
          if (!uploadOutcome) {
            throw new Error("Uploaded image or ingredient did not become ready");
          }

          let promptAfterIngredient;
          if (uploadOutcome.type === "ingredient") {
            showAutomationStatus("รูปเข้า Prompt แล้ว รอช่องข้อความให้พร้อม…", "working", 36);
            await delay(INGREDIENT_SETTLE_DELAY_MS);
            promptAfterIngredient =
              uploadOutcome.promptField || getUsablePromptField(promptField);
          } else {
            showAutomationStatus("อัปโหลดเสร็จแล้ว กำลังกด + เพื่อเลือก Add to Prompt…", "working", 35);
            promptAfterIngredient = await addAssetAsIngredient(
              job.image.name,
              findPromptField() || promptField,
            );
          }

          if (!promptAfterIngredient) {
            throw new Error("Could not add uploaded image as an ingredient");
          }

          showAutomationStatus("เพิ่ม Ingredient แล้ว รอช่อง Prompt ให้พร้อม…", "working", 38);
          await delay(1000);
          showAutomationStatus(
            "กำลังใส่และตรวจสอบ Image Prompt…",
            "working",
            42,
            WORKFLOW_STAGES.IMAGE_PROMPT,
          );
          const promptWasFilled = await fillPromptAndVerify(
            job.prompt,
            promptAfterIngredient,
          );
          if (!promptWasFilled) {
            throw new Error("Image prompt did not remain in the prompt field");
          }
          const mediaBeforeImageGeneration = getWorkspaceMediaSignatures(
            promptAfterIngredient,
          );
          showAutomationStatus(
            "กำลังกด Enter เพื่อเริ่มสร้างรูป…",
            "working",
            47,
            WORKFLOW_STAGES.IMAGE_GENERATION,
          );
          const submitted = await submitPromptForGeneration(promptAfterIngredient);
          if (!submitted) {
            throw new Error("Could not start image generation");
          }
          const videoSubmitted = await generateVideoFromLatestImage(
            job.videoPrompt,
            promptAfterIngredient,
            mediaBeforeImageGeneration,
            job.image.name,
          );
          if (!videoSubmitted) {
            throw new Error("Could not complete image-to-video generation");
          }
          showAutomationStatus(
            `สร้างรูป x${outputCount} แล้ว และเริ่มสร้างวิดีโอ Veo 3.1 Lite · 8s · x1 แล้ว`,
            "success",
            100,
          );
          await finishAutomation(
            "prepared",
            `สร้างรูป x${outputCount} แล้ว และเริ่มสร้างวิดีโอ 9:16 · Veo 3.1 Lite · 8s · x1 แล้ว`,
          );
          setTimeout(() => document.querySelector("#flow-launcher-status")?.remove(), 5000);
          return;
        }

        if (Date.now() - lastUploadActionAt >= 1500) {
          const uploadAction =
            findAction(DIRECT_UPLOAD_LABELS) ||
            findNearbyAction(promptField, ADD_REFERENCE_LABELS);
          if (uploadAction) {
            await activateElement(uploadAction);
            lastUploadActionAt = Date.now();
            showAutomationStatus("กำลังเปิดช่องแนบรูปภาพ…");
          }
        }
      }
    }

    if (!clickedEnterFlow) {
      const enterFlowButton = findAction(ENTER_FLOW_LABELS);
      if (enterFlowButton) {
        clickedEnterFlow = true;
        showAutomationStatus("กำลังเข้าสู่ Google Flow…");
        await activateElement(enterFlowButton);
      }
    }

    await delay(RETRY_INTERVAL_MS);
  }

  if (automationCancelled) {
    return;
  }

  const detail = "ใส่รูปหรือ Prompt ไม่สำเร็จ กรุณาทำต่อใน Flow";
  showAutomationStatus(detail, "error");
  await finishAutomation("failed", detail);
}

function getFailureDetail(error) {
  const message = String(error?.message ?? error);
  const videoStage = message.match(/VIDEO_STAGE:([A-Z0-9_]+)/)?.[1];
  if (videoStage) {
    return `ขั้นตอน Video หยุดที่ [${videoStage}] กรุณาส่งรหัสนี้มาเพื่อตรวจจุดที่ผิด`;
  }
  if (/image-to-video/i.test(message)) {
    return "สร้างรูปแล้ว แต่ขั้นตอนเลือกรูปหรือตั้งค่า Video ไม่สำเร็จ กรุณาทำต่อใน Flow";
  }
  if (/start image generation/i.test(message)) {
    return "ใส่ Image Prompt แล้ว แต่เริ่มสร้างรูปไม่สำเร็จ กรุณากดส่งใน Flow";
  }
  if (/uploaded image/i.test(message)) {
    return "อัปโหลดรูปแล้ว แต่ยังไม่พบ asset ที่พร้อมใช้งาน กรุณาทำต่อใน Flow";
  }
  if (/ingredient/i.test(message)) {
    return "อัปโหลดรูปแล้ว แต่ตรวจไม่พบ Ingredient ในช่อง Prompt";
  }
  if (/image prompt/i.test(message)) {
    return "เพิ่ม Ingredient แล้ว แต่ตรวจสอบข้อความ Prompt ไม่สำเร็จ";
  }
  if (/generate button/i.test(message)) {
    return "ใส่ Prompt สำเร็จ แต่กดปุ่มเริ่มสร้างไม่สำเร็จ กรุณากดเองใน Flow";
  }
  return "ระบบเตรียมรูปและ Prompt ขัดข้อง กรุณาทำต่อใน Flow";
}

void automateProjectCreation().catch(async (error) => {
  if (automationCancelled) {
    return;
  }
  console.error("Flow project automation failed:", error);
  const detail = getFailureDetail(error);
  showAutomationStatus(detail, "error");
  await finishAutomation("failed", detail).catch(() => { });
});
