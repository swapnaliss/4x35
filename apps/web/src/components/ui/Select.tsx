import { Select as SelectPrimitive } from "radix-ui";
import { useId, useState } from "react";
import { useT } from "../../i18n";
import { cn } from "../../lib/cn";
import { IconCheck, IconChevronDown, IconFail } from "../icons";

export interface SelectOption {
  value: string;
  /** Already translated. */
  label: string;
  /** Secondary line, e.g. a pack's source and retrieved date (already translated). */
  description?: string;
  disabled?: boolean;
}

export interface SelectProps {
  label: string;
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Shown before a value is chosen; defaults to "Choose". */
  placeholder?: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  open?: boolean;
  id?: string;
  className?: string;
}

/** A labelled Radix Select: arrow keys, type-ahead, Escape and Home/End come from Radix. */
export function Select({
  label,
  options,
  value,
  defaultValue,
  onValueChange,
  placeholder,
  hint,
  error,
  disabled,
  open,
  id,
  className,
}: SelectProps) {
  const t = useT();
  const auto = useId();
  const triggerId = id ?? auto;
  const labelId = `${triggerId}-label`;
  const hintId = hint ? `${triggerId}-hint` : undefined;
  const errorId = error ? `${triggerId}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
  const rootProps = {
    ...(value !== undefined ? { value } : {}),
    ...(defaultValue !== undefined ? { defaultValue } : {}),
    ...(onValueChange ? { onValueChange } : {}),
    ...(disabled !== undefined ? { disabled } : {}),
    ...(open !== undefined ? { open } : {}),
  };
  // Radix hides the rest of the page (aria-hidden) while the list is open and traps focus in it;
  // the trigger leaves the tab order meanwhile so nothing hidden stays focusable.
  const [isOpen, setIsOpen] = useState(open ?? false);
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label id={labelId} htmlFor={triggerId} className="text-dense font-medium text-fg">
        {label}
      </label>
      <SelectPrimitive.Root {...rootProps} onOpenChange={setIsOpen}>
        <SelectPrimitive.Trigger
          id={triggerId}
          aria-labelledby={labelId}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          tabIndex={isOpen ? -1 : 0}
          className={cn(
            "focus-ring inline-flex min-h-target items-center justify-between gap-2 rounded-control border lg:min-h-9",
            "bg-panel px-3 text-left text-body text-fg disabled:cursor-not-allowed disabled:opacity-60",
            "data-[placeholder]:text-fg-muted",
            error ? "border-st-fail-line" : "border-line-strong",
          )}
        >
          <SelectPrimitive.Value placeholder={placeholder ?? t("components.select.placeholder")} />
          <SelectPrimitive.Icon>
            <IconChevronDown />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position="popper"
            sideOffset={4}
            className="z-50 max-h-[var(--radix-select-content-available-height)] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-control border border-line-strong bg-panel-raised text-fg shadow-float"
          >
            <SelectPrimitive.Viewport className="p-1">
              {options.length === 0 && (
                <p className="px-3 py-2 text-dense text-fg-muted">
                  {t("components.select.noOptions")}
                </p>
              )}
              {options.map((o) => (
                <SelectPrimitive.Item
                  key={o.value}
                  value={o.value}
                  {...(o.description ? { "aria-labelledby": `${triggerId}-${o.value}-name` } : {})}
                  {...(o.disabled !== undefined ? { disabled: o.disabled } : {})}
                  className={cn(
                    "relative flex min-h-target cursor-default flex-col justify-center rounded-chip py-1 pr-3 pl-8 text-body outline-none select-none lg:min-h-8",
                    "data-[highlighted]:bg-row-selected data-[highlighted]:shadow-[inset_3px_0_0_var(--color-primary)]",
                    "data-[disabled]:opacity-60",
                  )}
                >
                  <SelectPrimitive.ItemIndicator className="absolute top-1/2 left-2 inline-flex -translate-y-1/2">
                    <IconCheck />
                  </SelectPrimitive.ItemIndicator>
                  {/* With a secondary line, the option's name is label + line, so every
                      visible word is in the name (WCAG 2.5.3); the trigger shows the label only. */}
                  <span id={`${triggerId}-${o.value}-name`} className="flex flex-col">
                    <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                    {o.description && (
                      <span className="text-cap text-fg-muted">{o.description}</span>
                    )}
                  </span>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
      {error && (
        <p id={errorId} className="flex items-start gap-1 text-dense text-st-fail">
          <IconFail className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}
      {hint && (
        <p id={hintId} className="text-dense text-fg-muted">
          {hint}
        </p>
      )}
    </div>
  );
}
