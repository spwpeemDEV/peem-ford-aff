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

let activeTabId = null;
let nextProductId = 1;
const previewUrls = new Map();
const MAX_PRODUCTS = 10;

versionLabel.textContent = `v${chrome.runtime.getManifest().version}`;

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

  if (!tab.url.includes("tiktok.com")) {
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

  tiktokSyncStatus.style.display = "block";
  tiktokSyncStatus.textContent = `กำลังเริ่มดึงข้อมูล (ตั้งเป้า ${maxPagesValue} หน้า)...`;
  tiktokSyncStatus.style.color = "#60a5fa";

  tiktokIdOutput.innerHTML = "";
  tiktokIdOutput.style.display = "flex";
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
      tiktokSyncStatus.style.color = "#f87171";
      return;
    }

    if (response && response.status === "done") {
      tiktokSyncStatus.textContent = `ดึงข้อมูลเสร็จสมบูรณ์! ได้ทั้งหมด ${globalItemCount} รายการ`;
      tiktokSyncStatus.style.color = "#4ade80";
    } else if (response && response.status === "cancelled") {
      tiktokSyncStatus.textContent = `ยกเลิกแล้ว! ได้มาทั้งหมด ${globalItemCount} รายการ`;
      tiktokSyncStatus.style.color = "#fbbf24";
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
  tiktokIdOutput.innerHTML = "";
  tiktokIdOutput.style.display = "none";
  tiktokSyncStatus.style.display = "none";
  tiktokSyncStatus.textContent = "";
  globalItemCount = 0;
});

// ฟังก์ชันนี้มีแค่ตัวเดียวแล้ว! จะไม่ทำให้ข้อมูลเบิ้ลซ้ำอีก
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "TIKTOK_SCRAPE_CHUNK") {
    const products = message.data;

    tiktokSyncStatus.textContent = `กำลังกวาดหน้า ${message.page}... ได้มาแล้ว ${message.total} รายการ`;

    products.forEach((product) => {
      globalItemCount++;

      const item = document.createElement("div");
      item.style.display = "flex";
      item.style.alignItems = "center";
      item.style.gap = "12px";
      item.style.padding = "10px";
      item.style.background = "var(--bg-surface-elevated, #27272a)";
      item.style.borderRadius = "8px";
      item.style.border = "1px solid var(--border-subtle, #3f3f46)";

      const num = document.createElement("div");
      num.textContent = `${globalItemCount}.`;
      num.style.color = "#a1a1aa";
      num.style.fontSize = "14px";
      num.style.fontWeight = "bold";
      num.style.minWidth = "28px";
      num.style.textAlign = "right";

      const img = document.createElement("img");
      img.src = product.imgUrl || "";
      img.style.width = "48px";
      img.style.height = "48px";
      img.style.objectFit = "cover";
      img.style.borderRadius = "6px";
      img.style.backgroundColor = "#3f3f46";

      const details = document.createElement("div");
      details.style.flex = "1";
      details.style.minWidth = "0";

      const name = document.createElement("div");
      let cleanName = product.name.replace(product.id, '').trim();
      name.textContent = cleanName;
      name.title = cleanName;
      name.style.fontSize = "13px";
      name.style.color = "#e4e4e7";
      name.style.fontWeight = "500";
      name.style.whiteSpace = "nowrap";
      name.style.overflow = "hidden";
      name.style.textOverflow = "ellipsis";
      name.style.marginBottom = "4px";

      const id = document.createElement("div");
      id.textContent = `ID: ${product.id}`;
      id.style.fontSize = "11px";
      id.style.color = "#60a5fa";

      details.appendChild(name);
      details.appendChild(id);

      item.appendChild(num);
      item.appendChild(img);
      item.appendChild(details);

      tiktokIdOutput.appendChild(item);
    });

    tiktokIdOutput.scrollTop = tiktokIdOutput.scrollHeight;
  }
});

window.addEventListener("unload", () => {
  for (const url of previewUrls.values()) {
    URL.revokeObjectURL(url);
  }
  previewUrls.clear();
});
