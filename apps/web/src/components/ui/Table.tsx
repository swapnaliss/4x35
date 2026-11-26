import { type HTMLAttributes, type TdHTMLAttributes, type ThHTMLAttributes, useId } from "react";
import { useT } from "../../i18n";
import { cn } from "../../lib/cn";
import { IconSortAsc, IconSortDesc, IconSortNone } from "../icons";

/**
 * Semantic table parts, dense by default (calm density). A selected row is `aria-selected`, a
 * tinted fill and a 3px left bar, never colour alone; feature grids pair it with a checked checkbox.
 * Keyboard-navigable grids (review, pre-flight) set `role="grid"` on Table and own their row
 * focus; M2-18 adds the virtualised body. The scroll wrapper keeps wide tables usable at 375px.
 */
export interface TableProps extends HTMLAttributes<HTMLTableElement> {
  /** Keeps the header visible while the body scrolls inside the wrapper. */
  stickyHeader?: boolean;
  /**
   * What the table shows (already translated). Rendered above the scroll area so it wraps and is
   * never clipped at 375; it names both the table and its scroll region.
   */
  caption?: string;
}

/**
 * The scroll area is a labelled, focusable region (arrow keys scroll it) with shadow cues at the
 * edges that still have columns to show.
 */
export function Table({ className, stickyHeader, caption, ...props }: TableProps) {
  const id = useId();
  const captionId = caption ? `${id}-caption` : undefined;
  return (
    <div className="flex w-full flex-col gap-2">
      {caption && (
        <p id={captionId} className="text-dense text-fg-muted">
          {caption}
        </p>
      )}
      <div
        className={cn(
          "scroll-cue-x focus-ring w-full overflow-x-auto rounded-panel border border-line",
          stickyHeader && "max-h-[20rem] overflow-y-auto",
        )}
        {...(captionId ? { role: "region", "aria-labelledby": captionId, tabIndex: 0 } : {})}
      >
        <table
          data-sticky={stickyHeader ? "" : undefined}
          {...(captionId ? { "aria-labelledby": captionId } : {})}
          className={cn(
            "w-full border-collapse text-dense text-fg",
            "[&[data-sticky]_thead]:sticky [&[data-sticky]_thead]:top-0 [&[data-sticky]_thead]:z-10",
            "[&[data-sticky]_thead]:shadow-low",
            className,
          )}
          {...props}
        />
      </div>
    </div>
  );
}

export function TableCaption({ className, ...props }: HTMLAttributes<HTMLTableCaptionElement>) {
  return (
    <caption className={cn("px-3 py-2 text-left text-dense text-fg-muted", className)} {...props} />
  );
}

export function TableHeader({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("bg-panel-raised", className)} {...props} />;
}

export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("bg-transparent", className)} {...props} />;
}

export interface TableRowProps extends HTMLAttributes<HTMLTableRowElement> {
  selected?: boolean;
}

export function TableRow({ className, selected, ...props }: TableRowProps) {
  return (
    <tr
      aria-selected={selected === undefined ? undefined : selected}
      data-selected={selected ? "" : undefined}
      className={cn(
        "border-t border-line first:border-t-0 hover:bg-row-hover",
        "data-[selected]:bg-row-selected data-[selected]:shadow-[inset_3px_0_0_var(--color-primary)]",
        "focus-ring focus-visible:-outline-offset-2",
        className,
      )}
      {...props}
    />
  );
}

export type SortDirection = "ascending" | "descending" | "none";

export interface TableHeadProps extends ThHTMLAttributes<HTMLTableCellElement> {
  /** Set on sortable columns; the header becomes a button and carries `aria-sort`. */
  sort?: SortDirection;
  onSort?: () => void;
  numeric?: boolean;
}

export function TableHead({
  className,
  scope = "col",
  sort,
  onSort,
  numeric,
  children,
  ...props
}: TableHeadProps) {
  const t = useT();
  const base = cn(
    "px-3 py-2 text-left text-cap font-semibold tracking-wide text-fg-muted uppercase",
    numeric && "text-right",
    className,
  );
  if (sort === undefined) {
    return (
      <th scope={scope} className={base} {...props}>
        {children}
      </th>
    );
  }
  const Icon =
    sort === "ascending" ? IconSortAsc : sort === "descending" ? IconSortDesc : IconSortNone;
  return (
    <th scope={scope} aria-sort={sort} className={base} {...props}>
      <button
        type="button"
        onClick={onSort}
        className="focus-ring -mx-1 inline-flex min-h-target items-center gap-1 rounded-chip px-1 uppercase hover:text-fg lg:min-h-6"
      >
        {children}
        <Icon />
        {sort !== "none" && (
          <span className="sr-only">
            {t(
              sort === "ascending"
                ? "components.table.sortAscending"
                : "components.table.sortDescending",
            )}
          </span>
        )}
      </button>
    </th>
  );
}

export interface TableCellProps extends TdHTMLAttributes<HTMLTableCellElement> {
  numeric?: boolean;
}

export function TableCell({ className, numeric, ...props }: TableCellProps) {
  return (
    <td
      className={cn("px-3 py-2 align-top", numeric && "tabular text-right", className)}
      {...props}
    />
  );
}

export interface TableSelectProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Already translated row name, e.g. the record id, used in the checkbox's accessible name. */
  rowName?: string;
  disabled?: boolean;
}

/** Leading checkbox cell: row selection is a checked box, never only a tinted row. */
export function TableSelectCell({ checked, onCheckedChange, rowName, disabled }: TableSelectProps) {
  const t = useT();
  return (
    <td className="w-0 px-1 py-0 align-middle">
      <SelectBox
        checked={checked}
        onCheckedChange={onCheckedChange}
        label={
          rowName
            ? t("components.table.selectRowNamed", { row: rowName })
            : t("components.table.selectRow")
        }
        disabled={disabled}
      />
    </td>
  );
}

/** Header checkbox that selects every row that can be bulk approved. */
export function TableSelectAllHead({
  checked,
  onCheckedChange,
  disabled,
}: Omit<TableSelectProps, "rowName">) {
  const t = useT();
  return (
    <th scope="col" className="w-0 px-1 py-0 align-middle">
      <SelectBox
        checked={checked}
        onCheckedChange={onCheckedChange}
        label={t("components.table.selectAll")}
        disabled={disabled}
      />
    </th>
  );
}

function SelectBox({
  checked,
  onCheckedChange,
  label,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean | undefined;
}) {
  // The label is the 44px (24px at desktop) hit area around a 16px native checkbox.
  return (
    <label className="inline-flex min-h-target min-w-target cursor-pointer items-center justify-center lg:min-h-8 lg:min-w-8">
      <input
        type="checkbox"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onCheckedChange(e.target.checked)}
        className="focus-ring h-4 w-4 cursor-pointer accent-[var(--color-primary)]"
      />
    </label>
  );
}
