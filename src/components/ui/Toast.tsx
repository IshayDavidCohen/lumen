import { createContext, useCallback, useContext, useState, useRef } from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { X, AlertCircle, CheckCircle2, Info, AlertTriangle } from "lucide-react";

type ToastVariant = "info" | "success" | "warning" | "error";

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  duration?: number;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const VARIANT_CONFIG: Record<
  ToastVariant,
  { icon: typeof Info; classes: string; iconClass: string }
> = {
  info: {
    icon: Info,
    classes:
      "dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 light:border-zinc-200 light:bg-white light:text-zinc-900 light:shadow-sm",
    iconClass: "dark:text-blue-400 light:text-blue-600",
  },
  success: {
    icon: CheckCircle2,
    classes:
      "dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-100 light:border-green-200 light:bg-green-50 light:text-green-900 light:shadow-sm",
    iconClass: "dark:text-green-400 light:text-green-600",
  },
  warning: {
    icon: AlertTriangle,
    classes:
      "dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100 light:border-amber-200 light:bg-amber-50 light:text-amber-900 light:shadow-sm",
    iconClass: "dark:text-amber-400 light:text-amber-600",
  },
  error: {
    icon: AlertCircle,
    classes:
      "dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100 light:border-red-200 light:bg-red-50 light:text-red-900 light:shadow-sm",
    iconClass: "dark:text-red-400 light:text-red-600",
  },
};

let toastCounter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastsRef = useRef(toasts);
  toastsRef.current = toasts;

  const toast = useCallback(
    (message: string, variant: ToastVariant = "info", duration = 5000) => {
      const id = `toast-${++toastCounter}`;
      setToasts((prev) => [...prev, { id, message, variant, duration }]);
    },
    [],
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      <ToastPrimitive.Provider swipeDirection="right">
        {children}
        {toasts.map((t) => {
          const config = VARIANT_CONFIG[t.variant];
          const Icon = config.icon;

          return (
            <ToastPrimitive.Root
              key={t.id}
              duration={t.duration}
              onOpenChange={(open) => {
                if (!open) removeToast(t.id);
              }}
              className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${config.classes}`}
            >
              <Icon size={16} className={`shrink-0 ${config.iconClass}`} />
              <ToastPrimitive.Description className="flex-1 text-sm font-medium">
                {t.message}
              </ToastPrimitive.Description>
              <ToastPrimitive.Close
                className="shrink-0 rounded-full p-1 transition-colors duration-150
                           dark:hover:bg-white/10 light:hover:bg-zinc-200"
                aria-label="Close"
              >
                <X size={14} />
              </ToastPrimitive.Close>
            </ToastPrimitive.Root>
          );
        })}
        <ToastPrimitive.Viewport
          className="fixed top-4 right-4 z-50 flex w-80 flex-col gap-2"
        />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}
