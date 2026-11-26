import { Toast as ToastPrimitive } from "radix-ui";
import type { ReactNode } from "react";
import { useT } from "../../i18n";
import { cn } from "../../lib/cn";
import { IconClose, IconFail, IconInfo, IconPass } from "../icons";

export type ToastVariant = "info" | "success" | "error";

/** Wrap the app once. Bottom-right at desktop widths, full-width at the bottom on phones. */
export function ToastProvider({ children, label }: { children: ReactNode; label?: string }) {
  const t = useT();
  return (
    <ToastPrimitive.Provider label={label ?? t("components.toast.region")} duration={6000}>
      {children}
      <ToastPrimitive.Viewport className="fixed inset-x-0 bottom-0 z-50 flex flex-col gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] outline-none md:left-auto md:w-full md:max-w-sm" />
    </ToastPrimitive.Provider>
  );
}

export interface ToastAction {
  /** Already translated, e.g. "Undo" (`components.toast.undo`) or "View". */
  label: string;
  onClick: () => void;
}

export interface ToastProps {
  variant?: ToastVariant;
  /** Already translated. */
  title: string;
  description?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Milliseconds. Info and success leave after 6 s (paused on hover or focus); errors stay. */
  duration?: number;
  action?: ToastAction;
}

const STYLE: Record<ToastVariant, { box: string; icon: ReactNode }> = {
  info: { box: "border-line-strong", icon: <IconInfo className="text-fg-muted" /> },
  success: { box: "border-st-pass-line", icon: <IconPass className="text-st-pass" /> },
  error: { box: "border-st-fail-line", icon: <IconFail className="text-st-fail" /> },
};

/** Info and success are announced politely; errors assertively and stay until dismissed. */
export function Toast({
  variant = "info",
  title,
  description,
  open,
  onOpenChange,
  duration,
  action,
}: ToastProps) {
  const t = useT();
  const s = STYLE[variant];
  return (
    <ToastPrimitive.Root
      {...(open !== undefined ? { open } : {})}
      {...(onOpenChange ? { onOpenChange } : {})}
      duration={duration ?? (variant === "error" ? Number.POSITIVE_INFINITY : 6000)}
      type={variant === "error" ? "foreground" : "background"}
      data-variant={variant}
      className={cn(
        "flex items-start gap-3 rounded-panel border-2 bg-panel p-3 text-fg shadow-float",
        s.box,
      )}
    >
      <span className="mt-0.5 shrink-0">{s.icon}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <ToastPrimitive.Title className="text-dense font-semibold">{title}</ToastPrimitive.Title>
        {description && (
          <ToastPrimitive.Description className="text-dense text-fg-muted">
            {description}
          </ToastPrimitive.Description>
        )}
        {action && (
          <ToastPrimitive.Action
            altText={action.label}
            onClick={action.onClick}
            className="focus-ring self-start rounded-chip text-dense font-medium text-accent underline underline-offset-2 min-h-target lg:min-h-6"
          >
            {action.label}
          </ToastPrimitive.Action>
        )}
      </div>
      <ToastPrimitive.Close
        aria-label={t("components.toast.dismiss")}
        className="focus-ring -m-1 inline-flex min-h-target min-w-target items-center justify-center rounded-chip text-fg-muted hover:text-fg lg:min-h-7 lg:min-w-7"
      >
        <IconClose />
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  );
}
