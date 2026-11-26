import { Dialog as DialogPrimitive } from "radix-ui";
import { type ReactNode, useRef } from "react";
import { useT } from "../../i18n";
import { cn } from "../../lib/cn";
import { IconClose } from "../icons";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export interface DialogContentProps {
  /** Already translated; becomes the accessible name. */
  title: string;
  /** Already translated; becomes the accessible description. */
  description?: string;
  children?: ReactNode;
  /** Action buttons, right-aligned (stacked full-width under 768px), primary last. */
  footer?: ReactNode;
  /** A request is in flight: Escape, the scrim and the close button do not close the dialog. */
  busy?: boolean;
  className?: string;
}

/**
 * Modal dialog (Radix): focus moves to the title, is trapped inside, and returns to the trigger
 * on close; Escape closes unless `busy`.
 */
export function DialogContent({
  title,
  description,
  children,
  footer,
  busy,
  className,
}: DialogContentProps) {
  const t = useT();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const block = (e: Event) => {
    if (busy) e.preventDefault();
  };
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className="fixed inset-0 z-40 bg-scrim"
        style={{ opacity: "var(--overlay-opacity)" }}
      />
      <DialogPrimitive.Content
        {...(description === undefined ? { "aria-describedby": undefined } : {})}
        aria-busy={busy || undefined}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          titleRef.current?.focus();
        }}
        onEscapeKeyDown={block}
        onPointerDownOutside={block}
        onInteractOutside={block}
        className={cn(
          "fixed top-1/2 left-1/2 z-50 flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2",
          "flex-col gap-4 overflow-y-auto rounded-panel border border-line bg-panel p-6 text-fg shadow-float",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <DialogPrimitive.Title
            ref={titleRef}
            tabIndex={-1}
            className="text-lead font-semibold outline-none"
          >
            {title}
          </DialogPrimitive.Title>
          <DialogPrimitive.Close
            disabled={busy}
            className="focus-ring -m-2 inline-flex min-h-target min-w-target items-center justify-center rounded-control text-fg-muted hover:text-fg disabled:opacity-60"
            aria-label={t("components.dialog.close")}
          >
            <IconClose />
          </DialogPrimitive.Close>
        </div>
        {description && (
          <DialogPrimitive.Description className="text-dense text-fg-muted">
            {description}
          </DialogPrimitive.Description>
        )}
        {children}
        {footer && (
          <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">{footer}</div>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
