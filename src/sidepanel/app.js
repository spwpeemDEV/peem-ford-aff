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
const imageBatchDropzone = document.querySelector("#imageBatchDropzone");
const chooseMultipleImagesButton = document.querySelector("#chooseMultipleImages");
const chooseImageFolderButton = document.querySelector("#chooseImageFolder");
const multipleImageInput = document.querySelector("#multipleImageInput");
const imageFolderInput = document.querySelector("#imageFolderInput");
const imageBatchStatus = document.querySelector("#imageBatchStatus");
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
const basketVideoBatchDropzone = document.querySelector("#basketVideoBatchDropzone");
const chooseMultipleVideosButton = document.querySelector("#chooseMultipleVideos");
const chooseVideoFolderButton = document.querySelector("#chooseVideoFolder");
const multipleVideoInput = document.querySelector("#multipleVideoInput");
const videoFolderInput = document.querySelector("#videoFolderInput");
const basketVideoBatchStatus = document.querySelector("#basketVideoBatchStatus");
const basketVideoBatchList = document.querySelector("#basketVideoBatchList");
const clearBasketVideoBatchButton = document.querySelector("#clearBasketVideoBatch");
const basketVideoFileName = document.querySelector("#basketVideoFileName");
const basketVideoFileMeta = document.querySelector("#basketVideoFileMeta");
const basketVideoPreviewCard = document.querySelector("#basketVideoPreviewCard");
const basketVideoPreview = document.querySelector("#basketVideoPreview");
const basketVideoPreviewName = document.querySelector("#basketVideoPreviewName");
const basketVideoPreviewDuration = document.querySelector("#basketVideoPreviewDuration");
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
const basketPublishModeInputs = [...document.querySelectorAll('input[name="basketPublishMode"]')];
const basketScheduleField = document.querySelector("#basketScheduleField");
const basketScheduleAt = document.querySelector("#basketScheduleAt");
const basketIntervalMinutes = document.querySelector("#basketIntervalMinutes");
const addBasketQueueItemButton = document.querySelector("#addBasketQueueItem");
const startBasketQueueButton = document.querySelector("#startBasketQueue");
const basketQueueList = document.querySelector("#basketQueueList");
const basketQueueCount = document.querySelector("#basketQueueCount");
const basketProductModal = document.querySelector("#basketProductModal");
const basketProductModalSearch = document.querySelector("#basketProductModalSearch");
const basketProductModalList = document.querySelector("#basketProductModalList");
const basketProductModalCount = document.querySelector("#basketProductModalCount");
const closeBasketProductModalButton = document.querySelector("#closeBasketProductModal");
const cancelBasketProductModalButton = document.querySelector("#cancelBasketProductModal");

let activeTabId = null;
let nextProductId = 1;
const previewUrls = new Map();
const MAX_PRODUCTS = 10;
const MAX_BATCH_VIDEOS = 30;
const MAX_TIKTOK_VIDEO_SIZE_BYTES = 30 * 1024 * 1024 * 1024;
let stagedBasketVideo = null;
let pendingBasketVideos = [];
let basketVideoPreviewUrl = "";
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

function closeBasketProductPicker() {
  if (basketProductModal?.open) basketProductModal.close();
}

function renderBasketProductPicker() {
  if (!basketProductModalList) return;
  const query = basketProductModalSearch?.value.trim().toLocaleLowerCase("th") || "";
  const visibleProducts = syncedProducts.filter((product) =>
    `${product.name} ${product.id}`.toLocaleLowerCase("th").includes(query),
  );

  basketProductModalList.replaceChildren();
  for (const product of visibleProducts) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "product-picker-modal-item";
    item.dataset.productId = product.id;
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", String(selectedBasketProduct?.id === product.id));
    item.classList.toggle("is-selected", selectedBasketProduct?.id === product.id);

    const image = document.createElement("img");
    image.src = product.imgUrl;
    image.alt = "";
    const copy = document.createElement("span");
    const name = document.createElement("strong");
    name.textContent = product.name;
    const id = document.createElement("small");
    id.textContent = `Product ID: ${product.id}`;
    copy.append(name, id);
    const indicator = document.createElement("span");
    indicator.className = "product-picker-modal-indicator";
    indicator.textContent = selectedBasketProduct?.id === product.id ? "✓ เลือกแล้ว" : "เลือก";
    item.append(image, copy, indicator);
    item.addEventListener("click", () => {
      selectSyncedProduct(product.id);
      closeBasketProductPicker();
      chooseSyncedProductButton?.focus();
    });
    basketProductModalList.appendChild(item);
  }

  if (!visibleProducts.length) {
    const empty = document.createElement("div");
    empty.className = "product-picker-modal-empty";
    const title = document.createElement("strong");
    title.textContent = syncedProducts.length ? "ไม่พบสินค้าที่ค้นหา" : "ยังไม่มีสินค้าใน TikTok Sync";
    const detail = document.createElement("small");
    detail.textContent = syncedProducts.length
      ? "ลองค้นหาด้วยชื่ออื่นหรือ Product ID"
      : "กรุณาดึงข้อมูลสินค้าก่อน แล้วกลับมาเปิดรายการนี้อีกครั้ง";
    empty.append(title, detail);
    basketProductModalList.appendChild(empty);
  }
  basketProductModalCount.textContent = `${visibleProducts.length} สินค้า`;
}

function openBasketProductPicker() {
  if (!basketProductModal) return;
  basketProductModalSearch.value = "";
  renderBasketProductPicker();
  if (!basketProductModal.open) basketProductModal.showModal();
  window.setTimeout(() => basketProductModalSearch?.focus(), 100);
}

function updateBasketBundle() {
  const file = basketVideoInput?.files?.[0] || null;
  const caption = basketCaption?.value.trim() || "";
  const timingReady = scheduleIsValid() && basketIntervalIsValid();
  const completed = [
    Boolean(file),
    Boolean(caption),
    Boolean(selectedBasketProduct),
    timingReady,
  ];

  const completeCount = completed.filter(Boolean).length;
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
  renderBasketProductPicker();
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
  renderBasketProductPicker();
}

function resetSyncedProducts() {
  syncedProducts = [];
  selectedBasketProduct = null;
  if (syncedProductSearch) syncedProductSearch.value = "";
  renderSyncedProducts();
  updateSelectedProductCard();
}

syncedProductSearch?.addEventListener("input", renderSyncedProducts);
basketProductModalSearch?.addEventListener("input", renderBasketProductPicker);
chooseSyncedProductButton?.addEventListener("click", openBasketProductPicker);
changeSelectedProductButton?.addEventListener("click", openBasketProductPicker);
closeBasketProductModalButton?.addEventListener("click", closeBasketProductPicker);
cancelBasketProductModalButton?.addEventListener("click", closeBasketProductPicker);
basketProductModal?.addEventListener("click", (event) => {
  if (event.target === basketProductModal) closeBasketProductPicker();
});
for (const input of basketPublishModeInputs) {
  input.addEventListener("change", () => updatePostTimeUi({ setDefault: true }));
}
basketScheduleAt?.addEventListener("input", updateBasketBundle);
basketIntervalMinutes?.addEventListener("input", updateBasketBundle);

function isSupportedVideo(file) {
  return Boolean(file) && (
    ["video/mp4", "video/quicktime", "video/webm"].includes(file.type) ||
    /\.(?:mp4|mov|webm)$/i.test(file.name)
  );
}

function formatVideoDuration(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "--:--";
  const roundedSeconds = Math.floor(totalSeconds);
  const minutes = Math.floor(roundedSeconds / 60);
  const seconds = roundedSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function updateBasketVideoPreview(file) {
  if (basketVideoPreviewUrl) {
    URL.revokeObjectURL(basketVideoPreviewUrl);
    basketVideoPreviewUrl = "";
  }

  basketVideoPreview.removeAttribute("src");
  basketVideoPreview.load();
  basketVideoPreviewCard.hidden = !file;
  basketVideoPreviewName.textContent = file?.name || "";
  basketVideoPreviewDuration.textContent = "--:--";
  if (!file) return;

  basketVideoPreviewUrl = URL.createObjectURL(file);
  basketVideoPreview.src = basketVideoPreviewUrl;
  basketVideoPreview.load();
}

basketVideoPreview?.addEventListener("loadedmetadata", () => {
  basketVideoPreviewDuration.textContent = formatVideoDuration(basketVideoPreview.duration);
});

basketVideoPreview?.addEventListener("error", () => {
  basketVideoPreviewDuration.textContent = "เปิดตัวอย่างไม่ได้";
});

function setCurrentBasketVideo(file, { announce = true } = {}) {
  stagedBasketVideo = null;
  if (!file) {
    basketVideoInput.value = "";
    basketVideoFileName.textContent = "เลือกวิดีโอ";
    basketVideoFileMeta.textContent = "คลิกเพื่อเลือกไฟล์ที่ต้องการโพสต์";
    updateBasketVideoPreview(null);
    updateBasketBundle();
    return;
  }
  const transfer = new DataTransfer();
  transfer.items.add(file);
  basketVideoInput.files = transfer.files;
  basketVideoFileName.textContent = file.name;
  basketVideoFileMeta.textContent = `${formatFileSize(file.size)} · ${file.type || "วิดีโอ"}`;
  updateBasketVideoPreview(file);
  if (announce) {
    basketStatus.textContent = "เลือกวิดีโอแล้ว กรุณาใส่ข้อความและเลือกสินค้าที่จะผูก";
    basketStatus.dataset.state = "ready";
  }
  updateBasketBundle();
}

function renderPendingBasketVideos() {
  basketVideoBatchList.replaceChildren();
  pendingBasketVideos.forEach((file, index) => {
    const row = document.createElement("article");
    row.className = "basket-video-batch-item";

    const order = document.createElement("span");
    order.className = "basket-video-batch-order";
    order.textContent = index + 1;

    const copy = document.createElement("span");
    copy.className = "basket-video-batch-copy";
    const name = document.createElement("strong");
    name.textContent = file.name;
    const meta = document.createElement("small");
    meta.textContent = formatFileSize(file.size);
    copy.append(name, meta);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `นำ ${file.name} ออกจากคลิปรอ`);
    remove.addEventListener("click", () => {
      pendingBasketVideos.splice(index, 1);
      renderPendingBasketVideos();
    });
    row.append(order, copy, remove);
    basketVideoBatchList.appendChild(row);
  });

  basketVideoBatchStatus.textContent = pendingBasketVideos.length
    ? `มี ${pendingBasketVideos.length} คลิปรอถัดไป`
    : "ยังไม่มีคลิปรอทำงาน";
  basketVideoBatchStatus.dataset.state = pendingBasketVideos.length ? "ready" : "empty";
  clearBasketVideoBatchButton.hidden = !pendingBasketVideos.length;
}

function loadNextPendingBasketVideo() {
  const nextFile = pendingBasketVideos.shift() || null;
  setCurrentBasketVideo(nextFile, { announce: false });
  renderPendingBasketVideos();
  if (nextFile) {
    basketStatus.textContent = `โหลดคลิปถัดไปแล้ว: ${nextFile.name}`;
    basketStatus.dataset.state = "ready";
  }
}

function importVideoFiles(files) {
  const incomingFiles = [...files];
  const supportedFiles = incomingFiles.filter(isSupportedVideo);
  const oversizedFiles = supportedFiles.filter((file) => file.size > MAX_TIKTOK_VIDEO_SIZE_BYTES);
  const existingFingerprints = new Set([
    basketVideoInput.files?.[0],
    ...pendingBasketVideos,
    ...basketQueue.map((item) => item.file),
  ].filter(Boolean).map((file) => `${file.name}:${file.size}:${file.lastModified}`));
  let duplicateCount = 0;
  const uniqueFiles = supportedFiles
    .filter((file) => file.size <= MAX_TIKTOK_VIDEO_SIZE_BYTES)
    .filter((file) => {
      const fingerprint = `${file.name}:${file.size}:${file.lastModified}`;
      if (existingFingerprints.has(fingerprint)) {
        duplicateCount += 1;
        return false;
      }
      existingFingerprints.add(fingerprint);
      return true;
    })
    .sort((left, right) => left.name.localeCompare(right.name, "th", { numeric: true }));
  const currentFile = basketVideoInput.files?.[0] || null;
  const availableSlots = Math.max(
    0,
    MAX_BATCH_VIDEOS - pendingBasketVideos.length - (currentFile ? 1 : 0),
  );
  const filesToImport = uniqueFiles.slice(0, availableSlots);
  if (!currentFile && filesToImport.length) {
    setCurrentBasketVideo(filesToImport.shift(), { announce: false });
  }
  pendingBasketVideos.push(...filesToImport);
  renderPendingBasketVideos();

  const imported = Math.min(uniqueFiles.length, availableSlots);
  const skipped = Math.max(0, uniqueFiles.length - availableSlots);
  if (!supportedFiles.length) {
    basketStatus.textContent = "ไม่พบไฟล์ MP4, MOV หรือ WEBM ที่รองรับ";
    basketStatus.dataset.state = "error";
    return;
  }
  const messages = [`นำเข้า ${imported} คลิปแล้ว`];
  if (skipped) messages.push(`ข้าม ${skipped} คลิปเพราะครบ ${MAX_BATCH_VIDEOS} คลิป`);
  if (oversizedFiles.length) messages.push(`ข้าม ${oversizedFiles.length} คลิปที่เกิน 30 GB`);
  if (duplicateCount) messages.push(`ข้าม ${duplicateCount} คลิปซ้ำ`);
  if (imported) messages.push("คลิปแรกพร้อมตั้งค่างาน");
  basketStatus.textContent = messages.join(" · ");
  basketStatus.dataset.state = imported ? "success" : "error";
}

basketVideoInput?.addEventListener("change", () => {
  setCurrentBasketVideo(basketVideoInput.files?.[0] || null);
});

chooseMultipleVideosButton?.addEventListener("click", () => multipleVideoInput.click());
chooseVideoFolderButton?.addEventListener("click", () => videoFolderInput.click());
multipleVideoInput?.addEventListener("change", () => {
  importVideoFiles(multipleVideoInput.files || []);
  multipleVideoInput.value = "";
});
videoFolderInput?.addEventListener("change", () => {
  importVideoFiles(videoFolderInput.files || []);
  videoFolderInput.value = "";
});
clearBasketVideoBatchButton?.addEventListener("click", () => {
  pendingBasketVideos = [];
  renderPendingBasketVideos();
});
basketVideoBatchDropzone?.addEventListener("click", (event) => {
  if (!event.target.closest("button")) multipleVideoInput.click();
});
basketVideoBatchDropzone?.addEventListener("keydown", (event) => {
  if (event.target.closest("button")) return;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    multipleVideoInput.click();
  }
});
for (const eventName of ["dragenter", "dragover"]) {
  basketVideoBatchDropzone?.addEventListener(eventName, (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    basketVideoBatchDropzone.classList.add("is-dragging");
  });
}
for (const eventName of ["dragleave", "drop"]) {
  basketVideoBatchDropzone?.addEventListener(eventName, () => {
    basketVideoBatchDropzone.classList.remove("is-dragging");
  });
}
basketVideoBatchDropzone?.addEventListener("drop", async (event) => {
  event.preventDefault();
  const items = [...(event.dataTransfer.items || [])];
  const entries = items.map((item) => item.webkitGetAsEntry?.()).filter(Boolean);
  basketVideoBatchStatus.textContent = "กำลังอ่านวิดีโอจากรายการที่วาง…";
  basketVideoBatchStatus.dataset.state = "working";
  const droppedFiles = entries.length
    ? (await Promise.all(entries.map(collectDroppedEntryFiles))).flat()
    : [...(event.dataTransfer.files || [])];
  importVideoFiles(droppedFiles);
});

renderPendingBasketVideos();

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
  basketCaption.value = "";
  basketCaptionCount.textContent = "0 / 4000";
  selectedBasketProduct = null;
  loadNextPendingBasketVideo();
  if (!basketVideoInput.files?.[0]) {
    basketVideoFileName.textContent = "เลือกวิดีโอถัดไป";
    basketVideoFileMeta.textContent = "คลิกเพื่อเพิ่มคลิปใหม่เข้าคิว";
  }
  updateSelectedProductCard();
  renderSyncedProducts();
  basketStatus.textContent = basketVideoInput.files?.[0]
    ? `เพิ่มคลิปที่ ${basketQueue.length} ลงคิวแล้ว · โหลดคลิปถัดไปเรียบร้อย`
    : `เพิ่มคลิปที่ ${basketQueue.length} ลงคิวแล้ว`;
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
    openBasketProductPicker();
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
  if (!editor || !toggle || !toggleLabel) return;
  row.dataset.expanded = String(expanded);
  toggle.setAttribute("aria-expanded", String(expanded));
  toggle.setAttribute(
    "aria-label",
    expanded ? "ปิดหน้าต่างแก้ไขสินค้า" : "แก้ไขรายละเอียดสินค้า",
  );
  toggleLabel.textContent = "แก้ไข";
  if (expanded) {
    for (const openDialog of productList.querySelectorAll(".product-editor-modal[open]")) {
      if (openDialog !== editor) openDialog.close();
    }
    if (!editor.open) editor.showModal();
  } else if (editor.open) {
    editor.close();
  }
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
  const modalProgress = row.querySelector('[data-role="modal-progress"]');
  const completedFields = [
    Boolean(imageInput.files[0]),
    Boolean(imagePrompt.value.trim()),
    Boolean(videoPrompt.value.trim()),
  ].filter(Boolean).length;
  const isComplete = completedFields === 3;

  row.dataset.complete = String(isComplete);
  statusBadge.dataset.state = isComplete ? "complete" : "incomplete";
  statusBadge.textContent = isComplete ? "พร้อม" : `${completedFields} / 3`;
  modalProgress.textContent = isComplete
    ? "ข้อมูลครบ พร้อมสร้างคลิป"
    : `กรอกข้อมูล ${completedFields} / 3 ขั้นตอน`;
  summary.textContent = isComplete
    ? imageInput.files[0].name
    : completedFields > 0
      ? `กรอกแล้ว ${completedFields} จาก 3 ขั้นตอน`
      : "ยังกรอกข้อมูลไม่ครบ";
}

function updateProductTitles() {
  const rows = [...productList.querySelectorAll(".product-row")];
  rows.forEach((row, index) => {
    const displayName = row.dataset.productName || `สินค้า ${index + 1}`;
    row.querySelector('[data-role="product-title"]').textContent = displayName;
    row.querySelector('[data-role="product-index"]').textContent = index + 1;
    row.querySelector('[data-role="modal-title"]').textContent = `ตั้งค่า ${displayName}`;
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
  const cardPreview = row.querySelector('[data-role="card-preview"]');
  const cardPlaceholder = row.querySelector('[data-role="card-placeholder"]');
  const icon = row.querySelector('[data-role="upload-icon"]');
  const fileName = row.querySelector('[data-role="file-name"]');
  if (!file) {
    preview.hidden = true;
    preview.removeAttribute("src");
    cardPreview.hidden = true;
    cardPreview.removeAttribute("src");
    cardPlaceholder.hidden = false;
    icon.hidden = false;
    fileName.textContent = "เลือกรูปภาพ";
    return;
  }
  const url = URL.createObjectURL(file);
  previewUrls.set(row, url);
  preview.src = url;
  preview.hidden = false;
  cardPreview.src = url;
  cardPreview.hidden = false;
  cardPlaceholder.hidden = true;
  icon.hidden = true;
  fileName.textContent = file.name;
}

function addProductRow({ openEditor = true } = {}) {
  if (productList.children.length >= MAX_PRODUCTS) {
    return null;
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
      setProductExpanded(row, true);
    });
  row.querySelector(".product-row-header").addEventListener("click", (event) => {
    if (!event.target.closest("button")) setProductExpanded(row, true);
  });
  row.querySelector('[data-action="close-product"]').addEventListener("click", () => {
    setProductExpanded(row, false);
  });
  row.querySelector('[data-action="save-product"]').addEventListener("click", () => {
    setProductExpanded(row, false);
  });
  const editor = row.querySelector('[data-role="product-editor"]');
  editor.addEventListener("close", () => {
    row.dataset.expanded = "false";
    row.querySelector('[data-action="toggle-product"]').setAttribute("aria-expanded", "false");
  });
  editor.addEventListener("click", (event) => {
    if (event.target === editor) setProductExpanded(row, false);
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
    });
  productList.append(row);
  updateProductTitles();
  if (openEditor) setProductExpanded(row, true);
  if (existingRows.length) {
    requestAnimationFrame(() => {
      row.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }
  return row;
}

addProductButton.addEventListener("click", () => addProductRow());
loopCount.addEventListener("change", updateJobSummary);
addProductRow({ openEditor: false });

function isSupportedImage(file) {
  return Boolean(file) && (
    ["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    /\.(?:jpe?g|png|webp)$/i.test(file.name)
  );
}

function rowHasProductData(row) {
  return Boolean(
    row.querySelector('[data-role="image-input"]').files[0] ||
    row.querySelector('[data-role="image-prompt"]').value.trim() ||
    row.querySelector('[data-role="video-prompt"]').value.trim()
  );
}

function assignImageToProductRow(row, file) {
  const imageInput = row.querySelector('[data-role="image-input"]');
  const transfer = new DataTransfer();
  transfer.items.add(file);
  imageInput.files = transfer.files;
  row.dataset.productName = file.name.replace(/\.[^.]+$/, "") || file.name;
  updateProductPreview(row, file);
  updateProductRowState(row);
}

function importImageFiles(files) {
  const supportedFiles = [...files]
    .filter(isSupportedImage)
    .sort((left, right) => left.name.localeCompare(right.name, "th", { numeric: true }));
  const oversizedFiles = supportedFiles.filter((file) => file.size > MAX_IMAGE_SIZE_BYTES);
  const usableFiles = supportedFiles.filter((file) => file.size <= MAX_IMAGE_SIZE_BYTES);
  const availableSlots = MAX_PRODUCTS - [...productList.querySelectorAll(".product-row")]
    .filter(rowHasProductData).length;
  const filesToImport = usableFiles.slice(0, Math.max(0, availableSlots));
  let imported = 0;

  for (const file of filesToImport) {
    let targetRow = [...productList.querySelectorAll(".product-row")]
      .find((row) => !rowHasProductData(row));
    if (!targetRow) targetRow = addProductRow({ openEditor: false });
    if (!targetRow) break;
    assignImageToProductRow(targetRow, file);
    imported += 1;
  }

  updateProductTitles();
  const skippedForLimit = Math.max(0, usableFiles.length - imported);
  const messages = [`เพิ่ม ${imported} รูปเป็น ${imported} สินค้าแล้ว`];
  if (oversizedFiles.length) messages.push(`ข้าม ${oversizedFiles.length} รูปที่เกิน 20 MB`);
  if (skippedForLimit) messages.push(`ข้าม ${skippedForLimit} รูปเพราะครบ ${MAX_PRODUCTS} สินค้า`);
  if (!supportedFiles.length) messages[0] = "ไม่พบไฟล์ JPG, PNG หรือ WEBP ที่รองรับ";
  imageBatchStatus.textContent = messages.join(" · ");
  imageBatchStatus.dataset.state = imported ? "success" : "error";
  if (imported) {
    productList.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

function readDirectoryEntry(entry) {
  return new Promise((resolve) => {
    const reader = entry.createReader();
    const entries = [];
    const readBatch = () => {
      reader.readEntries((batch) => {
        if (!batch.length) {
          resolve(entries);
          return;
        }
        entries.push(...batch);
        readBatch();
      }, () => resolve(entries));
    };
    readBatch();
  });
}

function readFileEntry(entry) {
  return new Promise((resolve) => entry.file(resolve, () => resolve(null)));
}

async function collectDroppedEntryFiles(entry) {
  if (!entry) return [];
  if (entry.isFile) {
    const file = await readFileEntry(entry);
    return file ? [file] : [];
  }
  if (!entry.isDirectory) return [];
  const children = await readDirectoryEntry(entry);
  const nestedFiles = await Promise.all(children.map(collectDroppedEntryFiles));
  return nestedFiles.flat();
}

chooseMultipleImagesButton?.addEventListener("click", () => multipleImageInput.click());
chooseImageFolderButton?.addEventListener("click", () => imageFolderInput.click());
multipleImageInput?.addEventListener("change", () => {
  importImageFiles(multipleImageInput.files || []);
  multipleImageInput.value = "";
});
imageFolderInput?.addEventListener("change", () => {
  importImageFiles(imageFolderInput.files || []);
  imageFolderInput.value = "";
});
imageBatchDropzone?.addEventListener("click", (event) => {
  if (!event.target.closest("button")) multipleImageInput.click();
});
imageBatchDropzone?.addEventListener("keydown", (event) => {
  if (event.target.closest("button")) return;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    multipleImageInput.click();
  }
});
for (const eventName of ["dragenter", "dragover"]) {
  imageBatchDropzone?.addEventListener(eventName, (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    imageBatchDropzone.classList.add("is-dragging");
  });
}
for (const eventName of ["dragleave", "drop"]) {
  imageBatchDropzone?.addEventListener(eventName, () => {
    imageBatchDropzone.classList.remove("is-dragging");
  });
}
imageBatchDropzone?.addEventListener("drop", async (event) => {
  event.preventDefault();
  const items = [...(event.dataTransfer.items || [])];
  const entries = items.map((item) => item.webkitGetAsEntry?.()).filter(Boolean);
  imageBatchStatus.textContent = "กำลังอ่านรูปจากรายการที่วาง…";
  imageBatchStatus.dataset.state = "working";
  const droppedFiles = entries.length
    ? (await Promise.all(entries.map(collectDroppedEntryFiles))).flat()
    : [...(event.dataTransfer.files || [])];
  importImageFiles(droppedFiles);
});

function focusProductField(row, field) {
  setProductExpanded(row, true);
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
