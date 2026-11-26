import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export type SkeletonVariant = "text" | "badge" | "row" | "block";

const SHAPE: Record<SkeletonVariant, string> = {
  // 60% of the height of the content it replaces.
  text: "h-[0.6em] w-full rounded-chip",
  badge: "h-3.5 w-16 rounded-chip",
  row: "h-[calc(var(--row-height)*0.6)] w-full rounded-chip",
  block: "rounded-chip",
};

/**
 * A static placeholder shaped like the content it stands for, in `--color-border`. Decorative
 * (`aria-hidden`): the loading region sets `aria-busy` and says in text what it is loading
 * (a caption with `components.skeleton.loading`, or a ProgressPanel). No shimmer.
 */
export function Skeleton({
  variant = "text",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { variant?: SkeletonVariant }) {
  return (
    <div
      aria-hidden="true"
      data-skeleton={variant}
      className={cn("bg-line", SHAPE[variant], className)}
      {...props}
    />
  );
}
