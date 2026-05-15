import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { SHORTCUTS, formatKeyCombo, type ShortcutDefinition } from "@/constants/shortcuts";

interface ShortcutGuideProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SCOPE_LABELS: Record<ShortcutDefinition["scope"], string> = {
  global: "Global",
  data: "Data & Query",
  topology: "Topology",
};

const SCOPES: ShortcutDefinition["scope"][] = ["global", "data", "topology"];

export function ShortcutGuide({ open, onOpenChange }: ShortcutGuideProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2
                     rounded-lg border bg-white p-6 shadow-xl
                     border-zinc-200 dark:border-zinc-700 dark:bg-zinc-900
                     max-h-[80vh] overflow-y-auto"
        >
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Keyboard Shortcuts
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>

          <div className="mt-4 flex flex-col gap-5">
            {SCOPES.map((scope) => {
              const shortcuts = SHORTCUTS.filter((s) => s.scope === scope);
              if (shortcuts.length === 0) return null;
              return (
                <div key={scope}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                    {SCOPE_LABELS[scope]}
                  </h3>
                  <div className="flex flex-col gap-1">
                    {shortcuts.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between rounded-md px-2 py-1.5"
                      >
                        <span className="text-xs text-zinc-700 dark:text-zinc-300">
                          {s.label}
                        </span>
                        <div className="flex gap-0.5">
                          {formatKeyCombo(s.keys)
                            .split(/(?=[⌘⇧↵→←])|(?<=\+)/)
                            .filter(Boolean)
                            .map((part, i) => (
                              <kbd
                                key={i}
                                className="inline-flex min-w-[20px] items-center justify-center rounded border px-1.5 py-0.5 text-[10px] font-medium
                                           border-zinc-300 bg-zinc-100 text-zinc-600
                                           dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                              >
                                {part.replace(/\+$/, "")}
                              </kbd>
                            ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
