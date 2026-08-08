const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024;

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

let activeTabId = null;
let imagePreviewUrl = null;

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

window.addEventListener("unload", () => {
  if (imagePreviewUrl) {
    URL.revokeObjectURL(imagePreviewUrl);
  }
});
