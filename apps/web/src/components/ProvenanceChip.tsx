import { Popover } from "radix-ui";
import type { ComponentType } from "react";
import { useT } from "../i18n";
import { cn } from "../lib/cn";
import {
  IconDataset,
  IconExternal,
  IconHuman,
  IconInferred,
  type IconProps,
  IconSpan,
  IconTransform,
} from "./icons";
import { Tooltip } from "./ui/Tooltip";

/** ADR 0008. Every value carries exactly one of these; no provenance means the field stays empty. */
export const PROVENANCE_KINDS = [
  "span",
  "transform",
  "dataset",
  "inferred",
  "human",
  "external",
] as const;
export type ProvenanceKind = (typeof PROVENANCE_KINDS)[number];

/** CLAUDE.md: `dataset`, `inferred` and `external` values are never auto-approvable. */
export const NEVER_AUTO_APPROVABLE: ReadonlySet<ProvenanceKind> = new Set([
  "dataset",
  "inferred",
  "external",
]);

export const PROVENANCE_ICON: Record<ProvenanceKind, ComponentType<IconProps>> = {
  span: IconSpan,
  transform: IconTransform,
  dataset: IconDataset,
  inferred: IconInferred,
  human: IconHuman,
  external: IconExternal,
};

const STYLE: Record<ProvenanceKind, string> = {
  span: "bg-pv-span-bg text-pv-span border-pv-span-line",
  transform: "bg-pv-transform-bg text-pv-transform border-pv-transform-line",
  dataset: "bg-pv-dataset-bg text-pv-dataset border-pv-dataset-line",
  inferred: "bg-pv-inferred-bg text-pv-inferred border-pv-inferred-line",
  human: "bg-pv-human-bg text-pv-human border-pv-human-line",
  external: "bg-pv-external-bg text-pv-external border-pv-external-line",
};

export interface ProvenanceChipProps {
  kind: ProvenanceKind;
  /**
   * Why this value has this provenance, already translated: usually the kind's description key
   * (`provenance.<kind>.description`) with its values (the span, the transform and version, the
   * dataset record, the rule, the person and date, or the token).
   */
  reason: string;
  className?: string;
}

/**
 * The provenance kind as a focusable chip: icon + label, solid border for auto-approvable kinds and
 * dashed for the others (shape, not only colour). Hover or focus shows the reason in a tooltip;
 * Enter or a tap opens it as a popover (touch has no hover); Esc closes either.
 */
export function ProvenanceChip({ kind, reason, className }: ProvenanceChipProps) {
  const t = useT();
  const locked = NEVER_AUTO_APPROVABLE.has(kind);
  const label = t(`provenance.${kind}.label`);
  const name = t(
    locked
      ? "components.provenanceChip.accessibleNameNeedsApproval"
      : "components.provenanceChip.accessibleName",
    { label, reason },
  );
  const Icon = PROVENANCE_ICON[kind];
  const detail = (
    <span className="flex flex-col gap-1">
      <span className="font-semibold">{label}</span>
      <span>{reason}</span>
      {locked && (
        <span className="font-medium">{t("components.provenanceChip.needsApproval")}</span>
      )}
    </span>
  );
  return (
    <Popover.Root>
      <Tooltip content={detail}>
        <Popover.Trigger asChild>
          <button
            type="button"
            data-provenance={kind}
            data-auto-approvable={locked ? "false" : "true"}
            aria-label={name}
            className={cn(
              "focus-ring inline-flex min-h-target items-center gap-1 rounded-chip border px-1.5 text-cap font-medium lg:min-h-6",
              locked ? "border-dashed" : "border-solid",
              STYLE[kind],
              className,
            )}
          >
            <Icon />
            <span>{label}</span>
          </button>
        </Popover.Trigger>
      </Tooltip>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          sideOffset={6}
          collisionPadding={8}
          aria-label={name}
          className="focus-ring z-50 max-w-xs rounded-control border border-line-strong bg-panel-raised px-3 py-2 text-dense text-fg shadow-float"
        >
          {detail}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
