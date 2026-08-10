(() => {
  const TIMING = Object.freeze({
    AUTOMATION_TIMEOUT_MS: 3 * 60 * 1000,
    RETRY_INTERVAL_MS: 500,
    CLICK_DELAY_MS: 200,
    PROJECT_SETTLE_DELAY_MS: 3500,
    UPLOAD_TIMEOUT_MS: 90 * 1000,
    UPLOAD_HARD_SETTLE_MS: 25 * 1000,
    INGREDIENT_SETTLE_DELAY_MS: 4500,
    PROMPT_VERIFY_DELAY_MS: 1200,
    IMAGE_GENERATION_TIMEOUT_MS: 5 * 60 * 1000,
    IMAGE_GENERATION_MIN_WAIT_MS: 20 * 1000,
    IMAGE_GENERATION_REPEAT_MIN_WAIT_MS: 45 * 1000,
    IMAGE_GENERATION_FALLBACK_MS: 2 * 60 * 1000,
    VIDEO_GENERATION_TIMEOUT_MS: 10 * 60 * 1000,
    VIDEO_GENERATION_MIN_WAIT_MS: 30 * 1000,
    VIDEO_GENERATION_FALLBACK_MS: 3 * 60 * 1000,
  });

  const LABELS = Object.freeze({
    NEW_PROJECT: [/new project/i, /create project/i, /สร้างโปรเจกต์ใหม่/i, /โปรเจกต์ใหม่/i],
    ENTER_FLOW: [/create with google flow/i, /เริ่มสร้างด้วย google flow/i],
    DIRECT_UPLOAD: [
      /upload image/i,
      /upload media/i,
      /upload file/i,
      /อัปโหลดรูป/i,
      /อัปโหลดไฟล์/i,
    ],
    ADD_REFERENCE: [
      /add ingredient/i,
      /add reference/i,
      /add media/i,
      /add image/i,
      /เพิ่มรูป/i,
      /เพิ่มข้อมูลอ้างอิง/i,
      /^add$/i,
      /^เพิ่ม$/i,
    ],
    ADD_TO_PROMPT: [
      /^add to prompt$/i,
      /เพิ่มลงใน prompt/i,
      /เพิ่มไปยัง prompt/i,
    ],
    IMAGE_MODE: [/^image$/i, /^รูปภาพ$/i],
    VIDEO_MODE: [/\bvideo\b/i, /วิดีโอ/i],
    FRAMES_MODE: [/^frames?$/i, /^เฟรม$/i],
    PORTRAIT_RATIO: [/^9\s*:\s*16$/i],
    IMAGE_MODEL: [/nano banana 2/i, /banana 2/i],
    VIDEO_MODEL: [
      /veo\s*3\.1\s*-?\s*lite\s*\[?lower priority\]?/i,
      /veo\s*3\.1.*lite/i,
    ],
    VIDEO_DURATION: [/^8\s*s$/i, /^8\s*sec(?:ond)?s?$/i],
  });

  function getOutputCountLabels(outputCount) {
    return [new RegExp(`^x\\s*${outputCount}$`, "i")];
  }

  globalThis.FlowLauncherConfig = Object.freeze({
    LABELS,
    TIMING,
    getOutputCountLabels,
  });
})();
