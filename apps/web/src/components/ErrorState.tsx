import { useState } from "react";
import { useT } from "../i18n";
import { cn } from "../lib/cn";
import { toProblem } from "../lib/problem";
import { IconCopy, IconFail } from "./icons";
import { Button } from "./ui/Button";

export interface ErrorStateProps {
  /** A problem+json body, or anything thrown; unknown shapes fall back to generic copy. */
  problem?: unknown;
  onRetry?: () => void;
  retrying?: boolean;
  /** 401: send the person to sign-in. */
  onSignIn?: () => void;
  /** 409: load the latest version of the record. */
  onReload?: () => void;
  /** 403: the person's role, named in the explanation (already translated). */
  memberRole?: string;
  /** The browser is offline: nothing was saved. */
  offline?: boolean;
  /** `role="alert"` when this replaces content right after a user action; polite otherwise. */
  assertive?: boolean;
  headingLevel?: 1 | 2 | 3 | 4;
  className?: string;
}

/**
 * RFC 9457 aware error panel: what happened (title), why (detail, field errors), what to do
 * (one action), plus "Error {{status}}" and the trace id with a copy button for support.
 */
export function ErrorState({
  problem,
  onRetry,
  retrying,
  onSignIn,
  onReload,
  memberRole,
  offline,
  assertive,
  headingLevel = 2,
  className,
}: ErrorStateProps) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const p = toProblem(problem);
  const Heading = `h${headingLevel}` as const;

  let detail = p.detail;
  if (offline) detail = t("components.errorState.offline");
  else if (p.status === 403 && memberRole)
    detail = t("components.errorState.forbidden", { role: memberRole });
  else if (p.status === 429 && p.retryAfter !== undefined)
    detail = t("components.errorState.retryAfter", { seconds: p.retryAfter });
  detail ??= t("components.errorState.fallbackDetail");

  let action: { label: string; onClick: () => void } | undefined;
  if (p.status === 401 && onSignIn)
    action = { label: t("components.errorState.signInAgain"), onClick: onSignIn };
  else if (p.status === 409 && onReload)
    action = { label: t("components.errorState.reloadLatest"), onClick: onReload };
  else if (p.status !== 403 && onRetry)
    action = { label: t("components.errorState.retry"), onClick: onRetry };

  const copy = async () => {
    if (!p.instance) return;
    try {
      await navigator.clipboard.writeText(p.instance);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section
      {...(assertive ? { role: "alert" } : { "aria-live": "polite" as const })}
      className={cn(
        "flex flex-col gap-3 rounded-panel border-2 border-st-fail-line bg-panel p-5",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <IconFail className="mt-1 shrink-0 text-st-fail" />
        <div className="flex min-w-0 flex-col gap-1">
          <Heading className="text-lead font-semibold text-fg">
            {offline
              ? t("components.errorState.offlineTitle")
              : (p.title ?? t("components.errorState.title"))}
          </Heading>
          {p.status !== undefined && (
            <p className="tabular text-dense text-fg-muted">
              {t("components.errorState.status", { status: p.status })}
            </p>
          )}
          <p className="text-dense text-fg">{detail}</p>
          {p.errors && (
            <ul className="list-disc pl-5 text-dense text-fg">
              {p.errors.map((e) => (
                <li key={`${e.pointer ?? ""}${e.detail}`}>
                  {e.pointer && (
                    <code className="mr-1 font-code text-cap text-fg-muted">{e.pointer}</code>
                  )}
                  {e.detail}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {p.instance && (
        <div className="flex flex-wrap items-center gap-2 text-dense">
          <span className="text-fg-muted">{t("components.errorState.traceId")}</span>
          <code className="font-code text-cap break-all text-fg">{p.instance}</code>
          <Button size="sm" variant="ghost" onClick={copy}>
            <IconCopy />
            {t("components.errorState.copyTraceId")}
          </Button>
          <span aria-live="polite" className="text-cap text-fg-muted">
            {copied ? t("components.errorState.copied") : ""}
          </span>
        </div>
      )}
      {action && (
        <div>
          <Button variant="secondary" onClick={action.onClick} loading={retrying ?? false}>
            {action.label}
          </Button>
        </div>
      )}
    </section>
  );
}
