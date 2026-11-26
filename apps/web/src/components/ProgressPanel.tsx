import { i18n, useT } from "../i18n";
import { cn } from "../lib/cn";
import { StatusBadge } from "./StatusBadge";

export type ProgressState = "running" | "stalled" | "failed" | "completed";

export interface ProgressStep {
  current: number;
  steps: number;
  /** Already translated, e.g. "Matching postcodes". */
  name: string;
}

export interface ProgressPanelProps {
  /** Already translated: what is happening, e.g. "Structuring addresses". */
  label: string;
  step: ProgressStep;
  /** Items finished. */
  done?: number;
  /** Total items; unknown while counting (indeterminate), but the step is still named. */
  total?: number;
  state?: ProgressState;
  /** Last update, already formatted in local time (e.g. "14:02:11"). Always shown. */
  updated: string;
  /** For `stalled`: seconds since the last update. */
  stalledSeconds?: number;
  /** For `failed`: why it stopped (already translated). */
  failureReason?: string;
  /** For `completed`: how long it took, already formatted (e.g. "42 s"). */
  duration?: string;
  headingLevel?: 2 | 3 | 4;
  className?: string;
}

/**
 * Progress with context, never a bare spinner: a label, the current step, done / total when
 * known and the last update. A native `progress` element carries the value; the text sits in a
 * polite status region (callers throttle updates to one per 10 s and on step change).
 */
export function ProgressPanel({
  label,
  step,
  done,
  total,
  state = "running",
  updated,
  stalledSeconds,
  failureReason,
  duration,
  headingLevel = 3,
  className,
}: ProgressPanelProps) {
  const t = useT();
  const Heading = `h${headingLevel}` as const;
  const nf = new Intl.NumberFormat(i18n.language);
  const known = total !== undefined && total > 0 && done !== undefined;
  // A stalled job is still running; the stalled note is the signal, not a pack `warning`.
  const badge = state === "completed" ? "pass" : state === "failed" ? "fail" : "running";
  const stepText = known
    ? t("components.progressPanel.step", {
        current: step.current,
        steps: step.steps,
        stepName: step.name,
      })
    : t("components.progressPanel.indeterminate", { stepName: step.name });
  let note: string | undefined;
  if (state === "stalled")
    note = t("components.progressPanel.stalled", { seconds: stalledSeconds ?? 30 });
  else if (state === "failed")
    note = t("components.progressPanel.failed", {
      current: step.current,
      reason: failureReason ?? "",
    });
  else if (state === "completed" && duration)
    note = t("components.progressPanel.completed", { duration });
  return (
    <section
      aria-busy={state === "running"}
      className={cn("flex flex-col gap-2 rounded-panel border border-line bg-panel p-4", className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Heading className="text-body font-semibold text-fg">{label}</Heading>
        <StatusBadge status={badge} size="sm" />
      </div>
      <progress
        aria-label={label}
        max={known ? total : undefined}
        value={known ? done : undefined}
        className={cn(
          "h-2 w-full appearance-none overflow-hidden rounded-chip bg-line",
          "[&::-webkit-progress-bar]:bg-line [&::-webkit-progress-value]:rounded-chip [&::-moz-progress-bar]:rounded-chip",
          state === "failed"
            ? "[&::-webkit-progress-value]:bg-st-fail [&::-moz-progress-bar]:bg-st-fail"
            : "[&::-webkit-progress-value]:bg-accent [&::-moz-progress-bar]:bg-accent",
        )}
      />
      <div role="status" aria-live="polite" className="flex flex-col gap-1 text-dense">
        <p className="flex flex-wrap justify-between gap-x-3 gap-y-1">
          <span className="text-fg">{stepText}</span>
          {known && (
            <span className="tabular font-code text-fg">
              {t("components.progressPanel.counter", {
                done: nf.format(done),
                total: nf.format(total),
              })}
            </span>
          )}
        </p>
        {note && <p className={state === "failed" ? "text-st-fail" : "text-fg"}>{note}</p>}
        <p className="text-fg-muted">{t("components.progressPanel.updated", { time: updated })}</p>
      </div>
    </section>
  );
}
