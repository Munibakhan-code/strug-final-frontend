import { useEffect, useRef } from "react";

// Elements that can receive keyboard focus inside a dialog.
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Focus management for modal dialogs. When `active` is true it:
 *   1. remembers the element that was focused before the dialog opened,
 *   2. moves focus into the dialog (first focusable child, else the container),
 *   3. traps Tab / Shift+Tab so focus can't leave the dialog, and
 *   4. restores focus to the original element when the dialog closes/unmounts.
 *
 * Attach the returned ref to the dialog container element:
 *   const trapRef = useFocusTrap(open);
 *   return <div ref={trapRef} role="dialog" aria-modal="true"> … </div>;
 */
export function useFocusTrap(active) {
  const containerRef = useRef(null);
  const restoreRef = useRef(null);

  useEffect(() => {
    if (!active) return undefined;
    const container = containerRef.current;
    if (!container) return undefined;

    restoreRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // The selector already excludes disabled controls and tabindex="-1". Skip elements
    // hidden via the `hidden` attribute or aria-hidden (can't be focused / shouldn't be).
    const focusable = () =>
      Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
        (el) => !el.hasAttribute("hidden") && el.getAttribute("aria-hidden") !== "true",
      );

    // Move focus into the dialog.
    const initial = focusable();
    if (initial.length) {
      initial[0].focus();
    } else {
      if (!container.hasAttribute("tabindex")) container.setAttribute("tabindex", "-1");
      container.focus();
    }

    const onKeyDown = (e) => {
      if (e.key !== "Tab") return;
      const items = focusable();
      if (!items.length) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      if (e.shiftKey) {
        if (current === first || !container.contains(current)) {
          e.preventDefault();
          last.focus();
        }
      } else if (current === last || !container.contains(current)) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      const restore = restoreRef.current;
      if (restore && typeof restore.focus === "function" && document.contains(restore)) {
        restore.focus();
      }
    };
  }, [active]);

  return containerRef;
}
