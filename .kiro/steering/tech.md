---
inclusion: always
---

# Tech stack

Use exactly these versions. They were verified on the npm registry on 17 Nov 2026 (PROJECT.md §4).

| Component | Version |
|---|---|
| Node.js | 24 LTS |
| TypeScript | 6.0.3 |
| Hono / @hono/node-server / @hono/zod-openapi | 4.13.19 / 2.1.8 / 1.6.3 |
| zod | 4.6.7 |
| drizzle-orm / drizzle-kit | 0.45.4 / 0.31.11 |
| pg | 8.23.1 |
| pg-boss | 12.38.2 |
| React / react-dom | 19.3.1 |
| Vite | 8.3.8 |
| @tanstack/react-router | 1.170.46 |
| @tanstack/react-query | 5.108.4 |
| tailwindcss / radix-ui / shadcn | 4.3.5 / 1.8.1 / 4.23.0 |
| papaparse | 5.7.1 |
| SheetJS | 0.20.3 (cdn.sheetjs.com tarball, pinned integrity) |
| xmllint-wasm | 5.3.0 |
| chardet / iconv-lite | 2.2.0 / 0.7.3 |
| @node-rs/argon2 | 2.2.2 |
| pino | 10.4.0 |
| i18next | 27.1.3 |
| @anthropic-ai/sdk | 1.9.0 |
| @modelcontextprotocol/sdk | 1.32.2 |
| vitest / fast-check / @playwright/test | 5.1.0 / 4.10.2 / 1.65.1 |
| @biomejs/biome | 2.6.8 |
| @types/node | 24.19.2 |
| PostgreSQL | 17 (`postgres:17-alpine` locally) |

The SAX parser with byte positions is chosen and verified in M2-03.

## Rules
- Stay on TypeScript 6.0.x only. The drizzle-kit peer range rules out 7.x.
- Use ESM: `"type": "module"`.
- Use `strict` TypeScript. No `any`. No `@ts-ignore`.
- Use Node 24.
- Use Biome for lint and format.
- Test with vitest, fast-check and Playwright.
- Use Postgres 17. Jobs run in Postgres with pg-boss. No Redis.
- Use the SheetJS tarball, not npm `xlsx` 0.18.5, which has advisories.
- No Vercel. No Neon. No blockchain.

Source: [PROJECT.md](../../PROJECT.md)
