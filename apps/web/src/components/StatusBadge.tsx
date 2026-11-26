import type { ComponentType } from "react";
import { useT } from "../i18n";
import { cn } from "../lib/cn";
import {
  IconApproved,
  IconEmpty,
  IconFail,
  IconPass,
  type IconProps,
  IconReview,
  IconRunning,
  IconWarning,
} from "./icons";
import { Tooltip } from "./ui/Tooltip";

/** The status vocabulary (docs/design/README.md). Order is the risk order used for sorting. */
export const STATUSES = [
  "fail",
  "review",
  "warning",
  "empty",
  "running",
  "approved",
  "pass",
] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_ICON: Record<Status, ComponentType<IconProps>> = {
  pass: IconPass,
  fail: IconFail,
  warning: IconWarning,
  review: IconReview,
  approved: IconApproved,
  empty: IconEmpty,
  running: IconRunning,
};

const STYLE: Record<Status, string> = {
  pass: "bg-st-pass-bg text-st-pass border-st-pass-line",
  fail: "bg-st-fail-bg text-st-fail border-st-fail-line",
  warning: "bg-st-warning-bg text-st-warning border-st-warning-line",
  review: "bg-st-review-bg text-st-review border-st-review-line",
  approved: "bg-st-approved-bg text-st-approved border-st-approved-line",
  empty: "bg-st-empty-bg text-st-empty border-st-empty-line",
  running: "bg-st-running-bg text-st-running border-st-running-line",
};

export interface StatusBadgeProps {
  status: Status;
  size?: "sm" | "md";
  /** Optional count, rendered "Fail 412". */
  count?: number;
  /** Optional reason shown in a tooltip (already translated); makes the badge focusable. */
  description?: string;
  /** As a link, the badge navigates to the reason (the finding, the field). */
  href?: string;
  className?: string;
}

/** Icon + text label + colour. Never colour alone; the label is real text, not a tooltip. */
export function StatusBadge({
  status,
  size = "md",
  count,
  description,
  href,
  className,
}: StatusBadgeProps) {
  const t = useT();
  const Icon = STATUS_ICON[status];
  const label = t(`status.${status}.label`);
  const text =
    count === undefined
      ? label
      : t("components.statusBadge.withCount", { label, count: count.toLocaleString() });
  const classes = cn(
    "inline-flex items-center gap-1 rounded-chip border font-medium whitespace-nowrap",
    size === "sm" ? "px-1.5 py-0.5 text-cap" : "px-2 py-0.5 text-dense",
    // Interactive badges get the full target size (44px at 375/768, 24px at desktop).
    (href || description) && "focus-ring min-h-target lg:min-h-6",
    href && "underline underline-offset-2",
    STYLE[status],
    className,
  );
  const body = (
    <>
      <Icon
        data-icon={status}
        className={cn(
          "shrink-0",
          status === "running" &&
            "animate-spin [animation-duration:1.2s] motion-reduce:animate-none",
        )}
      />
      <span className="tabular">{text}</span>
    </>
  );
  const badge = href ? (
    <a href={href} data-status={status} className={classes}>
      {body}
    </a>
  ) : (
    <span data-status={status} className={classes} {...(description ? { tabIndex: 0 } : {})}>
      {body}
    </span>
  );
  return description ? <Tooltip content={description}>{badge}</Tooltip> : badge;
}
