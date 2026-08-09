(() => {
  function createMediaTools({
    getElementLabels,
    getPromptDropTarget,
    isVisible,
    normalizeLabel,
    promoteToClickableControl,
  }) {
    function getWorkspaceMediaSignatures(promptField) {
      const promptContainer = promptField ? getPromptDropTarget(promptField) : null;
      const signatures = new Set();
      const candidates = document.querySelectorAll(
        'img, canvas, video, [role="img"], [style*="background-image"], [class*="asset" i], [class*="media" i]',
      );

      for (const element of candidates) {
        if (
          !isVisible(element) ||
          element.closest("#flow-launcher-status, nav, header, [role='navigation'], [role='dialog']") ||
          (promptContainer && promptContainer.contains(element))
        ) {
          continue;
        }
        const rect = element.getBoundingClientRect();
        if (rect.width < 72 || rect.height < 72 || rect.bottom > window.innerHeight - 80) {
          continue;
        }
        const style = getComputedStyle(element);
        const source =
          element.currentSrc ||
          element.getAttribute("src") ||
          element.getAttribute("poster") ||
          (style.backgroundImage !== "none" ? style.backgroundImage : "") ||
          `${element.tagName}:${Math.round(rect.left)}:${Math.round(rect.top)}:${Math.round(rect.width)}:${Math.round(rect.height)}`;
        signatures.add(source);
      }
      return signatures;
    }

    function getMediaSource(element) {
      const style = getComputedStyle(element);
      return (
        element.currentSrc ||
        element.getAttribute("src") ||
        element.getAttribute("poster") ||
        (style.backgroundImage !== "none" ? style.backgroundImage : "") ||
        ""
      );
    }

    function normalizeMediaSource(source) {
      return normalizeLabel(source)
        .replace(/^url\(["']?|["']?\)$/g, "")
        .replace(/[?#].*$/, "")
        .toLowerCase();
    }

    function findLatestPickerAsset(
      picker,
      originalImageName,
      preferredSignatures = new Set(),
    ) {
      const originalBaseName = normalizeLabel(originalImageName)
        .replace(/\.[^.]+$/, "")
        .toLowerCase();
      const preferredSources = new Set(
        [...preferredSignatures].map(normalizeMediaSource).filter(Boolean),
      );
      const candidates = [
        ...picker.querySelectorAll(
          'img, canvas, [role="img"], [style*="background-image"], [class*="thumbnail" i], [class*="asset" i]',
        ),
      ].filter((element) => {
        if (!isVisible(element)) {
          return false;
        }
        const rect = element.getBoundingClientRect();
        return rect.width >= 40 && rect.height >= 40 && rect.width <= 420 && rect.height <= 600;
      });

      const scoredCandidates = candidates.map((element) => {
        const control = promoteToClickableControl(element, picker) || element;
        const source = normalizeMediaSource(getMediaSource(element));
        const labelParts = [];
        let labelNode = control;
        for (
          let level = 0;
          level < 4 && labelNode && labelNode !== picker && picker.contains(labelNode);
          level += 1
        ) {
          if (
            level > 0 &&
            labelNode.querySelectorAll(
              'img, canvas, [role="img"], [style*="background-image"]',
            ).length > 1
          ) {
            break;
          }
          labelParts.push(...getElementLabels(labelNode));
          labelNode = labelNode.parentElement;
        }
        const labels = normalizeLabel(labelParts.join(" ")).toLowerCase();
        let score = 0;
        if (source && preferredSources.has(source)) {
          score += 10000;
        }
        if (originalBaseName && labels.includes(originalBaseName)) {
          score -= 20000;
        }
        return { control, score };
      });
      const uniqueCandidates = [
        ...new Map(
          scoredCandidates.map((candidate) => [candidate.control, candidate]),
        ).values(),
      ];
      const bestCandidate = uniqueCandidates.sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }
        const leftRect = left.control.getBoundingClientRect();
        const rightRect = right.control.getBoundingClientRect();
        return leftRect.top - rightRect.top || leftRect.left - rightRect.left;
      })[0];
      return bestCandidate && bestCandidate.score >= 0 ? bestCandidate.control : null;
    }

    return Object.freeze({ findLatestPickerAsset, getWorkspaceMediaSignatures });
  }

  globalThis.FlowLauncherMedia = Object.freeze({ createMediaTools });
})();
