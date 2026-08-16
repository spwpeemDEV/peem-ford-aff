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
const downloadBasketCsvTemplateButton = document.querySelector("#downloadBasketCsvTemplate");
const importBasketCsvButton = document.querySelector("#importBasketCsv");
const basketCsvInput = document.querySelector("#basketCsvInput");
const basketCsvStatus = document.querySelector("#basketCsvStatus");
const clearBasketCsvButton = document.querySelector("#clearBasketCsv");
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
const basketDailyScheduleField = document.querySelector("#basketDailyScheduleField");
const basketDailyPlanList = document.querySelector("#basketDailyPlanList");
const basketDailyAllocatedCount = document.querySelector("#basketDailyAllocatedCount");
const basketDailyPlanStatus = document.querySelector("#basketDailyPlanStatus");
const addBasketDailyPlanButton = document.querySelector("#addBasketDailyPlan");
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
let basketCsvMetadata = new Map();
let syncedProducts = [];
let selectedBasketProduct = null;
let basketFlowRunning = false;
let basketQueue = [];
let nextBasketQueueId = 1;
let basketDailyPlans = [];
let nextBasketDailyPlanId = 1;

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
  const mode = getBasketPublishMode();
  if (mode === "now") return true;
  if (mode === "daily") return dailyPlanConfigIsValid();
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

function toLocalDateInputValue(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function getDailyPlanStartTimestamp(plan) {
  if (!plan?.date || !/^\d{2}:\d{2}$/.test(plan.startTime || "")) return NaN;
  return new Date(`${plan.date}T${plan.startTime}`).getTime();
}

function getDailyPlanEndTimestamp(plan) {
  const startTimestamp = getDailyPlanStartTimestamp(plan);
  if (!Number.isFinite(startTimestamp)) return NaN;
  return startTimestamp + (Number(plan.clipCount) - 1) * Number(plan.intervalMinutes) * 60 * 1000;
}

function getDailyPlanValidationMessage(plan) {
  const startTimestamp = getDailyPlanStartTimestamp(plan);
  const clipCount = Number(plan?.clipCount);
  const intervalMinutes = Number(plan?.intervalMinutes);
  if (!Number.isFinite(startTimestamp)) return "กรุณาเลือกวันที่และเวลาเริ่ม";
  if (startTimestamp <= Date.now()) return "เวลาเริ่มต้องอยู่ในอนาคต";
  const startMinute = Number(String(plan.startTime).split(":")[1]);
  if (!Number.isInteger(startMinute) || startMinute % 5 !== 0) {
    return "เวลาเริ่มต้องลงท้าย 00, 05, 10…";
  }
  if (!Number.isInteger(clipCount) || clipCount < 1 || clipCount > MAX_BATCH_VIDEOS) {
    return `จำนวนคลิปต้องอยู่ระหว่าง 1-${MAX_BATCH_VIDEOS}`;
  }
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 5 || intervalMinutes % 5 !== 0) {
    return "ระยะห่างต้องอย่างน้อย 5 นาที และหาร 5 ลงตัว";
  }
  const endTimestamp = getDailyPlanEndTimestamp(plan);
  if (toLocalDateInputValue(new Date(endTimestamp)) !== plan.date) {
    return "เวลาคลิปสุดท้ายข้ามวัน กรุณาลดจำนวนคลิปหรือระยะห่าง";
  }
  return "";
}

function dailyPlanConfigIsValid() {
  if (!basketDailyPlans.length) return false;
  if (basketDailyPlans.some((plan) => getDailyPlanValidationMessage(plan))) return false;
  return new Set(basketDailyPlans.map((plan) => plan.date)).size === basketDailyPlans.length;
}

function getDailyPlanSlots() {
  if (!dailyPlanConfigIsValid()) return [];
  const orderedPlans = [...basketDailyPlans].sort(
    (left, right) => getDailyPlanStartTimestamp(left) - getDailyPlanStartTimestamp(right),
  );
  return orderedPlans.flatMap((plan) => {
    const startTimestamp = getDailyPlanStartTimestamp(plan);
    return Array.from({ length: Number(plan.clipCount) }, (_, index) => ({
      planId: plan.id,
      timestamp: startTimestamp + index * Number(plan.intervalMinutes) * 60 * 1000,
    }));
  });
}

function dailyPlanMatchesQueue() {
  return dailyPlanConfigIsValid() && getDailyPlanSlots().length === basketQueue.length;
}

function queueScheduleIsValid() {
  if (!scheduleIsValid() || !basketIntervalIsValid()) return false;
  return getBasketPublishMode() !== "daily" || dailyPlanMatchesQueue();
}

function getQueueScheduleTimestamp(index) {
  const mode = getBasketPublishMode();
  if (mode === "schedule") {
    return getScheduleTimestamp() + index * getBasketIntervalMinutes() * 60 * 1000;
  }
  if (mode === "daily") return getDailyPlanSlots()[index]?.timestamp ?? NaN;
  return NaN;
}

function getTikTokPublishMode() {
  return getBasketPublishMode() === "now" ? "now" : "schedule";
}

function createDefaultDailyPlan() {
  const existingDates = basketDailyPlans
    .map((plan) => new Date(`${plan.date}T00:00:00`))
    .filter((date) => Number.isFinite(date.getTime()));
  const date = existingDates.length
    ? new Date(Math.max(...existingDates.map((value) => value.getTime())))
    : new Date();
  date.setDate(date.getDate() + 1);
  const allocated = basketDailyPlans.reduce((total, plan) => total + Number(plan.clipCount || 0), 0);
  const remaining = Math.max(0, basketQueue.length - allocated);
  return {
    id: nextBasketDailyPlanId++,
    date: toLocalDateInputValue(date),
    clipCount: remaining ? Math.min(10, remaining) : 10,
    startTime: "07:00",
    intervalMinutes: 90,
  };
}

function renderBasketDailyPlanStatus() {
  if (!basketDailyPlanStatus) return;
  const allocated = basketDailyPlans.reduce((total, plan) => total + Number(plan.clipCount || 0), 0);
  basketDailyAllocatedCount.textContent = `${allocated} ช่อง`;
  if (!dailyPlanConfigIsValid()) {
    const duplicateDates = new Set(basketDailyPlans.map((plan) => plan.date)).size !== basketDailyPlans.length;
    basketDailyPlanStatus.textContent = duplicateDates
      ? "พบวันที่ซ้ำ กรุณารวมจำนวนคลิปไว้ในแถวเดียวกัน"
      : "กรุณาตรวจข้อมูลแผนรายวันที่มีกรอบสีแดง";
    basketDailyPlanStatus.dataset.state = "error";
    return;
  }
  if (!basketQueue.length) {
    basketDailyPlanStatus.textContent = `เตรียมไว้ ${allocated} ช่อง · เพิ่มคลิปลงคิวเพื่อเริ่มจับคู่เวลา`;
    basketDailyPlanStatus.dataset.state = "warning";
    return;
  }
  const difference = allocated - basketQueue.length;
  if (difference === 0) {
    basketDailyPlanStatus.textContent = `พร้อมใช้งาน · ${basketQueue.length} คลิปตรงกับ ${allocated} ช่องเวลา`;
    basketDailyPlanStatus.dataset.state = "success";
  } else if (difference > 0) {
    basketDailyPlanStatus.textContent = `ยังขาด ${difference} คลิป · มี ${allocated} ช่อง แต่คิวมี ${basketQueue.length} คลิป`;
    basketDailyPlanStatus.dataset.state = "warning";
  } else {
    basketDailyPlanStatus.textContent = `ยังไม่ได้จัดเวลา ${Math.abs(difference)} คลิป · เพิ่มจำนวนคลิปหรือเพิ่มวัน`;
    basketDailyPlanStatus.dataset.state = "error";
  }
}

function renderBasketDailyPlans() {
  if (!basketDailyPlanList) return;
  basketDailyPlans.sort((left, right) =>
    `${left.date}T${left.startTime}`.localeCompare(`${right.date}T${right.startTime}`),
  );
  basketDailyPlanList.replaceChildren();
  basketDailyPlans.forEach((plan, index) => {
    const validationMessage = getDailyPlanValidationMessage(plan);
    const endTimestamp = getDailyPlanEndTimestamp(plan);
    const row = document.createElement("article");
    row.className = "basket-daily-plan-row";
    row.dataset.state = validationMessage ? "error" : "ready";
    row.innerHTML = `
      <div class="basket-daily-plan-heading">
        <span>
          <small>DAY ${String(index + 1).padStart(2, "0")}</small>
          <strong>${validationMessage || `${plan.clipCount} คลิป · ${plan.startTime}–${new Date(endTimestamp).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}`}</strong>
        </span>
        <button class="basket-daily-remove" type="button" aria-label="ลบวันที่ ${plan.date}" ${basketDailyPlans.length === 1 ? "disabled" : ""}>×</button>
      </div>
      <div class="basket-daily-plan-grid">
        <label><span>วันที่โพสต์</span><input data-field="date" type="date" min="${toLocalDateInputValue(new Date())}" value="${plan.date}" /></label>
        <label><span>จำนวนคลิป</span><input data-field="clipCount" type="number" min="1" max="${MAX_BATCH_VIDEOS}" step="1" value="${plan.clipCount}" /></label>
        <label><span>เวลาเริ่ม</span><input data-field="startTime" type="time" step="300" value="${plan.startTime}" /></label>
        <label><span>เว้นทุก</span><input data-field="intervalMinutes" type="number" min="5" step="5" value="${plan.intervalMinutes}" /></label>
      </div>
      <div class="basket-daily-plan-result" data-state="${validationMessage ? "error" : "ready"}">
        ${validationMessage || `คลิปสุดท้ายเวลา ${new Date(endTimestamp).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} · ไม่ข้ามวัน`}
      </div>`;

    row.querySelectorAll("input[data-field]").forEach((input) => {
      input.addEventListener("change", () => {
        const field = input.dataset.field;
        plan[field] = input.type === "number" ? Number(input.value) : input.value;
        renderBasketDailyPlans();
        updateBasketBundle();
      });
    });
    row.querySelector(".basket-daily-remove")?.addEventListener("click", () => {
      if (basketDailyPlans.length === 1) return;
      basketDailyPlans = basketDailyPlans.filter((item) => item.id !== plan.id);
      renderBasketDailyPlans();
      updateBasketBundle();
    });
    basketDailyPlanList.appendChild(row);
  });
  renderBasketDailyPlanStatus();
}

function addBasketDailyPlan() {
  basketDailyPlans.push(createDefaultDailyPlan());
  renderBasketDailyPlans();
  updateBasketBundle();
}

function updatePostTimeUi({ setDefault = false } = {}) {
  const mode = getBasketPublishMode();
  for (const input of basketPublishModeInputs) {
    input.closest(".post-time-option")?.classList.toggle("is-selected", input.checked);
  }
  basketScheduleField.hidden = mode !== "schedule";
  basketDailyScheduleField.hidden = mode !== "daily";
  basketScheduleAt.required = mode === "schedule";
  if (mode === "schedule" && setDefault && !basketScheduleAt.value) {
    const defaultTime = new Date(Date.now() + 30 * 60 * 1000);
    defaultTime.setMinutes(Math.ceil(defaultTime.getMinutes() / 5) * 5, 0, 0);
    basketScheduleAt.value = toLocalDateTimeInputValue(defaultTime);
  }
  if (mode === "daily" && !basketDailyPlans.length) {
    basketDailyPlans.push(createDefaultDailyPlan());
  }
  renderBasketDailyPlans();
  updateBasketBundle();
}

function getQueueScheduleValue(index) {
  if (getBasketPublishMode() === "now") return "";
  const timestamp = getQueueScheduleTimestamp(index);
  if (!Number.isFinite(timestamp)) return "";
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
    const queueScheduleValue = getQueueScheduleValue(index);
    const scheduleText = getBasketPublishMode() === "now"
      ? "โพสต์ทันที"
      : queueScheduleValue
        ? new Date(queueScheduleValue).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })
        : "ยังไม่ได้จัดเวลา";
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
    basketFlowRunning || !basketQueue.length || !queueScheduleIsValid();
  startBasketQueueButton.dataset.running = String(basketFlowRunning);
  renderBasketDailyPlanStatus();
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
  const contentReady = [
    Boolean(file),
    Boolean(caption),
    Boolean(selectedBasketProduct),
  ].every(Boolean);
  const directTimingReady = timingReady && (
    getBasketPublishMode() !== "daily" || getDailyPlanSlots().length === 1
  );
  startBasketFlowButton.disabled = basketFlowRunning || !contentReady || !directTimingReady;
  startBasketFlowButton.dataset.running = String(basketFlowRunning);
  addBasketQueueItemButton.disabled = basketFlowRunning || !contentReady || !timingReady;
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
addBasketDailyPlanButton?.addEventListener("click", addBasketDailyPlan);

function isSupportedVideo(file) {
  return Boolean(file) && (
    ["video/mp4", "video/quicktime", "video/webm"].includes(file.type) ||
    /\.(?:mp4|mov|webm)$/i.test(file.name)
  );
}

function normalizeBasketVideoFileName(fileName) {
  return String(fileName || "")
    .trim()
    .replace(/^.*[\\/]/, "")
    .normalize("NFC")
    .toLocaleLowerCase("en-US");
}

function getBasketSourceVideos() {
  const files = [
    ...basketQueue.map((item) => item.file),
    basketVideoInput?.files?.[0],
    ...pendingBasketVideos,
  ].filter(Boolean);
  const seen = new Set();
  return files.filter((file) => {
    const fingerprint = `${normalizeBasketVideoFileName(file.name)}:${file.size}:${file.lastModified}`;
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
      continue;
    }
    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell.replace(/\r$/, ""));
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  row.push(cell.replace(/\r$/, ""));
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function normalizeCsvHeader(header) {
  return String(header || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[\s-]+/g, "_");
}

function findCsvColumn(headers, aliases) {
  return headers.findIndex((header) => aliases.includes(header));
}

function parseBasketCsv(text) {
  const rows = parseCsvRows(text);
  if (rows.length < 2) throw new Error("CSV ไม่มีข้อมูลคลิป");
  const headers = rows.shift().map(normalizeCsvHeader);
  const fileIndex = findCsvColumn(headers, ["video_file", "file_name", "filename", "video", "ชื่อไฟล์", "ไฟล์วิดีโอ"]);
  const captionIndex = findCsvColumn(headers, ["caption", "description", "ข้อความ", "คำอธิบาย"]);
  const hashtagsIndex = findCsvColumn(headers, ["hashtags", "hashtag", "แฮชแท็ก"]);
  const productIdIndex = findCsvColumn(headers, ["product_id", "productid", "รหัสสินค้า"]);
  if (fileIndex < 0) throw new Error('ไม่พบคอลัมน์ "video_file"');

  return rows.map((values, index) => ({
    rowNumber: index + 2,
    fileName: values[fileIndex]?.trim() || "",
    caption: captionIndex >= 0 ? values[captionIndex]?.trim() || "" : "",
    hashtags: hashtagsIndex >= 0 ? values[hashtagsIndex]?.trim() || "" : "",
    productId: productIdIndex >= 0 ? values[productIdIndex]?.trim() || "" : "",
  })).filter((entry) => entry.fileName);
}

async function readCsvText(file) {
  const bytes = await file.arrayBuffer();
  const utf8Text = new TextDecoder("utf-8").decode(bytes);
  if (!utf8Text.includes("\uFFFD")) return utf8Text;
  try {
    return new TextDecoder("windows-874").decode(bytes);
  } catch {
    return utf8Text;
  }
}

function joinBasketCaption(caption, hashtags) {
  return [caption.trim(), hashtags.trim()].filter(Boolean).join("\n\n").slice(0, 4000);
}

function getCsvMetadataForVideo(file) {
  return basketCsvMetadata.get(normalizeBasketVideoFileName(file?.name)) || null;
}

function setBasketCaptionValue(value) {
  basketCaption.value = value;
  basketCaptionCount.textContent = `${basketCaption.value.length} / 4000`;
}

function applyCsvMetadataToCurrentVideo(file, { announce = true } = {}) {
  const metadata = getCsvMetadataForVideo(file);
  if (!metadata) return false;

  setBasketCaptionValue(joinBasketCaption(metadata.caption, metadata.hashtags));
  let productMatched = false;
  if (metadata.productId) {
    const product = syncedProducts.find((item) => String(item.id) === metadata.productId) || null;
    selectedBasketProduct = product;
    updateSelectedProductCard();
    renderSyncedProducts();
    productMatched = Boolean(product);
  }

  if (announce) {
    const productMessage = metadata.productId
      ? productMatched
        ? ` · เลือก Product ID ${metadata.productId} แล้ว`
        : ` · ยังไม่พบ Product ID ${metadata.productId} ใน TikTok Sync`
      : "";
    basketStatus.textContent = `เติมข้อมูล CSV ให้ ${file.name} แล้ว${productMessage}`;
    basketStatus.dataset.state = metadata.productId && !productMatched ? "error" : "success";
  }
  updateBasketBundle();
  return true;
}

function updateBasketCsvStatus() {
  const files = getBasketSourceVideos();
  const matchedCount = files.filter((file) => getCsvMetadataForVideo(file)).length;
  basketCsvStatus.textContent = basketCsvMetadata.size
    ? `CSV ${basketCsvMetadata.size} แถว · จับคู่คลิปแล้ว ${matchedCount}/${files.length}`
    : "ยังไม่ได้นำเข้า CSV";
  basketCsvStatus.dataset.state = basketCsvMetadata.size ? (matchedCount ? "ready" : "warning") : "empty";
  clearBasketCsvButton.hidden = !basketCsvMetadata.size;
}

function downloadBasketCsvTemplate() {
  const files = getBasketSourceVideos();
  if (!files.length) {
    basketStatus.textContent = "กรุณานำเข้าวิดีโอก่อนดาวน์โหลด CSV Template";
    basketStatus.dataset.state = "error";
    return;
  }
  const lines = ["video_file,caption,hashtags,product_id"];
  for (const file of files) {
    const metadata = getCsvMetadataForVideo(file) || {};
    lines.push([
      file.name,
      metadata.caption || "",
      metadata.hashtags || "",
      metadata.productId || "",
    ].map(csvCell).join(","));
  }
  const blob = new Blob(["\uFEFF", lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `flow-tiktok-template-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  basketStatus.textContent = `ดาวน์โหลด CSV Template สำหรับ ${files.length} คลิปแล้ว`;
  basketStatus.dataset.state = "success";
}

async function importBasketCsvFile(file) {
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) throw new Error("ไฟล์ CSV ต้องมีขนาดไม่เกิน 2 MB");
  const entries = parseBasketCsv(await readCsvText(file));
  const nextMetadata = new Map();
  let duplicateCount = 0;
  for (const entry of entries) {
    const key = normalizeBasketVideoFileName(entry.fileName);
    if (nextMetadata.has(key)) duplicateCount += 1;
    nextMetadata.set(key, entry);
  }
  basketCsvMetadata = nextMetadata;
  renderPendingBasketVideos();
  updateBasketCsvStatus();
  const currentFile = basketVideoInput?.files?.[0] || null;
  if (currentFile) applyCsvMetadataToCurrentVideo(currentFile, { announce: false });

  const files = getBasketSourceVideos();
  const matchedCount = files.filter((video) => getCsvMetadataForVideo(video)).length;
  const missingCount = Math.max(0, files.length - matchedCount);
  const messages = [`นำเข้า CSV ${entries.length} แถว`, `จับคู่ ${matchedCount}/${files.length} คลิป`];
  if (missingCount) messages.push(`ไม่พบข้อมูล ${missingCount} คลิป`);
  if (duplicateCount) messages.push(`พบชื่อซ้ำ ${duplicateCount} แถวและใช้แถวล่าสุด`);
  basketStatus.textContent = messages.join(" · ");
  basketStatus.dataset.state = matchedCount ? (missingCount ? "ready" : "success") : "error";
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
  applyCsvMetadataToCurrentVideo(file, { announce: Boolean(announce && getCsvMetadataForVideo(file)) });
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
    meta.textContent = getCsvMetadataForVideo(file)
      ? `${formatFileSize(file.size)} · CSV พร้อม`
      : formatFileSize(file.size);
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
  updateBasketCsvStatus();
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
downloadBasketCsvTemplateButton?.addEventListener("click", downloadBasketCsvTemplate);
importBasketCsvButton?.addEventListener("click", () => basketCsvInput.click());
basketCsvInput?.addEventListener("change", async () => {
  const file = basketCsvInput.files?.[0] || null;
  basketCsvInput.value = "";
  if (!file) return;
  basketCsvStatus.textContent = "กำลังอ่านและจับคู่ CSV…";
  basketCsvStatus.dataset.state = "working";
  try {
    await importBasketCsvFile(file);
  } catch (error) {
    basketCsvStatus.textContent = `นำเข้า CSV ไม่สำเร็จ: ${String(error)}`;
    basketCsvStatus.dataset.state = "error";
    basketStatus.textContent = `นำเข้า CSV ไม่สำเร็จ: ${String(error)}`;
    basketStatus.dataset.state = "error";
  }
});
clearBasketCsvButton?.addEventListener("click", () => {
  basketCsvMetadata = new Map();
  renderPendingBasketVideos();
  updateBasketCsvStatus();
  basketStatus.textContent = "ล้างข้อมูล CSV แล้ว ข้อมูลที่เติมในชุดงานปัจจุบันยังคงอยู่และแก้ไขต่อได้";
  basketStatus.dataset.state = "ready";
});
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
    publishMode: getTikTokPublishMode(),
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
  if (!queueScheduleIsValid()) {
    basketStatus.textContent = getBasketPublishMode() === "daily"
      ? "จำนวนช่องในแผนรายวันต้องตรงกับจำนวนคลิป และทุกเวลาต้องถูกต้องก่อนเริ่ม"
      : "กรุณาตรวจสอบเวลาเริ่มต้นและระยะห่างของแต่ละคลิป";
    basketStatus.dataset.state = "error";
    return;
  }

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
      const scheduledAt = getQueueScheduleValue(index);
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

  const selectedPublishMode = getBasketPublishMode();
  if (selectedPublishMode === "daily" && getDailyPlanSlots().length !== 1) {
    basketStatus.textContent = "โหมดรายวันสำหรับหลายคลิป กรุณาเพิ่มคลิปลงคิวแล้วกดเริ่มโพสต์ทุกคลิปตามคิว";
    basketStatus.dataset.state = "error";
    basketDailyScheduleField.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  const publishMode = getTikTokPublishMode();
  const scheduledAt = getQueueScheduleValue(0);
  if (!scheduleIsValid()) {
    basketStatus.textContent = "กรุณาเลือกเวลาในอนาคต โดยนาทีต้องลงท้าย 00, 05, 10…";
    basketStatus.dataset.state = "error";
    if (selectedPublishMode === "schedule") basketScheduleAt.focus();
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
