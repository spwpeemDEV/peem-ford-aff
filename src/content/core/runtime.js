(() => {
  const STAGES = Object.freeze({
    IDLE: "IDLE",
    PROJECT_SETUP: "PROJECT_SETUP",
    IMAGE_SETUP: "IMAGE_SETUP",
    SOURCE_MEDIA: "SOURCE_MEDIA",
    IMAGE_PROMPT: "IMAGE_PROMPT",
    IMAGE_GENERATION: "IMAGE_GENERATION",
    GENERATED_MEDIA: "GENERATED_MEDIA",
    VIDEO_SETUP: "VIDEO_SETUP",
    VIDEO_PROMPT: "VIDEO_PROMPT",
    VIDEO_GENERATION: "VIDEO_GENERATION",
    COMPLETE: "COMPLETE",
    FAILED: "FAILED",
  });

  function createWorkflowState({ build = "unknown" } = {}) {
    let stage = STAGES.IDLE;
    let status = "idle";
    let detail = "";
    let progress = 0;
    let sequence = 0;
    const history = [];

    function reset() {
      status = "idle";
      detail = "";
      progress = 0;
      sequence = 0;
      stage = STAGES.IDLE;
      history.length = 0;
    }

    function update(
      nextDetail,
      nextStatus = "working",
      requestedProgress = null,
      nextStage = null,
    ) {
      if (Number.isFinite(requestedProgress)) {
        progress = Math.max(progress, Math.min(100, Math.round(requestedProgress)));
      } else if (nextStatus === "success") {
        progress = 100;
      }

      status = nextStatus;
      detail = String(nextDetail ?? "");
      if (nextStage) {
        stage = nextStage;
      } else if (nextStatus === "success") {
        stage = STAGES.COMPLETE;
      } else if (nextStatus === "error") {
        stage = STAGES.FAILED;
      }
      sequence += 1;
      const snapshot = Object.freeze({ build, detail, progress, sequence, stage, status });
      history.push(snapshot);
      if (history.length > 100) {
        history.shift();
      }
      return snapshot;
    }

    function getSnapshot() {
      return Object.freeze({ build, detail, progress, sequence, stage, status });
    }

    function getHistory() {
      return [...history];
    }

    return Object.freeze({ getHistory, getSnapshot, reset, update });
  }

  globalThis.FlowLauncherRuntime = Object.freeze({ STAGES, createWorkflowState });
})();
