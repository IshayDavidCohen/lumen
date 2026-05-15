import { useEffect } from "react";
import { SHORTCUTS, parseKeys, type ShortcutDefinition } from "@/constants/shortcuts";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return true;
  if (target.getAttribute("contenteditable") === "true") return true;
  return false;
}

export function useKeyboardShortcuts(
  scope: ShortcutDefinition["scope"],
  handlers: Record<string, () => void>,
): void {
  useEffect(() => {
    const relevantShortcuts = SHORTCUTS.filter(
      (s) => s.scope === scope || s.scope === "global",
    );

    function handleKeyDown(e: KeyboardEvent) {
      const isEditable = isEditableTarget(e.target);

      for (const shortcut of relevantShortcuts) {
        if (!handlers[shortcut.id]) continue;

        const parsed = parseKeys(shortcut.keys);

        const modPressed = e.ctrlKey || e.metaKey;
        if (parsed.mod && !modPressed) continue;
        if (!parsed.mod && modPressed) continue;

        if (parsed.shift && !e.shiftKey) continue;
        if (!parsed.shift && e.shiftKey && parsed.key !== "?") continue;

        let targetKey = parsed.key.toLowerCase();
        let eventKey = e.key.toLowerCase();

        if (targetKey === "enter") targetKey = "enter";
        if (eventKey === "enter") eventKey = "enter";
        if (targetKey === "right") targetKey = "arrowright";
        if (targetKey === "left") targetKey = "arrowleft";
        if (eventKey === "arrowright") eventKey = "arrowright";
        if (eventKey === "arrowleft") eventKey = "arrowleft";
        if (targetKey === "0") targetKey = "0";
        if (targetKey === "?") targetKey = "?";

        if (targetKey !== eventKey) continue;

        // Allow mod+enter inside editors (Monaco), block other shortcuts in editable fields
        if (isEditable && !(parsed.mod && parsed.key === "enter")) continue;

        e.preventDefault();
        handlers[shortcut.id]!();
        return;
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [scope, handlers]);
}
