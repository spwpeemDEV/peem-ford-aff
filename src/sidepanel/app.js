const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024;

const versionLabel = document.querySelector("#versionLabel");
const startButton = document.querySelector("#startPrompt");
const status = document.querySelector("#status");
const statusCard = document.querySelector("#statusCard");
const statusPercent = document.querySelector("#statusPercent");
const statusProgress = document.querySelector("#statusProgress");
const productList = document.querySelector("#productList");
const productTemplate = document.querySelector("#productTemplate");
const addProductButton = document.querySelector("#addProduct");
const productCount = document.querySelector("#productCount");
const loopCount = document.querySelector("#loopCount");
const jobSummary = document.querySelector("#jobSummary");
const cancelButton = document.querySelector("#cancelAutomation");
const syncTiktokBtn = document.querySelector("#syncTiktokBtn");
const cancelSyncBtn = document.querySelector("#cancelSyncBtn");
const clearSyncBtn = document.querySelector("#clearSyncBtn");
const syncMaxPages = document.querySelector("#syncMaxPages");
const tiktokIdOutput = document.querySelector("#tiktokIdOutput");
const tiktokSyncStatus = document.querySelector("#tiktokSyncStatus");
const productResultCount = document.querySelector("#productResultCount");
const productSearchField = document.querySelector("#productSearchField");
const syncedProductSearch = document.querySelector("#syncedProductSearch");
const productSyncCard = document.querySelector("#productSyncCard");
const panelTabs = [...document.querySelectorAll("[data-panel-target]")];
const panelPages = [...document.querySelectorAll("[data-panel-page]")];
const backToCreationButton = document.querySelector("#backToCreation");
const basketVideoInput = document.querySelector("#basketVideoInput");
const basketVideoFileName = document.querySelector("#basketVideoFileName");
const basketVideoFileMeta = document.querySelector("#basketVideoFileMeta");
const basketCaption = document.querySelector("#basketCaption");
const basketCaptionCount = document.querySelector("#basketCaptionCount");
const basketStatus = document.querySelector("#basketStatus");
const startBasketFlowButton = document.querySelector("#startBasketFlow");
const chooseSyncedProductButton = document.querySelector("#chooseSyncedProduct");
const selectedProductCard = document.querySelector("#selectedProductCard");
const selectedProductImage = document.querySelector("#selectedProductImage");
const selectedProductName = document.querySelector("#selectedProductName");
const selectedProductId = document.querySelector("#selectedProductId");
const changeSelectedProductButton = document.querySelector("#changeSelectedProduct");
const basketBundleProgress = document.querySelector("#basketBundleProgress");
const bundleVideoValue = document.querySelector("#bundleVideoValue");
const bundleCaptionValue = document.querySelector("#bundleCaptionValue");
const bundleProductValue = document.querySelector("#bundleProductValue");
const bundleTimingValue = document.querySelector("#bundleTimingValue");
const basketPublishModeInputs = [...document.querySelectorAll('input[name="basketPublishMode"]')];
const basketScheduleField = document.querySelector("#basketScheduleField");
const basketScheduleAt = document.querySelector("#basketScheduleAt");
const basketIntervalMinutes = document.querySelector("#basketIntervalMinutes");
const basketBundleRows = [...document.querySelectorAll("[data-bundle-item]")];
const addBasketQueueItemButton = document.querySelector("#addBasketQueueItem");
const startBasketQueueButton = document.querySelector("#startBasketQueue");
const basketQueueList = document.querySelector("#basketQueueList");
const basketQueueCount = document.querySelector("#basketQueueCount");

let activeTabId = null;
let nextProductId = 1;
const previewUrls = new Map();
const MAX_PRODUCTS = 10;
let stagedBasketVideo = null;
let syncedProducts = [];
let selectedBasketProduct = null;
let basketFlowRunning = false;
let basketQueue = [];
let nextBasketQueueId = 1;

versionLabel.textContent = `v${chrome.runtime.getManifest().version}`;

function showPanelPage(pageId, { updateHash = true } = {}) {
  const targetPage = panelPages.find((page) => page.id === pageId);
  if (!targetPage) {
    return;
  }

  for (const page of panelPages) {
    const active = page === targetPage;
    page.hidden = !active;
    page.classList.toggle("is-active", active);
  }

  for (const tab of panelTabs) {
    const active = tab.dataset.panelTarget === pageId;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  }

  if (updateHash) {
    history.replaceState(null, "", pageId === "basketPage" ? "#basket" : "#create");
  }
  document.querySelector(".panel")?.scrollTo({ top: 0, behavior: "smooth" });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

for (const tab of panelTabs) {
  tab.addEventListener("click", () => showPanelPage(tab.dataset.panelTarget));
}

backToCreationButton?.addEventListener("click", () => {
  showPanelPage("creationPage");
});

showPanelPage(location.hash === "#basket" ? "basketPage" : "creationPage", {
  updateHash: false,
});

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 MB";
  }
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 1 : 2)} MB`;
}

function sanitizeUploadFilename(filename) {
  const safeName = String(filename || "video.mp4")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(-120);
  return safeName || "video.mp4";
}

function waitForDownloadComplete(downloadId, timeoutMs = 15 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    let timeoutId;
    const cleanup = () => {
      clearTimeout(timeoutId);
      chrome.downloads.onChanged.removeListener(onChanged);
    };
    const onChanged = (delta) => {
      if (delta.id !== downloadId || !delta.state?.current) return;
      if (delta.state.current === "complete") {
        cleanup();
        resolve();
      } else if (delta.state.current === "interrupted") {
        cleanup();
        reject(new Error(delta.error?.current || "คัดลอกวิดีโอไม่สำเร็จ"));
      }
    };
    chrome.downloads.onChanged.addListener(onChanged);
    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error("หมดเวลารอเตรียมไฟล์วิดีโอ"));
    }, timeoutMs);
  });
}

async function stageBasketVideo(file) {
  const fingerprint = `${file.name}:${file.size}:${file.lastModified}`;
  if (stagedBasketVideo?.fingerprint === fingerprint) {
    const [existingDownload] = await chrome.downloads.search({
      id: stagedBasketVideo.downloadId,
    });
    if (existingDownload?.state === "complete" && existingDownload.filename) {
      return stagedBasketVideo;
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const relativeFilename =
      `FlowLauncher/temp/tiktok-${Date.now()}-${sanitizeUploadFilename(file.name)}`;
    const downloadId = await chrome.downloads.download({
      url: objectUrl,
      filename: relativeFilename,
      conflictAction: "uniquify",
      saveAs: false,
    });
    await waitForDownloadComplete(downloadId);
    const [downloadItem] = await chrome.downloads.search({ id: downloadId });
    if (!downloadItem?.filename || downloadItem.state !== "complete") {
      throw new Error("ไม่พบไฟล์วิดีโอชั่วคราวที่เตรียมไว้");
    }
    stagedBasketVideo = {
      fingerprint,
      downloadId,
      localPath: downloadItem.filename,
      originalName: file.name,
    };
    return stagedBasketVideo;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function normalizeSyncedProduct(product) {
  const id = String(product?.id || "").trim();
  if (!id) return null;
  const rawName = String(product?.name || "").trim();
  const name = rawName.replace(id, "").trim() || `สินค้า ${id}`;
  return {
    id,
    name,
    imgUrl: String(product?.imgUrl || "").trim(),
  };
}

function countHashtags(value) {
  return (String(value || "").match(/(^|\s)#[^\s#]+/g) || []).length;
}

function getBasketPublishMode() {
  return basketPublishModeInputs.find((input) => input.checked)?.value || "now";
}

function toLocalDateTimeInputValue(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getScheduleTimestamp() {
  if (getBasketPublishMode() !== "schedule" || !basketScheduleAt?.value) return NaN;
  return new Date(basketScheduleAt.value).getTime();
}

function scheduleIsValid() {
  if (getBasketPublishMode() === "now") return true;
  const minuteMatch = basketScheduleAt?.value.match(/T\d{2}:(\d{2})/);
  const minute = Number(minuteMatch?.[1]);
  return getScheduleTimestamp() > Date.now() && Number.isInteger(minute) && minute % 5 === 0;
}

function getBasketIntervalMinutes() {
  return Number(basketIntervalMinutes?.value);
}

function basketIntervalIsValid() {
  if (getBasketPublishMode() !== "schedule") return true;
  const minutes = getBasketIntervalMinutes();
  return Number.isInteger(minutes) && minutes >= 5 && minutes % 5 === 0;
}

function updatePostTimeUi({ setDefault = false } = {}) {
  const mode = getBasketPublishMode();
  for (const input of basketPublishModeInputs) {
    input.closest(".post-time-option")?.classList.toggle("is-selected", input.checked);
  }
  basketScheduleField.hidden = mode !== "schedule";
  basketScheduleAt.required = mode === "schedule";
  if (mode === "schedule" && setDefault && !basketScheduleAt.value) {
    const defaultTime = new Date(Date.now() + 30 * 60 * 1000);
    defaultTime.setMinutes(Math.ceil(defaultTime.getMinutes() / 5) * 5, 0, 0);
    basketScheduleAt.value = toLocalDateTimeInputValue(defaultTime);
  }
  updateBasketBundle();
}

function getQueueScheduleValue(index) {
  if (getBasketPublishMode() !== "schedule") return "";
  const timestamp = getScheduleTimestamp() + index * getBasketIntervalMinutes() * 60 * 1000;
  return toLocalDateTimeInputValue(new Date(timestamp));
}

function renderBasketQueue() {
  basketQueueList.replaceChildren();
  basketQueue.forEach((item, index) => {
    const row = document.createElement("article");
    row.className = "basket-queue-item";
    row.dataset.queueId = String(item.id);
    row.dataset.state = item.state || "pending";
    const copy = document.createElement("span");
    copy.className = "basket-queue-copy";
    const title = document.createElement("strong");
    title.textContent = `${index + 1}. ${item.file.name}`;
    const detail = document.createElement("small");
    const scheduleText = getBasketPublishMode() === "schedule"
      ? new Date(getScheduleTimestamp() + index * getBasketIntervalMinutes() * 60 * 1000)
        .toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })
      : "โพสต์ทันที";
    detail.textContent = `${item.product.name} · ${scheduleText}${item.stateText ? ` · ${item.stateText}` : ""}`;
    copy.append(title, detail);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "basket-queue-remove";
    remove.textContent = "×";
    remove.title = "นำออกจากคิว";
    remove.disabled = basketFlowRunning;
    remove.addEventListener("click", () => {
      basketQueue = basketQueue.filter((entry) => entry.id !== item.id);
      updateBasketBundle();
    });
    row.append(copy, remove);
    basketQueueList.appendChild(row);
  });
  basketQueueCount.textContent = `${basketQueue.length} คลิป`;
  startBasketQueueButton.disabled =
    basketFlowRunning || !basketQueue.length || !scheduleIsValid() || !basketIntervalIsValid();
  startBasketQueueButton.dataset.running = String(basketFlowRunning);
}

function scrollToProductPicker() {
  productSyncCard?.scrollIntoView({ behavior: "smooth", block: "start" });
  window.setTimeout(() => {
    if (syncedProducts.length) {
      syncedProductSearch?.focus();
    } else {
      syncTiktokBtn?.focus();
    }
  }, 250);
}

function updateBasketBundle() {
  const file = basketVideoInput?.files?.[0] || null;
  const caption = basketCaption?.value.trim() || "";
  const publishMode = getBasketPublishMode();
  const timingReady = scheduleIsValid() && basketIntervalIsValid();
  const completed = [
    Boolean(file),
    Boolean(caption),
    Boolean(selectedBasketProduct),
    timingReady,
  ];

  bundleVideoValue.textContent = file
    ? `${file.name} · ${formatFileSize(file.size)}`
    : "ยังไม่ได้เลือก";
  bundleCaptionValue.textContent = caption
    ? `${caption.length} ตัวอักษร · ${countHashtags(caption)} แฮชแท็ก`
    : "ยังไม่ได้กรอก";
  bundleProductValue.textContent = selectedBasketProduct
    ? `${selectedBasketProduct.name} · ID ${selectedBasketProduct.id}`
    : "ยังไม่ได้เลือก Product ID";
  bundleTimingValue.textContent = publishMode === "now"
    ? "โพสต์ทันที"
    : timingReady
      ? `ตั้งเวลา ${new Date(getScheduleTimestamp()).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}`
      : "เลือกเวลาอนาคต โดยนาทีต้องลงท้าย 00, 05, 10…";

  basketBundleRows.forEach((row, index) => {
    const complete = completed[index];
    row.classList.toggle("is-complete", complete);
    const check = row.querySelector(".bundle-check");
    if (check) check.textContent = complete ? "✓" : String(index + 1);
  });

  const completeCount = completed.filter(Boolean).length;
  basketBundleProgress.textContent = `${completeCount} / 4`;
  basketBundleProgress.classList.toggle("is-complete", completeCount === 4);
  startBasketFlowButton.disabled = basketFlowRunning || completeCount !== 4;
  startBasketFlowButton.dataset.running = String(basketFlowRunning);
  addBasketQueueItemButton.disabled = basketFlowRunning || completeCount !== 4;
  renderBasketQueue();
}

function updateSelectedProductCard() {
  if (!selectedBasketProduct) {
    selectedProductCard.hidden = true;
    chooseSyncedProductButton.hidden = false;
    updateBasketBundle();
    return;
  }

  selectedProductImage.src = selectedBasketProduct.imgUrl;
  selectedProductImage.alt = selectedBasketProduct.name;
  selectedProductName.textContent = selectedBasketProduct.name;
  selectedProductId.textContent = `Product ID: ${selectedBasketProduct.id}`;
  chooseSyncedProductButton.hidden = true;
  selectedProductCard.hidden = false;
  updateBasketBundle();
}

function selectSyncedProduct(productId) {
  selectedBasketProduct = syncedProducts.find((product) => product.id === productId) || null;
  updateSelectedProductCard();
  renderSyncedProducts();
  if (selectedBasketProduct) {
    basketStatus.textContent = `เลือก ${selectedBasketProduct.name} แล้ว ชุดงานนี้จะใช้ Product ID ${selectedBasketProduct.id}`;
    basketStatus.dataset.state = "ready";
  }
}

function renderSyncedProducts() {
  const query = syncedProductSearch?.value.trim().toLocaleLowerCase("th") || "";
  const visibleProducts = syncedProducts.filter((product) =>
    `${product.name} ${product.id}`.toLocaleLowerCase("th").includes(query),
  );

  tiktokIdOutput.replaceChildren();
  for (const product of visibleProducts) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "synced-product-item";
    item.dataset.productId = product.id;
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", String(selectedBasketProduct?.id === product.id));
    item.classList.toggle("is-selected", selectedBasketProduct?.id === product.id);

    const image = document.createElement("img");
    image.src = product.imgUrl;
    image.alt = "";

    const copy = document.createElement("span");
    copy.className = "synced-product-copy";
    const name = document.createElement("strong");
    name.textContent = product.name;
    name.title = product.name;
    const id = document.createElement("small");
    id.textContent = `Product ID: ${product.id}`;
    copy.append(name, id);

    const indicator = document.createElement("span");
    indicator.className = "synced-product-indicator";
    indicator.textContent = selectedBasketProduct?.id === product.id ? "✓" : "เลือก";
    item.append(image, copy, indicator);
    item.addEventListener("click", () => selectSyncedProduct(product.id));
    tiktokIdOutput.appendChild(item);
  }

  if (!visibleProducts.length && syncedProducts.length) {
    const empty = document.createElement("p");
    empty.className = "synced-products-empty";
    empty.textContent = "ไม่พบสินค้าที่ตรงกับคำค้น";
    tiktokIdOutput.appendChild(empty);
  }

  productResultCount.textContent = `${syncedProducts.length} สินค้า`;
  const hasProducts = syncedProducts.length > 0;
  productSearchField.hidden = !hasProducts;
  tiktokIdOutput.hidden = !hasProducts;
}

function resetSyncedProducts() {
  syncedProducts = [];
  selectedBasketProduct = null;
  if (syncedProductSearch) syncedProductSearch.value = "";
  renderSyncedProducts();
  updateSelectedProductCard();
}

syncedProductSearch?.addEventListener("input", renderSyncedProducts);
chooseSyncedProductButton?.addEventListener("click", scrollToProductPicker);
changeSelectedProductButton?.addEventListener("click", scrollToProductPicker);
for (const input of basketPublishModeInputs) {
  input.addEventListener("change", () => updatePostTimeUi({ setDefault: true }));
}
basketScheduleAt?.addEventListener("input", updateBasketBundle);
basketIntervalMinutes?.addEventListener("input", updateBasketBundle);

basketVideoInput?.addEventListener("change", () => {
  const file = basketVideoInput.files?.[0];
  stagedBasketVideo = null;
  if (!file) {
    basketVideoFileName.textContent = "เลือกวิดีโอ";
    basketVideoFileMeta.textContent = "คลิกเพื่อเลือกไฟล์ที่ต้องการโพสต์";
    updateBasketBundle();
    return;
  }
  basketVideoFileName.textContent = file.name;
  basketVideoFileMeta.textContent = `${formatFileSize(file.size)} · ${file.type || "วิดีโอ"}`;
  basketStatus.textContent = "เลือกวิดีโอแล้ว กรุณาใส่ข้อความและเลือกสินค้าที่จะผูก";
  basketStatus.dataset.state = "ready";
  updateBasketBundle();
});

basketCaption?.addEventListener("input", () => {
  basketCaptionCount.textContent = `${basketCaption.value.length} / 4000`;
  updateBasketBundle();
});

addBasketQueueItemButton?.addEventListener("click", () => {
  const file = basketVideoInput?.files?.[0] || null;
  const caption = basketCaption?.value.trim() || "";
  if (!file || !caption || !selectedBasketProduct) {
    basketStatus.textContent = "กรุณาเตรียมวิดีโอ ข้อความ และสินค้าให้ครบก่อนเพิ่มลงคิว";
    basketStatus.dataset.state = "error";
    return;
  }
  if (!scheduleIsValid() || !basketIntervalIsValid()) {
    basketStatus.textContent = "กรุณาตรวจสอบเวลาเริ่มต้นและระยะห่างของแต่ละคลิป";
    basketStatus.dataset.state = "error";
    return;
  }

  basketQueue.push({
    id: nextBasketQueueId++,
    file,
    caption,
    product: { ...selectedBasketProduct },
    state: "pending",
    stateText: "รอดำเนินการ",
  });
  stagedBasketVideo = null;
  basketVideoInput.value = "";
  basketCaption.value = "";
  basketCaptionCount.textContent = "0 / 4000";
  selectedBasketProduct = null;
  basketVideoFileName.textContent = "เลือกวิดีโอถัดไป";
  basketVideoFileMeta.textContent = "คลิกเพื่อเพิ่มคลิปใหม่เข้าคิว";
  updateSelectedProductCard();
  renderSyncedProducts();
  basketStatus.textContent = `เพิ่มคลิปที่ ${basketQueue.length} ลงคิวแล้ว`;
  basketStatus.dataset.state = "success";
  updateBasketBundle();
});

function basketFlowErrorMessage(response) {
  if (response?.stage === "validation") {
    return `การตรวจสอบหรือการโพสต์ไม่สำเร็จ: ${response.error}`;
  }
  if (response?.stage === "ai-label") {
    return `เปิดป้ายเนื้อหาที่สร้างโดย AI ไม่สำเร็จ: ${response.error}`;
  }
  if (response?.stage === "post-time") {
    return `ตั้งค่าเวลาโพสต์ไม่สำเร็จ: ${response.error}`;
  }
  if (response?.stage === "product-link") {
    return `ผูกสินค้าไม่สำเร็จ: ${response.error}`;
  }
  if (response?.stage === "caption") {
    return `ใส่ข้อความและแฮชแท็กไม่สำเร็จ: ${response.error}`;
  }
  return response?.error || "ดำเนินการใน TikTok Studio ไม่สำเร็จ";
}

async function runBasketQueueItem(
  item,
  scheduledAt,
  queueIndex,
  queueTotal,
  queueStartedAt,
  tiktokTabId,
) {
  const stagedVideo = await stageBasketVideo(item.file);
  const response = await chrome.runtime.sendMessage({
    type: "uploadVideoToTikTokStudio",
    localPath: stagedVideo.localPath,
    downloadId: stagedVideo.downloadId,
    originalName: stagedVideo.originalName,
    caption: item.caption,
    productId: item.product.id,
    productName: item.product.name,
    publishMode: getBasketPublishMode(),
    scheduledAt,
    forceFreshUpload: true,
    queueIndex,
    queueTotal,
    queueStartedAt,
    tiktokTabId,
  });
  if (!response?.ok) throw new Error(basketFlowErrorMessage(response));
  return response;
}

startBasketQueueButton?.addEventListener("click", async () => {
  if (!basketQueue.length || basketFlowRunning) return;
  if (!scheduleIsValid() || !basketIntervalIsValid()) {
    basketStatus.textContent = "กรุณาตรวจสอบเวลาเริ่มต้นและระยะห่างของแต่ละคลิป";
    basketStatus.dataset.state = "error";
    return;
  }

  const publishMode = getBasketPublishMode();
  const baseTimestamp = getScheduleTimestamp();
  const intervalMs = getBasketIntervalMinutes() * 60 * 1000;
  const queueStartedAt = Date.now();
  let queueTikTokTabId = null;
  basketFlowRunning = true;
  updateBasketBundle();
  try {
    for (let index = 0; index < basketQueue.length; index += 1) {
      const item = basketQueue[index];
      item.state = "working";
      item.stateText = `กำลังทำคลิป ${index + 1}/${basketQueue.length}`;
      renderBasketQueue();
      basketStatus.textContent = `กำลังโพสต์คลิป ${index + 1}/${basketQueue.length}: ${item.file.name}`;
      basketStatus.dataset.state = "working";
      const scheduledAt = publishMode === "schedule"
        ? toLocalDateTimeInputValue(new Date(baseTimestamp + index * intervalMs))
        : "";
      try {
        const response = await runBasketQueueItem(
          item,
          scheduledAt,
          index + 1,
          basketQueue.length,
          queueStartedAt,
          queueTikTokTabId,
        );
        queueTikTokTabId = Number.isInteger(response.tabId)
          ? response.tabId
          : queueTikTokTabId;
        item.state = "success";
        item.stateText = response.validationSkipped
          ? `สำเร็จ · ${response.warning || "ข้ามการตรวจ Lite"}`
          : "โพสต์สำเร็จ";
      } catch (error) {
        item.state = "error";
        item.stateText = String(error);
        renderBasketQueue();
        throw new Error(`คลิป ${index + 1} (${item.file.name}): ${String(error)}`);
      }
      stagedBasketVideo = null;
      renderBasketQueue();
    }
    basketStatus.textContent = `โพสต์ครบ ${basketQueue.length} คลิปเรียบร้อยแล้ว`;
    basketStatus.dataset.state = "success";
  } catch (error) {
    basketStatus.textContent = `คิวหยุดทำงาน: ${String(error)}`;
    basketStatus.dataset.state = "error";
  } finally {
    basketFlowRunning = false;
    updateBasketBundle();
  }
});

startBasketFlowButton?.addEventListener("click", async () => {
  const file = basketVideoInput.files?.[0];
  if (!file) {
    basketStatus.textContent = "กรุณาเลือกวิดีโอก่อนเริ่มปักตะกร้า";
    basketStatus.dataset.state = "error";
    basketVideoInput.click();
    return;
  }

  const caption = basketCaption.value.trim();
  if (!caption) {
    basketStatus.textContent = "กรุณาใส่ข้อความหรือแฮชแท็กก่อนเริ่ม";
    basketStatus.dataset.state = "error";
    basketCaption.focus();
    return;
  }

  if (!selectedBasketProduct) {
    basketStatus.textContent = "กรุณาเลือกสินค้าจาก TikTok Sync เพื่อผูก Product ID";
    basketStatus.dataset.state = "error";
    scrollToProductPicker();
    return;
  }

  const publishMode = getBasketPublishMode();
  const scheduledAt = publishMode === "schedule" ? basketScheduleAt.value : "";
  if (!scheduleIsValid()) {
    basketStatus.textContent = "กรุณาเลือกเวลาในอนาคต โดยนาทีต้องลงท้าย 00, 05, 10…";
    basketStatus.dataset.state = "error";
    basketScheduleAt.focus();
    return;
  }

  basketFlowRunning = true;
  updateBasketBundle();
  basketStatus.textContent = "กำลังเปิด TikTok Studio…";
  basketStatus.dataset.state = "working";
  try {
    await chrome.storage.session.set({
      tiktokBasketDraft: {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        caption,
        product: {
          id: selectedBasketProduct.id,
          name: selectedBasketProduct.name,
          imgUrl: selectedBasketProduct.imgUrl,
        },
        publishMode,
        scheduledAt,
        updatedAt: Date.now(),
      },
    });
    basketStatus.textContent = "กำลังเตรียมไฟล์วิดีโอชั่วคราว…";
    const stagedVideo = await stageBasketVideo(file);
    basketStatus.textContent = "กำลังเปิด TikTok Studio และส่งวิดีโอ…";
    const response = await chrome.runtime.sendMessage({
      type: "uploadVideoToTikTokStudio",
      localPath: stagedVideo.localPath,
      downloadId: stagedVideo.downloadId,
      originalName: stagedVideo.originalName,
      caption,
      productId: selectedBasketProduct.id,
      productName: selectedBasketProduct.name,
      publishMode,
      scheduledAt,
    });
    if (!response?.ok) {
      if (response?.uploaded) {
        basketStatus.textContent = response.stage === "validation"
          ? `ตั้งค่าครบแล้ว แต่การตรวจสอบหรือการโพสต์ไม่สำเร็จ: ${response.error}`
          : response.stage === "ai-label"
            ? `เพิ่มสินค้าและตั้งเวลาแล้ว แต่เปิดป้ายเนื้อหาที่สร้างโดย AI ไม่สำเร็จ: ${response.error}`
            : response.stage === "post-time"
            ? `เพิ่มสินค้าแล้ว แต่ตั้งค่าเวลาโพสต์ไม่สำเร็จ: ${response.error}`
            : response.stage === "product-link"
            ? `วิดีโอและข้อความเรียบร้อยแล้ว แต่เปิดค้นหาสินค้าไม่สำเร็จ: ${response.error}`
            : `วิดีโออัปโหลดแล้ว แต่ใส่ข้อความ/แฮชแท็กไม่สำเร็จ: ${response.error}`;
        basketStatus.dataset.state = "error";
        return;
      }
      throw new Error(response?.error || "เปิด TikTok Studio ไม่สำเร็จ");
    }
    basketStatus.textContent = response.postTimingConfigured
      ? publishMode === "schedule"
        ? `${response.validationSkipped ? `ตรวจลิขสิทธิ์ผ่าน (${response.warning || "ข้าม Lite"})` : "ตรวจสอบผ่าน"} และตั้งเวลาโพสต์ ${new Date(scheduledAt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })} เรียบร้อยแล้ว`
        : `${response.validationSkipped ? `ตรวจลิขสิทธิ์ผ่าน (${response.warning || "ข้าม Lite"})` : "ตรวจสอบผ่าน"} และโพสต์ Product ID ${selectedBasketProduct.id} เรียบร้อยแล้ว`
      : `อัปโหลดวิดีโอและใส่ข้อความเรียบร้อยแล้ว · ชุดงาน Product ID ${selectedBasketProduct.id}`;
    basketStatus.dataset.state = "success";
  } catch (error) {
    console.error("Could not start TikTok basket flow:", error);
    basketStatus.textContent = `เปิด TikTok Studio ไม่สำเร็จ: ${String(error)}`;
    basketStatus.dataset.state = "error";
  } finally {
    basketFlowRunning = false;
    updateBasketBundle();
  }
});

updateSelectedProductCard();
if (basketScheduleAt) {
  basketScheduleAt.min = toLocalDateTimeInputValue(new Date(Date.now() + 60 * 1000));
}
updatePostTimeUi();

function setStatus(message, { progress = null, state = "working" } = {}) {
  status.textContent = message;
  statusCard.hidden = !message;
  statusCard.dataset.state = state;

  if (Number.isFinite(progress)) {
    const safeProgress = Math.max(0, Math.min(100, Math.round(progress)));
    statusPercent.textContent = `${safeProgress}%`;
    statusProgress.style.width = `${safeProgress}%`;
  } else if (state === "success") {
    statusPercent.textContent = "100%";
    statusProgress.style.width = "100%";
  }
}

function setAutomationIdle() {
  activeTabId = null;
  startButton.disabled = false;
  cancelButton.disabled = false;
  cancelButton.hidden = true;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result), { once: true });
    reader.addEventListener("error", () => reject(reader.error), { once: true });
    reader.readAsDataURL(file);
  });
}

function setProductExpanded(row, expanded) {
  const editor = row.querySelector('[data-role="product-editor"]');
  const toggle = row.querySelector('[data-action="toggle-product"]');
  const toggleLabel = row.querySelector('[data-role="toggle-label"]');
  row.dataset.expanded = String(expanded);
  editor.hidden = !expanded;
  toggle.setAttribute("aria-expanded", String(expanded));
  toggle.setAttribute(
    "aria-label",
    expanded ? "ย่อรายละเอียดสินค้า" : "เปิดรายละเอียดสินค้า",
  );
  toggleLabel.textContent = expanded ? "ย่อ" : "แก้ไข";
}

function updateJobSummary() {
  const totalProducts = productList.querySelectorAll(".product-row").length;
  const requestedLoopCount = Number(loopCount.value) || 1;
  const totalClips = totalProducts * requestedLoopCount;
  jobSummary.querySelector("strong").textContent =
    `${totalProducts} สินค้า × ${requestedLoopCount} ลูป = ${totalClips} คลิป`;
}

function updateProductRowState(row) {
  const imageInput = row.querySelector('[data-role="image-input"]');
  const imagePrompt = row.querySelector('[data-role="image-prompt"]');
  const videoPrompt = row.querySelector('[data-role="video-prompt"]');
  const statusBadge = row.querySelector('[data-role="product-status"]');
  const summary = row.querySelector('[data-role="product-summary"]');
  const completedFields = [
    Boolean(imageInput.files[0]),
    Boolean(imagePrompt.value.trim()),
    Boolean(videoPrompt.value.trim()),
  ].filter(Boolean).length;
  const isComplete = completedFields === 3;

  row.dataset.complete = String(isComplete);
  statusBadge.dataset.state = isComplete ? "complete" : "incomplete";
  statusBadge.textContent = isComplete ? "พร้อม" : `${completedFields} / 3`;
  summary.textContent = isComplete
    ? imageInput.files[0].name
    : completedFields > 0
      ? `กรอกแล้ว ${completedFields} จาก 3 ขั้นตอน`
      : "ยังกรอกข้อมูลไม่ครบ";
}

function updateProductTitles() {
  const rows = [...productList.querySelectorAll(".product-row")];
  rows.forEach((row, index) => {
    row.querySelector('[data-role="product-title"]').textContent = `สินค้า ${index + 1}`;
    row.querySelector('[data-role="product-index"]').textContent = index + 1;
    row.querySelector('[data-action="remove-product"]').setAttribute(
      "aria-label",
      `ลบสินค้า ${index + 1}`,
    );
    updateProductRowState(row);
  });
  addProductButton.disabled = rows.length >= MAX_PRODUCTS;
  productCount.textContent = `${rows.length} / ${MAX_PRODUCTS}`;
  updateJobSummary();
}

function revokePreview(row) {
  const url = previewUrls.get(row);
  if (url) {
    URL.revokeObjectURL(url);
    previewUrls.delete(row);
  }
}

function updateProductPreview(row, file) {
  revokePreview(row);
  const preview = row.querySelector('[data-role="image-preview"]');
  const icon = row.querySelector('[data-role="upload-icon"]');
  const fileName = row.querySelector('[data-role="file-name"]');
  if (!file) {
    preview.hidden = true;
    preview.removeAttribute("src");
    icon.hidden = false;
    fileName.textContent = "เลือกรูปภาพ";
    return;
  }
  const url = URL.createObjectURL(file);
  previewUrls.set(row, url);
  preview.src = url;
  preview.hidden = false;
  icon.hidden = true;
  fileName.textContent = file.name;
}

function addProductRow() {
  if (productList.children.length >= MAX_PRODUCTS) {
    return;
  }
  const existingRows = [...productList.querySelectorAll(".product-row")];
  existingRows.forEach((existingRow) => {
    setProductExpanded(existingRow, false);
  });
  const row = productTemplate.content.firstElementChild.cloneNode(true);
  const id = nextProductId++;
  const imageInput = row.querySelector('[data-role="image-input"]');
  const imagePrompt = row.querySelector('[data-role="image-prompt"]');
  const videoPrompt = row.querySelector('[data-role="video-prompt"]');
  imageInput.id = `product-image-${id}`;
  imagePrompt.id = `product-image-prompt-${id}`;
  videoPrompt.id = `product-video-prompt-${id}`;
  imageInput.closest("label").htmlFor = imageInput.id;
  imagePrompt.closest("label").htmlFor = imagePrompt.id;
  videoPrompt.closest("label").htmlFor = videoPrompt.id;
  imageInput.addEventListener("change", () => {
    updateProductPreview(row, imageInput.files[0]);
    updateProductRowState(row);
  });
  imagePrompt.addEventListener("input", () => updateProductRowState(row));
  videoPrompt.addEventListener("input", () => updateProductRowState(row));
  row
    .querySelector('[data-action="toggle-product"]')
    .addEventListener("click", () => {
      setProductExpanded(row, row.dataset.expanded !== "true");
    });
  row
    .querySelector('[data-action="remove-product"]')
    .addEventListener("click", () => {
      if (productList.children.length <= 1) {
        return;
      }
      revokePreview(row);
      row.remove();
      updateProductTitles();
      const remainingRows = [...productList.querySelectorAll(".product-row")];
      if (remainingRows.length && !remainingRows.some((item) => item.dataset.expanded === "true")) {
        setProductExpanded(remainingRows[0], true);
      }
    });
  productList.append(row);
  setProductExpanded(row, true);
  updateProductTitles();
  if (existingRows.length) {
    requestAnimationFrame(() => {
      row.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }
}

addProductButton.addEventListener("click", addProductRow);
loopCount.addEventListener("change", updateJobSummary);
addProductRow();

function focusProductField(row, field) {
  setProductExpanded(row, true);
  row.scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => field.focus(), 180);
}

startButton.addEventListener("click", async () => {
  const rows = [...productList.querySelectorAll(".product-row")];
  const requestedLoopCount = Number(loopCount.value);
  const safeLoopCount = [1, 2, 3, 4].includes(requestedLoopCount)
    ? requestedLoopCount
    : 1;
  const drafts = [];

  for (const [index, row] of rows.entries()) {
    const imageInput = row.querySelector('[data-role="image-input"]');
    const imagePrompt = row.querySelector('[data-role="image-prompt"]');
    const videoPrompt = row.querySelector('[data-role="video-prompt"]');
    const [imageFile] = imageInput.files;
    const prompt = imagePrompt.value.trim();
    const requestedVideoPrompt = videoPrompt.value.trim();
    const label = `สินค้า ${index + 1}`;
    if (!imageFile) {
      setStatus(`${label}: กรุณาเลือกรูปภาพอ้างอิง`, { state: "error" });
      focusProductField(row, imageInput);
      return;
    }
    if (imageFile.size > MAX_IMAGE_SIZE_BYTES) {
      setStatus(`${label}: รูปภาพต้องมีขนาดไม่เกิน 20 MB`, { state: "error" });
      focusProductField(row, imageInput);
      return;
    }
    if (!prompt) {
      setStatus(`${label}: กรุณาใส่ Image Prompt`, { state: "error" });
      focusProductField(row, imagePrompt);
      return;
    }
    if (!requestedVideoPrompt) {
      setStatus(`${label}: กรุณาใส่ Video Prompt`, { state: "error" });
      focusProductField(row, videoPrompt);
      return;
    }
    drafts.push({ imageFile, prompt, videoPrompt: requestedVideoPrompt });
  }

  startButton.disabled = true;
  setStatus("กำลังเตรียมรูปภาพ…", { progress: 1 });
  const jobId = crypto.randomUUID();
  const jobKey = `flowJob:${jobId}`;

  try {
    const products = await Promise.all(
      drafts.map(
        async (
          { imageFile, prompt, videoPrompt: productVideoPrompt },
          index,
        ) => ({
          prompt,
          videoPrompt: productVideoPrompt,
          image: {
            name: `product-${String(index + 1).padStart(2, "0")}-${imageFile.name}`,
            type: imageFile.type || "image/png",
            dataUrl: await readFileAsDataUrl(imageFile),
          },
        }),
      ),
    );
    const firstProduct = products[0];
    await chrome.storage.local.set({
      [jobKey]: {
        products,
        loopCount: safeLoopCount,
        image: firstProduct.image,
        prompt: firstProduct.prompt,
        videoPrompt: firstProduct.videoPrompt,
      },
    });

    setStatus(
      `กำลังเปิด Flow · ${products.length} สินค้า × ${safeLoopCount} ลูป…`,
      { progress: 2 },
    );
    const response = await chrome.runtime.sendMessage({
      type: "createFlowProject",
      jobId,
    });

    if (!response?.ok) {
      throw new Error(response?.error ?? "Unknown error");
    }

    activeTabId = response.tabId;
    cancelButton.hidden = false;
    setStatus("เปิด Flow แล้ว ระบบกำลังทำงานตามลำดับ…", { progress: 3 });
  } catch (error) {
    await chrome.storage.local.remove(jobKey);
    console.error("Could not start Flow automation:", error);
    setStatus("เริ่มทำงานไม่สำเร็จ กรุณาลองอีกครั้ง", { state: "error" });
    setAutomationIdle();
  }
});

cancelButton.addEventListener("click", async () => {
  if (activeTabId == null) {
    return;
  }

  cancelButton.disabled = true;
  setStatus("กำลังยกเลิก…");

  try {
    await chrome.runtime.sendMessage({
      type: "cancelFlowAutomation",
      tabId: activeTabId,
    });
    setStatus("ยกเลิกการทำงานแล้ว", { state: "cancelled" });
  } catch (error) {
    console.error("Could not cancel Flow automation:", error);
    setStatus("ยกเลิกไม่สำเร็จ กรุณาลองอีกครั้ง", { state: "error" });
  } finally {
    setAutomationIdle();
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "flowAutomationStatus") {
    return;
  }

  if (message.status === "working") {
    setStatus(message.detail || "กำลังทำงาน…", {
      progress: message.progress,
      state: "working",
    });
    return;
  }

  if (message.status === "prepared") {
    setStatus(
      message.detail || "ตั้งค่ารูปภาพและวิดีโอใน Flow เรียบร้อยแล้ว",
      { progress: 100, state: "success" },
    );
    setAutomationIdle();
    return;
  }

  if (message.status === "cancelled") {
    setStatus("ยกเลิกการทำงานแล้ว", { state: "cancelled" });
    setAutomationIdle();
    return;
  }

  setStatus(message.detail || "ทำรายการไม่สำเร็จ กรุณาทำต่อใน Flow", {
    state: "error",
  });
  setAutomationIdle();
});

let globalItemCount = 0; // ตัวนับลำดับสินค้าทั้งหมด

syncTiktokBtn.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.url?.includes("tiktok.com")) {
    alert("กรุณาเปิดหน้าเว็บ TikTok Studio (หน้าเลือกสินค้า) ก่อนใช้งาน");
    return;
  }

  const maxPagesValue = Number(syncMaxPages.value) || 5;

  // จัดการ UI ปุ่ม
  syncTiktokBtn.style.display = "none";
  cancelSyncBtn.style.display = "flex";
  cancelSyncBtn.disabled = false;
  syncMaxPages.disabled = true;

  clearSyncBtn.disabled = true;
  clearSyncBtn.style.opacity = "0.5";
  clearSyncBtn.style.cursor = "not-allowed";

  tiktokSyncStatus.hidden = false;
  tiktokSyncStatus.textContent = `กำลังเริ่มดึงข้อมูล (ตั้งเป้า ${maxPagesValue} หน้า)...`;
  tiktokSyncStatus.dataset.state = "working";

  resetSyncedProducts();
  globalItemCount = 0;

  chrome.tabs.sendMessage(tab.id, { type: "START_PAGINATION_SCRAPE", maxPages: maxPagesValue }, (response) => {
    syncTiktokBtn.style.display = "flex";
    cancelSyncBtn.style.display = "none";
    syncMaxPages.disabled = false;

    clearSyncBtn.disabled = false;
    clearSyncBtn.style.opacity = "1";
    clearSyncBtn.style.cursor = "pointer";

    if (chrome.runtime.lastError) {
      tiktokSyncStatus.textContent = "พบข้อผิดพลาด กรุณารีเฟรชหน้า TikTok แล้วลองใหม่";
      tiktokSyncStatus.dataset.state = "error";
      return;
    }

    if (response && response.status === "done") {
      tiktokSyncStatus.textContent = `ดึงข้อมูลเสร็จสมบูรณ์! ได้ทั้งหมด ${globalItemCount} รายการ`;
      tiktokSyncStatus.dataset.state = "success";
    } else if (response && response.status === "cancelled") {
      tiktokSyncStatus.textContent = `ยกเลิกแล้ว! ได้มาทั้งหมด ${globalItemCount} รายการ`;
      tiktokSyncStatus.dataset.state = "warning";
    }
  });
});

syncMaxPages.addEventListener("input", function () {
  // 1. แทนที่สิ่งที่พิมพ์เข้ามา ที่ไม่ใช่ตัวเลข (0-9) ให้หายไป (กันติดลบ, กันพิมพ์ตัวอักษร, กันจุดทศนิยม)
  this.value = this.value.replace(/[^0-9]/g, "");

  // 2. ถ้าเผลอพิมพ์เลขเกิน 100 (เช่น 101) ให้ล็อกกลับมาที่ 100 (เพื่อป้องกันลูปทำงานหนักเกินไป)
  if (Number(this.value) > 100) {
    this.value = "100";
  }
});

syncMaxPages.addEventListener("blur", function () {
  // 3. เมื่อคลิกเมาส์ออกนอกช่อง ถ้าลบจนโล่ง หรือพิมพ์ 0 เอาไว้ ให้บังคับกลับเป็น 1 เสมอ
  if (!this.value || Number(this.value) < 1) {
    this.value = "1";
  }
});

// ฟังก์ชันรับข้อมูลทีละหน้า (Chunk) จาก scraper.js มาแสดงผล Real-time
cancelSyncBtn.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  cancelSyncBtn.disabled = true;
  chrome.tabs.sendMessage(tab.id, { type: "CANCEL_PAGINATION_SCRAPE" });
});

clearSyncBtn.addEventListener("click", () => {
  resetSyncedProducts();
  tiktokSyncStatus.hidden = true;
  tiktokSyncStatus.textContent = "";
  globalItemCount = 0;
});

// ฟังก์ชันนี้มีแค่ตัวเดียวแล้ว! จะไม่ทำให้ข้อมูลเบิ้ลซ้ำอีก
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "TIKTOK_SCRAPE_CHUNK") {
    const products = Array.isArray(message.data) ? message.data : [];

    tiktokSyncStatus.hidden = false;
    tiktokSyncStatus.dataset.state = "working";
    tiktokSyncStatus.textContent = `กำลังกวาดหน้า ${message.page}... ได้มาแล้ว ${message.total} รายการ`;

    products.forEach((product) => {
      const normalized = normalizeSyncedProduct(product);
      if (!normalized || syncedProducts.some((item) => item.id === normalized.id)) return;
      syncedProducts.push(normalized);
    });

    globalItemCount = syncedProducts.length;
    renderSyncedProducts();
    tiktokIdOutput.scrollTop = tiktokIdOutput.scrollHeight;
  }
});

window.addEventListener("unload", () => {
  for (const url of previewUrls.values()) {
    URL.revokeObjectURL(url);
  }
  previewUrls.clear();
});
