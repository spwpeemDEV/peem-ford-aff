const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024;

const versionLabel = document.querySelector("#versionLabel");
const startButton = document.querySelector("#startPrompt");
const status = document.querySelector("#status");
const statusCard = document.querySelector("#statusCard");
const statusPercent = document.querySelector("#statusPercent");
const statusProgress = document.querySelector("#statusProgress");
const imageInput = document.querySelector("#imageInput");
const imagePreview = document.querySelector("#imagePreview");
const uploadIcon = document.querySelector("#uploadIcon");
const imagePrompt = document.querySelector("#imagePrompt");
const videoPrompt = document.querySelector("#videoPrompt");
const outputCount = document.querySelector("#outputCount");
const fileName = document.querySelector("#fileName");
const cancelButton = document.querySelector("#cancelAutomation");
const syncTiktokBtn = document.querySelector("#syncTiktokBtn");
const cancelSyncBtn = document.querySelector("#cancelSyncBtn");
const clearSyncBtn = document.querySelector("#clearSyncBtn");
const syncMaxPages = document.querySelector("#syncMaxPages");
const tiktokIdOutput = document.querySelector("#tiktokIdOutput");
const tiktokSyncStatus = document.querySelector("#tiktokSyncStatus");

let activeTabId = null;
let imagePreviewUrl = null;

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

function updateImagePreview(file) {
  if (imagePreviewUrl) {
    URL.revokeObjectURL(imagePreviewUrl);
    imagePreviewUrl = null;
  }

  if (!file) {
    imagePreview.hidden = true;
    imagePreview.removeAttribute("src");
    uploadIcon.hidden = false;
    fileName.textContent = "เลือกรูปภาพ";
    return;
  }

  imagePreviewUrl = URL.createObjectURL(file);
  imagePreview.src = imagePreviewUrl;
  imagePreview.hidden = false;
  uploadIcon.hidden = true;
  fileName.textContent = file.name;
}

imageInput.addEventListener("change", () => {
  updateImagePreview(imageInput.files[0]);
});

startButton.addEventListener("click", async () => {
  const [imageFile] = imageInput.files;
  const prompt = imagePrompt.value.trim();
  const requestedVideoPrompt = videoPrompt.value.trim();
  const requestedOutputCount = Number(outputCount.value);

  if (!imageFile) {
    setStatus("กรุณาเลือกรูปภาพอ้างอิง", { state: "error" });
    imageInput.focus();
    return;
  }

  if (imageFile.size > MAX_IMAGE_SIZE_BYTES) {
    setStatus("รูปภาพต้องมีขนาดไม่เกิน 20 MB", { state: "error" });
    imageInput.focus();
    return;
  }

  if (!prompt) {
    setStatus("กรุณาใส่ Image Prompt", { state: "error" });
    imagePrompt.focus();
    return;
  }

  if (!requestedVideoPrompt) {
    setStatus("กรุณาใส่ Video Prompt", { state: "error" });
    videoPrompt.focus();
    return;
  }

  startButton.disabled = true;
  setStatus("กำลังเตรียมรูปภาพ…", { progress: 1 });
  const jobId = crypto.randomUUID();
  const jobKey = `flowJob:${jobId}`;

  try {
    const dataUrl = await readFileAsDataUrl(imageFile);
    await chrome.storage.local.set({
      [jobKey]: {
        prompt,
        videoPrompt: requestedVideoPrompt,
        outputCount: [1, 2, 3, 4].includes(requestedOutputCount)
          ? requestedOutputCount
          : 1,
        image: {
          name: imageFile.name,
          type: imageFile.type || "image/png",
          dataUrl,
        },
      },
    });

    setStatus("กำลังเปิด Flow เพื่อสร้างรูปและวิดีโอ…", { progress: 2 });
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
  if (imagePreviewUrl) {
    URL.revokeObjectURL(imagePreviewUrl);
  }
});
