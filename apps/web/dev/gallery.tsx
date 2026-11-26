/**
 * Component gallery: every component in every state, for screenshots, axe and design review.
 * Dev server only (`npm run gallery -w apps/web`, then /dev/gallery.html). It is not a build input,
 * and the M1-06 gate fails if the marker below ever reaches apps/web/dist/.
 *
 * Query parameters: `theme=light|dark` (default: follows the OS) and
 * `view=all|dialog|dialog-destructive|dialog-busy|tooltip|toast|select`.
 * Hover, active and focus states are captured by e2e/gallery-a11y.spec.ts driving the real
 * pointer and keyboard, not by faked classes.
 * Section headings here are developer-facing and stay literal; component copy comes from i18n keys
 * and the sample values stand in for server data. All sample data is synthetic.
 */
import { type ReactNode, StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { EmptyState } from "../src/components/EmptyState";
import { ErrorState } from "../src/components/ErrorState";
import { ProgressPanel } from "../src/components/ProgressPanel";
import {
  PROVENANCE_KINDS,
  ProvenanceChip,
  type ProvenanceKind,
} from "../src/components/ProvenanceChip";
import { STATUSES, type Status, StatusBadge } from "../src/components/StatusBadge";
import { Button } from "../src/components/ui/Button";
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
  TableSelectAllHead,
  TableSelectCell,
} from "../src/components/ui/Table";
import { Toast, ToastProvider } from "../src/components/ui/Toast";
import { Tooltip, TooltipProvider } from "../src/components/ui/Tooltip";
import { t } from "../src/i18n";
import "../src/styles/app.css";

export const GALLERY_MARKER = "4x35-gallery-entry";

const params = new URLSearchParams(window.location.search);
const theme = params.get("theme");
if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
const view = params.get("view") ?? "all";

const PACK = "cbpr-plus-generic@2026.11";

// Synthetic sample rows (fictitious suppliers and towns).
const ROWS: {
  id: string;
  name: string;
  country: string;
  town: string;
  lines: number;
  status: Status;
}[] = [
  {
    id: "R-0001",
    name: "Marrow & Finch Supplies",
    country: "DE",
    town: "Lindenhof",
    lines: 3,
    status: "pass",
  },
  {
    id: "R-0002",
    name: "Kestrel Lane Tooling",
    country: "JP",
    town: "",
    lines: 4,
    status: "review",
  },
  {
    id: "R-0003",
    name: "Opaline Freight Co-op",
    country: "IN",
    town: "Varunapuram",
    lines: 4,
    status: "fail",
  },
  {
    id: "R-0004",
    name: "Tidewell Payroll Bureau",
    country: "FR",
    town: "Saint-Arbel",
    lines: 2,
    status: "approved",
  },
];
const MANY = Array.from({ length: 12 }, (_, i) => ({
  id: `R-${String(i + 101).padStart(4, "0")}`,
  status: STATUSES[i % STATUSES.length] as Status,
  lines: (i % 4) + 1,
}));

const PACKS = [
  { value: PACK, label: PACK, description: "Source retrieved 18 Nov 2026" },
  {
    value: "nordic-sample@2026.11",
    label: "nordic-sample@2026.11",
    description: "Source retrieved 18 Nov 2026",
  },
  {
    value: "continental-sample@2026.11",
    label: "continental-sample@2026.11",
    description: "Not available: no rules published yet",
    disabled: true,
  },
];
const FORMS = [
  { value: "structured", label: "Structured" },
  { value: "hybrid", label: "Hybrid (TwnNm + Ctry, up to 2 AdrLine)" },
];

const REASONS: Record<ProvenanceKind, string> = {
  span: t("provenance.span.description", { span: "Lindenhof" }),
  transform: t("provenance.transform.description", {
    span: "lindenhof",
    transform: "case-title",
    version: "1",
  }),
  dataset: t("provenance.dataset.description", {
    span: "10115",
    dataset: "GeoNames",
    recordId: "DE-10115",
  }),
  inferred: t("provenance.inferred.description", {
    evidence: "postcode 10115",
    rule: "country-from-postcode",
  }),
  human: t("provenance.human.description", { name: "A. Reviewer", date: "26 Nov 2026" }),
  external: t("provenance.external.description", { tokenName: "erp-sync", date: "26 Nov 2026" }),
};

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-h`} className="flex flex-col gap-4 border-t border-line pt-6">
      <h2 id={`${id}-h`} className="text-title font-semibold text-fg">
        {title}
      </h2>
      {children}
    </section>
  );
}

function State({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-cap font-semibold tracking-wide text-fg-muted uppercase">{label}</h3>
      <div className="flex flex-wrap items-start gap-3">{children}</div>
    </div>
  );
}

function SelectableTable() {
  const [selected, setSelected] = useState<Set<string>>(new Set(["R-0002"]));
  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  return (
    <Table caption="Synthetic suppliers, sorted by record. Row R-0002 is selected; scroll sideways at 375 for every column.">
      <TableHeader>
        <TableRow>
          <TableSelectAllHead
            checked={selected.size === ROWS.length}
            onCheckedChange={(on) => setSelected(new Set(on ? ROWS.map((r) => r.id) : []))}
          />
          <TableHead sort="ascending" onSort={() => {}}>
            Record
          </TableHead>
          <TableHead sort="none" onSort={() => {}}>
            Supplier
          </TableHead>
          <TableHead>
            Country <span className="font-code normal-case">Ctry</span>
          </TableHead>
          <TableHead>
            Town <span className="font-code normal-case">TwnNm</span>
          </TableHead>
          <TableHead numeric>Lines</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {ROWS.map((r) => (
          <TableRow key={r.id} selected={selected.has(r.id)}>
            <TableSelectCell
              checked={selected.has(r.id)}
              onCheckedChange={(on) => toggle(r.id, on)}
              rowName={r.id}
            />
            <TableCell className="font-code whitespace-nowrap">{r.id}</TableCell>
            <TableCell className="min-w-40">{r.name}</TableCell>
            <TableCell className="font-code">{r.country}</TableCell>
            <TableCell className="whitespace-nowrap">
              {r.town || <StatusBadge status="empty" size="sm" />}
            </TableCell>
            <TableCell numeric>{r.lines}</TableCell>
            <TableCell>
              <StatusBadge status={r.status} size="sm" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function All() {
  return (
    <>
      <Section id="button" title="Button">
        <State label="Variants (default)">
          <Button variant="primary">Approve 371</Button>
          <Button variant="secondary">Edit field</Button>
          <Button variant="ghost">Skip</Button>
          <Button variant="danger">Discard batch</Button>
        </State>
        <State label="Small">
          <Button size="sm">Approve</Button>
          <Button size="sm" variant="secondary">
            Mark unknown
          </Button>
        </State>
        <State label="Disabled, and disabled with a reason (focusable; tooltip in ?view=tooltip)">
          <Button disabled>Approve 371</Button>
          <Button disabledReason="Four-eyes: a second person approves records you edited.">
            Approve 1
          </Button>
        </State>
        <State label="Loading">
          <Button loading>Approving</Button>
          <Button variant="secondary" loading>
            Re-checking
          </Button>
        </State>
      </Section>

      <Section id="input" title="Input">
        <div className="grid items-start gap-4 md:grid-cols-2">
          <Input label="Town" element="TwnNm" defaultValue="Lindenhof" maxChars={35} required />
          <Input
            label="Postcode"
            element="PstCd"
            placeholder="10115"
            hint="As printed on the original lines."
          />
          <Input
            label="Street"
            element="StrtNm"
            maxChars={70}
            defaultValue="Lindenhofweg vierzehn mit einem sehr langen Zusatz der Adresse ohne jedes Ende"
          />
          <Input label="Country" element="Ctry" defaultValue="DE" disabled />
        </div>
      </Section>

      <Section id="select" title="Select">
        <div className="grid items-start gap-4 md:grid-cols-2">
          <Select label="Bank rule pack" options={PACKS} />
          <Select label="Bank rule pack (chosen)" options={PACKS} defaultValue={PACK} />
          <Select
            label="Target form"
            options={FORMS}
            error="Choose a target form before checking."
          />
          <Select label="Bank rule pack (disabled)" options={PACKS} disabled />
        </div>
      </Section>

      <Section id="table" title="Table">
        <State label="Selection (checkbox + tint + edge), sortable headers, numeric column">
          <div className="w-full">
            <SelectableTable />
          </div>
        </State>
        <State label="Sticky header (scroll inside), keyboard-focusable rows">
          <div className="w-full">
            <Table
              stickyHeader
              caption="Synthetic records: the header stays while the body scrolls."
            >
              <TableHeader>
                <TableRow>
                  <TableHead>Record</TableHead>
                  <TableHead numeric>Lines</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {MANY.map((r) => (
                  <TableRow key={r.id} tabIndex={-1} data-row={r.id}>
                    <TableCell className="font-code">{r.id}</TableCell>
                    <TableCell numeric>{r.lines}</TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} size="sm" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </State>
        <p className="text-dense text-fg-muted">
          The virtualised body and roving row focus belong to the review grid (M2-18), which builds
          on these parts.
        </p>
      </Section>

      <Section id="status" title="StatusBadge">
        <State label="Every status (md)">
          {STATUSES.map((s) => (
            <StatusBadge key={s} status={s} />
          ))}
        </State>
        <State label="Every status (sm)">
          {STATUSES.map((s) => (
            <StatusBadge key={s} status={s} size="sm" />
          ))}
        </State>
        <State label="With count; with description (tooltip in ?view=tooltip); as a link (underlined)">
          <StatusBadge status="fail" count={412} />
          <StatusBadge status="pass" count={88} />
          <StatusBadge status="fail" description={t("status.fail.description", { pack: PACK })} />
          <StatusBadge status="fail" href="#status-h" />
        </State>
      </Section>

      <Section id="provenance" title="ProvenanceChip">
        <State label="Every kind (dashed border = needs individual approval; reason in ?view=tooltip)">
          {PROVENANCE_KINDS.map((k) => (
            <ProvenanceChip key={k} kind={k} reason={REASONS[k]} />
          ))}
        </State>
      </Section>

      <Section id="skeleton" title="Skeleton">
        <div aria-busy="true" className="flex max-w-md flex-col gap-3">
          <p className="text-dense text-fg-muted">
            {t("components.skeleton.loading", { what: "review queue" })}
          </p>
          <State label="Text line">
            <Skeleton variant="text" className="w-64" />
          </State>
          <State label="Badge">
            <Skeleton variant="badge" />
          </State>
          <State label="Table row">
            <div className="flex w-full flex-col gap-2">
              <Skeleton variant="row" />
              <Skeleton variant="row" />
            </div>
          </State>
        </div>
      </Section>

      <Section id="empty" title="EmptyState">
        <div className="grid items-start gap-4 md:grid-cols-2">
          <EmptyState headingLevel={3} />
          <EmptyState
            headingLevel={3}
            align="center"
            title="No uploads yet"
            body="Upload a CSV, XLSX, pain.001 or MT101 file to see how its addresses check against a pack."
            action={<Button>Upload a file</Button>}
            secondary={
              <a
                href="#empty-h"
                className="focus-ring inline-flex min-h-target items-center rounded-chip text-dense text-accent underline lg:min-h-6"
              >
                Use a sample batch
              </a>
            }
          />
        </div>
      </Section>

      <Section id="error" title="ErrorState">
        <div className="grid items-start gap-4 md:grid-cols-2">
          <ErrorState headingLevel={3} problem={new Error("network")} onRetry={() => {}} />
          <ErrorState
            headingLevel={3}
            problem={{
              type: "https://4x35.example/problems/validation",
              title: "Upload too large",
              status: 413,
              detail: "This file is 31 MB; uploads are limited to 20 MB.",
              instance: "req_01JD7Q2M5X",
              errors: [{ pointer: "/file", detail: "31 MB of 20 MB" }],
            }}
            onRetry={() => {}}
          />
          <ErrorState
            headingLevel={3}
            problem={{ title: "Not allowed", status: 403 }}
            memberRole="Viewer"
          />
          <ErrorState
            headingLevel={3}
            problem={{
              title: "Record changed",
              status: 409,
              detail: "Someone approved this record while you were editing it.",
            }}
            onReload={() => {}}
          />
          <ErrorState
            headingLevel={3}
            problem={{ title: "Slow down", status: 429, retryAfter: 30 }}
          />
          <ErrorState headingLevel={3} offline onRetry={() => {}} retrying />
        </div>
      </Section>

      <Section id="progress" title="ProgressPanel">
        <div className="grid items-start gap-4 md:grid-cols-2">
          <ProgressPanel
            label="Structuring addresses"
            step={{ current: 3, steps: 4, name: "Matching postcodes (GeoNames)" }}
            done={312}
            total={1200}
            updated="14:02:11"
          />
          <ProgressPanel
            label="Reading file"
            step={{ current: 1, steps: 4, name: "Detecting encoding" }}
            updated="14:02:09"
          />
          <ProgressPanel
            label="Structuring addresses"
            step={{ current: 2, steps: 4, name: "Parsing lines" }}
            done={480}
            total={1200}
            state="stalled"
            stalledSeconds={45}
            updated="14:01:02"
          />
          <ProgressPanel
            label="Export"
            step={{ current: 2, steps: 3, name: "Writing pain.001" }}
            done={480}
            total={1200}
            state="failed"
            failureReason="row 481 could not be written"
            updated="14:03:40"
          />
          <ProgressPanel
            label={`Checked against ${PACK}`}
            step={{ current: 4, steps: 4, name: "Pre-flight" }}
            done={1200}
            total={1200}
            state="completed"
            duration="42 s"
            updated="14:04:18"
          />
        </div>
      </Section>

      <Section id="overlays" title="Dialog, Tooltip, Toast">
        <p className="text-dense text-fg-muted">
          Open states have their own views: ?view=dialog, ?view=dialog-destructive,
          ?view=dialog-busy, ?view=tooltip, ?view=toast, ?view=select.
        </p>
        <State label="Closed triggers">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary">Bulk approve</Button>
            </DialogTrigger>
            <BulkDialog />
          </Dialog>
          <Tooltip content="Approve the selected rows">
            <Button variant="ghost">Hover or focus me</Button>
          </Tooltip>
        </State>
      </Section>
    </>
  );
}

function BulkDialog({ busy }: { busy?: boolean }) {
  return (
    <DialogContent
      title="Approve 371 records?"
      description={`Only records whose every value is "From input" or "Transformed" are included. Checked against ${PACK}.`}
      busy={busy ?? false}
      footer={
        <>
          <Button variant="secondary" disabled={busy ?? false}>
            {t("components.dialog.cancel")}
          </Button>
          <Button loading={busy ?? false}>{busy ? "Approving 371" : "Approve 371"}</Button>
        </>
      }
    >
      <p className="text-dense text-fg">
        41 records with a dataset match, inferred or external value stay in the queue for individual
        approval.
      </p>
    </DialogContent>
  );
}

function DiscardDialog() {
  return (
    <DialogContent
      title="Discard batch B-0042?"
      description="The upload and its 500 records are deleted now. Approved addresses that were already exported are kept in their export files."
      footer={
        <>
          <Button variant="secondary">{t("components.dialog.cancel")}</Button>
          <Button variant="danger">Discard batch</Button>
        </>
      }
    />
  );
}

function Overlay() {
  if (view === "dialog" || view === "dialog-busy" || view === "dialog-destructive") {
    return (
      <Dialog defaultOpen>
        <div>
          <DialogTrigger asChild>
            <Button variant="secondary">
              {view === "dialog-destructive" ? "Discard batch" : "Bulk approve"}
            </Button>
          </DialogTrigger>
        </div>
        {view === "dialog-destructive" ? (
          <DiscardDialog />
        ) : (
          <BulkDialog busy={view === "dialog-busy"} />
        )}
      </Dialog>
    );
  }
  if (view === "tooltip") {
    // e2e opens each of these in turn: the chip's popover (Enter), the disabled reason (focus),
    // the badge description (focus) and a plain tooltip (hover).
    return (
      <div className="flex flex-col items-start gap-40 pt-4 pb-48">
        <ProvenanceChip kind="dataset" reason={REASONS.dataset} />
        <Button disabledReason="Four-eyes: a second person approves records you edited.">
          Approve 1
        </Button>
        <StatusBadge status="fail" description={t("status.fail.description", { pack: PACK })} />
        <Tooltip content="Approve the selected rows">
          <Button variant="ghost">Approve</Button>
        </Tooltip>
      </div>
    );
  }
  if (view === "toast") {
    return (
      <>
        <p className="text-dense text-fg-muted">Three toasts in the notification region.</p>
        <Toast
          variant="info"
          title="Re-check queued"
          description={`Batch B-0042 against ${PACK}.`}
          open
        />
        <Toast
          variant="success"
          title="371 records approved"
          action={{ label: t("components.toast.undo"), onClick: () => {} }}
          open
        />
        <Toast
          variant="error"
          title="Export failed"
          description="Row 481 could not be written, so no file was saved. Try again from Export; trace id req_01JD7Q2M5X."
          action={{ label: t("components.toast.view"), onClick: () => {} }}
          open
        />
      </>
    );
  }
  if (view === "select") {
    return (
      <div className="max-w-sm pb-64">
        <Select label="Bank rule pack" options={PACKS} defaultValue={PACK} />
      </div>
    );
  }
  return <All />;
}

function Gallery() {
  return (
    <TooltipProvider delayDuration={300}>
      <ToastProvider>
        <main
          data-gallery={GALLERY_MARKER}
          className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 md:px-8"
        >
          <header className="flex flex-col gap-1">
            <h1 className="text-headline font-semibold text-fg">Component gallery</h1>
            <p className="text-dense text-fg-muted">
              Dev only. View: {view}. Theme: {theme ?? "system"}. All data is synthetic.
            </p>
          </header>
          <Overlay />
        </main>
      </ToastProvider>
    </TooltipProvider>
  );
}

const root = document.getElementById("gallery-root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Gallery />
    </StrictMode>,
  );
}
