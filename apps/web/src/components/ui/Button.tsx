import { type ButtonHTMLAttributes, forwardRef, type MouseEvent } from "react";
import { useT } from "../../i18n";
import { cn } from "../../lib/cn";
import { IconRunning } from "../icons";
import { Tooltip } from "./Tooltip";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Keeps the label, adds the running icon and `aria-busy`, and blocks repeat clicks. */
  loading?: boolean;
  /**
   * Why the action is unavailable (already translated). The button becomes `aria-disabled`,
   * stays focusable, and its tooltip gives the reason (e.g. four-eyes approval).
   */
  disabledReason?: string;
}

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent border-transparent hover:bg-accent-hover",
  secondary: "bg-panel text-fg border-line-strong hover:bg-row-hover",
  ghost: "bg-transparent text-accent border-transparent hover:bg-row-hover",
  danger: "bg-destructive text-on-destructive border-transparent hover:opacity-90",
};

// 44px targets at 375 and 768; 24px minimum pointer targets at desktop widths (WCAG 2.5.8).
const SIZE: Record<ButtonSize, string> = {
  sm: "min-h-target px-3 text-dense lg:min-h-7",
  md: "min-h-target px-4 text-body lg:min-h-9",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    disabledReason,
    disabled,
    className,
    children,
    onClick,
    type = "button",
    ...rest
  },
  ref,
) {
  const t = useT();
  const soft = loading || disabledReason !== undefined;
  const handle = (e: MouseEvent<HTMLButtonElement>) => {
    if (soft) {
      e.preventDefault();
      return;
    }
    onClick?.(e);
  };
  const button = (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      aria-disabled={soft || undefined}
      aria-busy={loading || undefined}
      data-variant={variant}
      onClick={handle}
      className={cn(
        "focus-ring inline-flex items-center justify-center gap-2 rounded-control border font-medium",
        "transition-colors duration-[var(--duration-fast)] motion-reduce:transition-none",
        "disabled:cursor-not-allowed disabled:opacity-60 aria-disabled:cursor-not-allowed",
        disabledReason !== undefined && "opacity-60",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {loading && (
        <>
          <IconRunning className="animate-spin motion-reduce:animate-none" />
          <span className="sr-only">{t("components.button.loading")}</span>
        </>
      )}
      {children}
    </button>
  );
  return disabledReason !== undefined ? (
    <Tooltip content={disabledReason}>{button}</Tooltip>
  ) : (
    button
  );
});
