(() => {
  function createDomTools({ clickDelayMs = 200 } = {}) {
    function delay(milliseconds) {
      return new Promise((resolve) => setTimeout(resolve, milliseconds));
    }

    function normalizeLabel(value) {
      return String(value ?? "")
        .normalize("NFKC")
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .replace(/\u00A0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function isVisible(element) {
      if (!(element instanceof Element)) {
        return false;
      }
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity) !== 0 &&
        rect.width > 0 &&
        rect.height > 0
      );
    }

    function getElementLabels(element) {
      return [
        element.getAttribute("aria-label"),
        element.getAttribute("data-placeholder"),
        element.getAttribute("placeholder"),
        element.getAttribute("title"),
        element.getAttribute("name"),
        element.textContent,
      ]
        .map(normalizeLabel)
        .filter(Boolean);
    }

    const interactiveSelector = [
      "button",
      "a",
      '[role="button"]',
      '[role="tab"]',
      '[role="option"]',
      '[role="menuitem"]',
      '[role="radio"]',
      '[tabindex="0"]',
      'input[type="button"]',
      'input[type="submit"]',
    ].join(", ");

    async function activateElement(element) {
      await delay(clickDelayMs);
      element.scrollIntoView({ block: "nearest", inline: "nearest" });
      element.focus({ preventScroll: true });

      for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup"]) {
        const EventClass = type.startsWith("pointer") ? PointerEvent : MouseEvent;
        element.dispatchEvent(
          new EventClass(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            button: 0,
            buttons: type.endsWith("down") ? 1 : 0,
          }),
        );
      }

      element.click();
      await delay(clickDelayMs);
    }

    function findAction(patterns, root = document) {
      const candidates = root.querySelectorAll(interactiveSelector);
      return [...candidates].find((element) => {
        if (!isVisible(element) || element.matches(":disabled, [aria-disabled='true']")) {
          return false;
        }
        return getElementLabels(element).some((label) =>
          patterns.some((pattern) => pattern.test(label)),
        );
      });
    }

    function getDirectText(element) {
      return normalizeLabel(
        [...element.childNodes]
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent)
          .join(" "),
      );
    }

    function matchesControlText(element, patterns) {
      const labels = [
        element.getAttribute("aria-label"),
        element.getAttribute("title"),
        element.getAttribute("data-value"),
        element.getAttribute("value"),
        getDirectText(element),
        element.childElementCount === 0 ? element.textContent : "",
      ]
        .map(normalizeLabel)
        .filter(Boolean);
      return labels.some((label) => patterns.some((pattern) => pattern.test(label)));
    }

    function promoteToClickableControl(element, boundary) {
      let control = element;
      for (let level = 0; control && level < 5; level += 1) {
        if (
          control.matches(interactiveSelector) ||
          getComputedStyle(control).cursor === "pointer"
        ) {
          return control;
        }
        if (control === boundary) {
          break;
        }
        control = control.parentElement;
      }
      return element;
    }

    function findTextControl(patterns, root = document) {
      const candidates = [...root.querySelectorAll("*")]
        .filter(
          (element) =>
            element.id !== "flow-launcher-status" &&
            !element.closest("#flow-launcher-status") &&
            isVisible(element) &&
            matchesControlText(element, patterns),
        )
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return { element, area: rect.width * rect.height };
        })
        .sort((left, right) => left.area - right.area);
      const leaf = candidates[0]?.element;
      return leaf ? promoteToClickableControl(leaf, root) : null;
    }

    function getSelectedState(element) {
      let control = element;
      for (let level = 0; control && level < 4; level += 1) {
        const ariaSelected = control.getAttribute("aria-selected");
        const ariaPressed = control.getAttribute("aria-pressed");
        const ariaChecked = control.getAttribute("aria-checked");
        const dataState = control.getAttribute("data-state");
        const className = String(control.className ?? "");
        if ([ariaSelected, ariaPressed, ariaChecked].includes("true")) {
          return true;
        }
        if ([ariaSelected, ariaPressed, ariaChecked].includes("false")) {
          return false;
        }
        if (
          /active|checked|selected|on/i.test(dataState ?? "") ||
          /active|checked|selected/i.test(className)
        ) {
          return true;
        }
        control = control.parentElement;
      }
      return null;
    }

    return Object.freeze({
      activateElement,
      delay,
      findAction,
      findTextControl,
      getDirectText,
      getElementLabels,
      getSelectedState,
      interactiveSelector,
      isVisible,
      matchesControlText,
      normalizeLabel,
      promoteToClickableControl,
    });
  }

  globalThis.FlowLauncherDom = Object.freeze({ createDomTools });
})();
