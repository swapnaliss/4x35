# 0012. React SPA served by the API

- Status: accepted (2026-11-20, Approval 2)

## Context
Design criterion; the hero is a dense, keyboard-first review grid behind a login, so SSR adds nothing.

## Decision
React 19, Vite 8, TanStack Router + Query, Tailwind 4 + Radix/shadcn, served as static assets by Hono. Virtualised review grid; every screen has empty, loading and error states; budgets LCP ≤ 2.5 s and INP ≤ 200 ms; WCAG 2.2 AA; i18next keys. Built to `docs/design/` specs from `ux-designer`; every frontend ticket passes `ui-reviewer`.

## Alternatives considered
Next.js (SSR and a second server model for no requirement).

## Consequences
Cost to reverse: Medium. See [architecture](../architecture.md).
