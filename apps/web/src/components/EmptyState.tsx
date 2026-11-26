import type { ReactNode } from "react";
import { useT } from "../i18n";
import { cn } from "../lib/cn";
import { IconEmpty } from "./icons";

export interface EmptyStateProps {
  /** Already translated: what is empty, in plain words. Defaults to "Nothing here yet". */
  title?: string;
  /** Already translated: why, and what to do next. */
  body?: string;
  /** The next step, usually one Button. */
  action?: ReactNode;
  /** An optional secondary link. */
  secondary?: ReactNode;
  /** At most a 24px status or step icon; no illustration. */
  icon?: ReactNode;
  /** `start` inside tables and panels; `center` only for full-screen empties. */
  align?: "start" | "center";
  /** Heading level for the title so it fits the page outline. */
  headingLevel?: 1 | 2 | 3 | 4;
  className?: string;
}

export function EmptyState({
  title,
  body,
  action,
  secondary,
  icon,
  align = "start",
  headingLevel = 2,
  className,
}: EmptyStateProps) {
  const t = useT();
  const Heading = `h${headingLevel}` as const;
  return (
    <section
      className={cn(
        "flex flex-col gap-3 rounded-panel border border-dashed border-line-strong bg-panel px-5 py-8",
        align === "center" ? "items-center text-center" : "items-start text-left",
        className,
      )}
    >
      <span className="text-fg-muted [&>svg]:h-6 [&>svg]:w-6">{icon ?? <IconEmpty />}</span>
      <Heading className="text-lead font-semibold text-fg">
        {title ?? t("components.emptyState.defaultTitle")}
      </Heading>
      {body && <p className="max-w-prose text-dense text-fg-muted">{body}</p>}
      {(action || secondary) && (
        <div className="mt-1 flex flex-wrap items-center gap-3">
          {action}
          {secondary}
        </div>
      )}
    </section>
  );
}
