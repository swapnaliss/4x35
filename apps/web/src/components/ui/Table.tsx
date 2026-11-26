import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
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
  /** Accessible name for the scroll region when the table scrolls (already translated). */
  regionLabel?: string;
}

export function Table({ className, stickyHeader, regionLabel, ...props }: TableProps) {
  return (
    <div
      className={cn(
        "w-full overflow-x-auto rounded-panel border border-line",
        stickyHeader && "max-h-[32rem] overflow-y-auto",
        regionLabel && "focus-ring",
      )}
      {...(regionLabel ? { role: "region", "aria-label": regionLabel, tabIndex: 0 } : {})}
    >
      <table
        data-sticky={stickyHeader ? "" : undefined}
        className={cn(
          "w-full border-collapse text-dense text-fg",
          "[&[data-sticky]_thead]:sticky [&[data-sticky]_thead]:top-0",
          className,
        )}
        {...props}
      />
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
  return <tbody className={cn("bg-panel", className)} {...props} />;
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
