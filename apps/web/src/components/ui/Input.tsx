import { type ChangeEvent, forwardRef, type InputHTMLAttributes, useId, useState } from "react";
import { useT } from "../../i18n";
import { cn } from "../../lib/cn";
import { IconFail } from "../icons";

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "maxLength"> {
  /** Visible label (already translated). Every input has one; placeholders never replace it. */
  label: string;
  /** ISO element name shown in mono beside the label, e.g. `TwnNm`. Never translated. */
  element?: string;
  /** Helper text shown under the field. */
  hint?: string;
  /** Validation message; marks the field invalid and is announced with it. */
  error?: string;
  /**
   * Length limit of an ISO field. Shows "8 / 35"; past the limit the field turns invalid with a
   * message naming both numbers. The text is never cut (CLAUDE.md: never truncate).
   */
  maxChars?: number;
  id?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    element,
    hint,
    error,
    maxChars,
    id,
    className,
    disabled,
    required,
    onChange,
    value,
    defaultValue,
    ...rest
  },
  ref,
) {
  const t = useT();
  const auto = useId();
  const inputId = id ?? auto;
  const [length, setLength] = useState(() => String(value ?? defaultValue ?? "").length);
  const used = value !== undefined ? String(value).length : length;
  const over = maxChars !== undefined && used > maxChars;
  const message =
    error ??
    (over
      ? t("components.input.overLimit", { used, max: maxChars ?? 0, element: element ?? label })
      : undefined);
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = message ? `${inputId}-error` : undefined;
  const counterId = maxChars !== undefined ? `${inputId}-counter` : undefined;
  const describedBy = [errorId, hintId, counterId].filter(Boolean).join(" ") || undefined;
  const handle = (e: ChangeEvent<HTMLInputElement>) => {
    setLength(e.target.value.length);
    onChange?.(e);
  };
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label
        htmlFor={inputId}
        className="flex flex-wrap items-baseline gap-2 text-dense font-medium text-fg"
      >
        <span>{label}</span>
        {element && <span className="font-code text-cap text-fg-muted">{element}</span>}
        {required && (
          <span className="text-cap font-normal text-fg-muted">
            {t("components.input.required")}
          </span>
        )}
      </label>
      <input
        ref={ref}
        id={inputId}
        disabled={disabled}
        required={required}
        aria-invalid={message ? true : undefined}
        aria-describedby={describedBy}
        onChange={handle}
        {...(value !== undefined ? { value } : {})}
        {...(defaultValue !== undefined ? { defaultValue } : {})}
        className={cn(
          "focus-ring min-h-target rounded-control border bg-panel px-3 text-body text-fg lg:min-h-9",
          "placeholder:text-fg-muted disabled:cursor-not-allowed disabled:opacity-60",
          message ? "border-st-fail-line" : "border-line-strong",
        )}
        {...rest}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          {message && (
            <p id={errorId} className="flex items-start gap-1 text-dense text-st-fail">
              <IconFail className="mt-0.5 shrink-0" />
              <span>{message}</span>
            </p>
          )}
          {hint && (
            <p id={hintId} className="text-dense text-fg-muted">
              {hint}
            </p>
          )}
        </div>
        {maxChars !== undefined && (
          <p
            id={counterId}
            className={cn(
              "tabular shrink-0 font-code text-cap",
              over ? "text-st-fail" : "text-fg-muted",
            )}
          >
            {t("components.input.counter", { used, max: maxChars })}
          </p>
        )}
      </div>
    </div>
  );
});
