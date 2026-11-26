import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { EmptyState } from "../src/components/EmptyState";
import { ErrorState } from "../src/components/ErrorState";
import { ProgressPanel } from "../src/components/ProgressPanel";
import {
  NEVER_AUTO_APPROVABLE,
  PROVENANCE_KINDS,
  ProvenanceChip,
} from "../src/components/ProvenanceChip";
import { STATUSES, StatusBadge } from "../src/components/StatusBadge";
import { Button, type ButtonVariant } from "../src/components/ui/Button";
import { Dialog, DialogContent, DialogTrigger } from "../src/components/ui/Dialog";
import { Input } from "../src/components/ui/Input";
import { Select } from "../src/components/ui/Select";
import { Skeleton } from "../src/components/ui/Skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../src/components/ui/Table";
import { Toast, ToastProvider, type ToastVariant } from "../src/components/ui/Toast";
import { Tooltip, TooltipProvider } from "../src/components/ui/Tooltip";
import { t } from "../src/i18n";

// M1-06 AC 2: every component in every state; interactive ones are keyboard reachable (in the tab
// order and focusable) and carry the shared visible-focus style. Playwright measures the ring.
// Test copy reuses real keys so nothing user-visible is a literal here either.
const TABBABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"]), a[href]';
const A = t("components.errorState.title");
const B = t("components.errorState.fallbackDetail");
const RETRY = t("components.errorState.retry");

function expectKeyboardReachable(el: HTMLElement) {
  expect(Array.from(document.querySelectorAll<HTMLElement>(TABBABLE))).toContain(el);
  act(() => el.focus());
  expect(document.activeElement).toBe(el);
  expect(el.className).toContain("focus-ring");
}

const tips = (ui: ReactElement) => <TooltipProvider delayDuration={0}>{ui}</TooltipProvider>;

describe("Button", () => {
  const variants: ButtonVariant[] = ["primary", "secondary", "ghost", "danger"];
  for (const v of variants) {
    it(`${v}: default, disabled, disabled with reason, loading`, async () => {
      const onClick = vi.fn();
      const { rerender } = render(
        tips(
          <Button variant={v} onClick={onClick}>
            {RETRY}
          </Button>,
        ),
      );
      const b = screen.getByRole("button", { name: RETRY });
      expect(b.dataset.variant).toBe(v);
      expectKeyboardReachable(b);
      fireEvent.click(b);
      expect(onClick).toHaveBeenCalledTimes(1);

      rerender(
        tips(
          <Button variant={v} onClick={onClick} disabled>
            {RETRY}
          </Button>,
        ),
      );
      expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);

      rerender(
        tips(
          <Button variant={v} onClick={onClick} disabledReason={B}>
            {RETRY}
          </Button>,
        ),
      );
      const soft = screen.getByRole("button");
      expect(soft.getAttribute("aria-disabled")).toBe("true");
      expectKeyboardReachable(soft);
      fireEvent.click(soft);
      expect(onClick).toHaveBeenCalledTimes(1);
      fireEvent.focus(soft);
      expect((await screen.findByRole("tooltip")).textContent).toContain(B);

      rerender(
        tips(
          <Button variant={v} onClick={onClick} loading>
            {RETRY}
          </Button>,
        ),
      );
      const busy = screen.getByRole("button");
      expect(busy.getAttribute("aria-busy")).toBe("true");
      expect(within(busy).getByText(t("components.button.loading"))).toBeTruthy();
      fireEvent.click(busy);
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  }
});

describe("Input", () => {
  const LABEL = t("components.errorState.traceId");
  it("default with hint, required, invalid, disabled", () => {
    const { rerender } = render(<Input label={LABEL} element="TwnNm" hint={B} required />);
    const input = screen.getByRole("textbox");
    expectKeyboardReachable(input);
    expect(screen.getByRole("textbox", { description: B })).toBe(input);
    expect(input.hasAttribute("aria-invalid")).toBe(false);
    expect(screen.getByText(t("components.input.required"))).toBeTruthy();

    rerender(<Input label={LABEL} error={A} />);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("textbox", { description: A })).toBe(input);

    rerender(<Input label={LABEL} disabled />);
    expect((input as HTMLInputElement).disabled).toBe(true);
  });

  it("counts characters and turns invalid past the limit without cutting the text", () => {
    render(<Input label={LABEL} element="TwnNm" maxChars={5} defaultValue="abc" />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(screen.getByText(t("components.input.counter", { used: 3, max: 5 }))).toBeTruthy();
    fireEvent.change(input, { target: { value: "abcdefg" } });
    expect(input.value).toBe("abcdefg");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(
      screen.getByText(t("components.input.overLimit", { used: 7, max: 5, element: "TwnNm" })),
    ).toBeTruthy();
  });
});

describe("Select", () => {
  const options = STATUSES.map((s) => ({
    value: s,
    label: t(`status.${s}.label`),
    description: B,
  }));
  const LABEL = t("components.errorState.traceId");
  it("placeholder, open from the keyboard, choose, chosen value, invalid, disabled, no options", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <Select label={LABEL} options={options} onValueChange={onChange} />,
    );
    const trigger = screen.getByRole("combobox", { name: LABEL });
    expect(trigger.textContent).toContain(t("components.select.placeholder"));
    expectKeyboardReachable(trigger);
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.click(screen.getByRole("option", { name: new RegExp(t("status.pass.label")) }));
    expect(onChange).toHaveBeenCalledWith("pass");

    rerender(<Select label={LABEL} options={options} value="fail" error={A} />);
    expect(trigger.textContent).toContain(t("status.fail.label"));
    expect(trigger.getAttribute("aria-invalid")).toBe("true");

    rerender(<Select label={LABEL} options={options} disabled />);
    expect((trigger as HTMLButtonElement).disabled).toBe(true);

    rerender(<Select label={LABEL} options={[]} open />);
    expect(screen.getByText(t("components.select.noOptions"))).toBeTruthy();
  });
});

describe("Table", () => {
  it("plain and sortable headers, selected rows, numeric cells", () => {
    const onSort = vi.fn();
    render(
      <Table stickyHeader regionLabel={A}>
        <TableHeader>
          <TableRow>
            <TableHead>{t("status.pass.label")}</TableHead>
            <TableHead sort="ascending" onSort={onSort}>
              {t("status.fail.label")}
            </TableHead>
            <TableHead sort="none">{t("status.review.label")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow selected>
            <TableCell>{t("status.fail.label")}</TableCell>
            <TableCell numeric>42</TableCell>
            <TableCell />
          </TableRow>
          <TableRow selected={false}>
            <TableCell>{t("status.review.label")}</TableCell>
            <TableCell numeric>7</TableCell>
            <TableCell />
          </TableRow>
        </TableBody>
      </Table>,
    );
    const heads = screen.getAllByRole("columnheader");
    expect(heads[0]?.getAttribute("scope")).toBe("col");
    expect(heads[0]?.hasAttribute("aria-sort")).toBe(false);
    expect(heads[1]?.getAttribute("aria-sort")).toBe("ascending");
    expect(heads[2]?.getAttribute("aria-sort")).toBe("none");
    const sortButton = within(heads[1] as HTMLElement).getByRole("button");
    expect(sortButton.textContent).toContain(t("components.table.sortAscending"));
    expectKeyboardReachable(sortButton);
    fireEvent.click(sortButton);
    expect(onSort).toHaveBeenCalled();
    const rows = screen.getAllByRole("row");
    expect(rows[1]?.getAttribute("aria-selected")).toBe("true");
    expect(rows[2]?.getAttribute("aria-selected")).toBe("false");
    expect(screen.getByRole("region", { name: A })).toBeTruthy();
  });
});

describe("Dialog", () => {
  it("closed; open with title focused, description, footer; Escape closes; busy blocks closing", () => {
    const { unmount } = render(
      <Dialog>
        <DialogTrigger asChild>
          <Button>{RETRY}</Button>
        </DialogTrigger>
        <DialogContent
          title={A}
          description={B}
          footer={<Button>{t("components.dialog.cancel")}</Button>}
        />
      </Dialog>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: RETRY }));
    const dialog = screen.getByRole("dialog", { name: A });
    expect(screen.getByRole("dialog", { description: B })).toBe(dialog);
    expect(document.activeElement?.textContent).toBe(A);
    const close = within(dialog).getByRole("button", { name: t("components.dialog.close") });
    expectKeyboardReachable(close);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();

    unmount();
    render(
      <Dialog defaultOpen>
        <DialogContent title={A} busy />
      </Dialog>,
    );
    const busy = screen.getByRole("dialog");
    expect(busy.getAttribute("aria-busy")).toBe("true");
    fireEvent.keyDown(busy, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});

describe("Toast", () => {
  const variants: ToastVariant[] = ["info", "success", "error"];
  for (const v of variants) {
    it(`${v}: title, description, action and a reachable dismiss button`, () => {
      const onUndo = vi.fn();
      render(
        <ToastProvider>
          <Toast
            variant={v}
            title={A}
            description={B}
            action={{ label: t("components.toast.undo"), onClick: onUndo }}
            open
          />
        </ToastProvider>,
      );
      expect(screen.getAllByText(A).length).toBeGreaterThan(0);
      const dismiss = screen.getByRole("button", { name: t("components.toast.dismiss") });
      expectKeyboardReachable(dismiss);
      fireEvent.click(screen.getByRole("button", { name: t("components.toast.undo") }));
      expect(onUndo).toHaveBeenCalled();
      expect(document.querySelector(`[data-variant="${v}"]`)).not.toBeNull();
    });
  }
  it("the region is named", () => {
    render(<ToastProvider>{null}</ToastProvider>);
    expect(
      screen.getByRole("region", { name: new RegExp(t("components.toast.region")) }),
    ).toBeTruthy();
  });
});

describe("Tooltip", () => {
  it("opens on keyboard focus of its trigger", async () => {
    render(
      tips(
        <Tooltip content={B}>
          <button type="button" className="focus-ring">
            {RETRY}
          </button>
        </Tooltip>,
      ),
    );
    const trigger = screen.getByRole("button");
    expectKeyboardReachable(trigger);
    fireEvent.focus(trigger);
    expect((await screen.findByRole("tooltip")).textContent).toContain(B);
  });
});

describe("Skeleton", () => {
  for (const variant of ["text", "badge", "row", "block"] as const) {
    it(`${variant} is decorative`, () => {
      const { container } = render(<Skeleton variant={variant} />);
      const el = container.firstElementChild;
      expect(el?.getAttribute("aria-hidden")).toBe("true");
      expect(el?.getAttribute("data-skeleton")).toBe(variant);
    });
  }
});

describe("StatusBadge (AC 4)", () => {
  for (const s of STATUSES) {
    it(`${s}: an icon and a text label, never colour alone`, () => {
      const { container } = render(<StatusBadge status={s} />);
      const badge = container.querySelector(`[data-status="${s}"]`);
      expect(badge).not.toBeNull();
      const icon = badge?.querySelector(`svg[data-icon="${s}"]`);
      expect(icon).not.toBeNull();
      expect(icon?.getAttribute("aria-hidden")).toBe("true");
      const label = t(`status.${s}.label`);
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toBe(`status.${s}.label`);
      expect(badge?.textContent).toBe(label);
    });
  }
  it("each status has its own label", () => {
    expect(new Set(STATUSES.map((s) => t(`status.${s}.label`))).size).toBe(STATUSES.length);
  });
  it("with a count, a description tooltip, and as a link", async () => {
    const { rerender } = render(tips(<StatusBadge status="fail" count={412} />));
    const withCount = t("components.statusBadge.withCount", {
      label: t("status.fail.label"),
      count: "412",
    });
    expect(screen.getByText(withCount)).toBeTruthy();
    rerender(tips(<StatusBadge status="review" description={B} />));
    const focusable = document.querySelector('[data-status="review"]') as HTMLElement;
    expectKeyboardReachable(focusable);
    fireEvent.focus(focusable);
    expect((await screen.findByRole("tooltip")).textContent).toContain(B);
    rerender(tips(<StatusBadge status="pass" href="#finding-1" />));
    expectKeyboardReachable(screen.getByRole("link", { name: t("status.pass.label") }));
  });
});

describe("ProvenanceChip", () => {
  for (const k of PROVENANCE_KINDS) {
    it(`${k}: icon + label, border style, accessible name with reason, tooltip on Enter or tap`, async () => {
      render(tips(<ProvenanceChip kind={k} reason={B} />));
      const chip = screen.getByRole("button");
      const label = t(`provenance.${k}.label`);
      expect(chip.textContent).toBe(label);
      expect(chip.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
      const locked = NEVER_AUTO_APPROVABLE.has(k);
      const name = t(
        locked
          ? "components.provenanceChip.accessibleNameNeedsApproval"
          : "components.provenanceChip.accessibleName",
        { label, reason: B },
      );
      expect(screen.getByRole("button", { name })).toBe(chip);
      expect(chip.className).toContain(locked ? "border-dashed" : "border-solid");
      expect(chip.dataset.autoApprovable).toBe(locked ? "false" : "true");
      expectKeyboardReachable(chip);
      fireEvent.focus(chip);
      const tip = await screen.findByRole("tooltip");
      expect(tip.textContent).toContain(B);
      expect(tip.textContent?.includes(t("components.provenanceChip.needsApproval"))).toBe(locked);
      fireEvent.click(chip);
      const pop = await screen.findByRole("dialog", { name });
      expect(pop.textContent).toContain(B);
      expect(chip.getAttribute("aria-expanded")).toBe("true");
    });
  }
});

describe("EmptyState", () => {
  it("default title; with body, action and secondary link, centre aligned", () => {
    const { rerender } = render(<EmptyState />);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
      t("components.emptyState.defaultTitle"),
    );
    rerender(
      <EmptyState
        title={A}
        body={B}
        headingLevel={3}
        align="center"
        action={<Button>{RETRY}</Button>}
        secondary={<a href="#help">{t("components.toast.view")}</a>}
      />,
    );
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe(A);
    expect(screen.getByText(B)).toBeTruthy();
    expectKeyboardReachable(screen.getByRole("button"));
    expect(screen.getByRole("link")).toBeTruthy();
  });
});

describe("ErrorState", () => {
  it("unknown error: generic title and fallback detail, no action without a handler", () => {
    render(<ErrorState problem={new Error("boom")} />);
    expect(screen.getByRole("heading").textContent).toBe(t("components.errorState.title"));
    expect(screen.getByText(t("components.errorState.fallbackDetail"))).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("problem+json: title, status, detail, field errors, trace id with copy, retry", async () => {
    const onRetry = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(
      <ErrorState
        problem={{
          title: "Upload too large",
          status: 413,
          detail: "Max 20 MB.",
          instance: "req_7f3a",
          errors: [{ pointer: "/file", detail: "31 MB" }],
        }}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole("heading").textContent).toBe("Upload too large");
    expect(screen.getByText(t("components.errorState.status", { status: 413 }))).toBeTruthy();
    expect(screen.getByText("Max 20 MB.")).toBeTruthy();
    expect(screen.getByText("31 MB")).toBeTruthy();
    expect(screen.getByText("req_7f3a")).toBeTruthy();
    const copy = screen.getByRole("button", { name: t("components.errorState.copyTraceId") });
    expectKeyboardReachable(copy);
    await act(async () => {
      fireEvent.click(copy);
    });
    expect(writeText).toHaveBeenCalledWith("req_7f3a");
    expect(screen.getByText(t("components.errorState.copied"))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: RETRY }));
    expect(onRetry).toHaveBeenCalled();
  });
  it("401 offers sign-in, 403 names the role, 409 offers reload, 429 says when, offline, retrying, assertive", () => {
    const { rerender } = render(
      <ErrorState problem={{ status: 401 }} onSignIn={() => {}} onRetry={() => {}} />,
    );
    expect(
      screen.getByRole("button", { name: t("components.errorState.signInAgain") }),
    ).toBeTruthy();
    rerender(<ErrorState problem={{ status: 403 }} memberRole="Viewer" onRetry={() => {}} />);
    expect(screen.getByText(t("components.errorState.forbidden", { role: "Viewer" }))).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    rerender(<ErrorState problem={{ status: 409 }} onReload={() => {}} />);
    expect(
      screen.getByRole("button", { name: t("components.errorState.reloadLatest") }),
    ).toBeTruthy();
    rerender(<ErrorState problem={{ status: 429, retryAfter: 30 }} />);
    expect(screen.getByText(t("components.errorState.retryAfter", { seconds: 30 }))).toBeTruthy();
    rerender(<ErrorState offline />);
    expect(screen.getByText(t("components.errorState.offline"))).toBeTruthy();
    rerender(<ErrorState problem={{ status: 500 }} onRetry={() => {}} retrying assertive />);
    expect(screen.getByRole("button").getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});

describe("ProgressPanel", () => {
  const step = { current: 3, steps: 4, name: B };
  it("determinate: step, done / total, native progress, updated time", () => {
    render(<ProgressPanel label={A} step={step} done={300} total={1200} updated="14:02:11" />);
    const bar = screen.getByRole("progressbar", { name: A }) as HTMLProgressElement;
    expect(bar.tagName).toBe("PROGRESS");
    expect(bar.value).toBe(300);
    expect(bar.max).toBe(1200);
    expect(
      screen.getByText(t("components.progressPanel.step", { current: 3, steps: 4, stepName: B })),
    ).toBeTruthy();
    expect(
      screen.getByText(t("components.progressPanel.counter", { done: "300", total: "1,200" })),
    ).toBeTruthy();
    expect(
      screen.getByText(t("components.progressPanel.updated", { time: "14:02:11" })),
    ).toBeTruthy();
    expect(screen.getByRole("status")).toBeTruthy();
    expect(document.querySelector('[data-status="running"]')).not.toBeNull();
  });
  it("indeterminate still names the step", () => {
    render(<ProgressPanel label={A} step={step} />);
    expect((screen.getByRole("progressbar") as HTMLProgressElement).hasAttribute("value")).toBe(
      false,
    );
    expect(
      screen.getByText(t("components.progressPanel.indeterminate", { stepName: B })),
    ).toBeTruthy();
  });
  it("stalled, failed and completed", () => {
    const { rerender } = render(
      <ProgressPanel label={A} step={step} state="stalled" stalledSeconds={45} />,
    );
    expect(screen.getByText(t("components.progressPanel.stalled", { seconds: 45 }))).toBeTruthy();
    expect(document.querySelector('[data-status="warning"]')).not.toBeNull();
    rerender(
      <ProgressPanel label={A} step={step} state="failed" failureReason={B} done={4} total={10} />,
    );
    expect(
      screen.getByText(t("components.progressPanel.failed", { current: 3, reason: B })),
    ).toBeTruthy();
    expect(document.querySelector('[data-status="fail"]')).not.toBeNull();
    rerender(
      <ProgressPanel
        label={A}
        step={step}
        state="completed"
        duration="42 s"
        done={10}
        total={10}
      />,
    );
    expect(
      screen.getByText(t("components.progressPanel.completed", { duration: "42 s" })),
    ).toBeTruthy();
    expect(document.querySelector('[data-status="pass"]')).not.toBeNull();
  });
});
