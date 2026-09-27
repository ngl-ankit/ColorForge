# ColorForge

ColorForge turns uploaded UI screenshots into actionable, implementation-ready design reports.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/colorforge/src/App.tsx` — browser-only upload, analysis, report views, exports, and persistence
- `artifacts/colorforge/src/index.css` — ColorForge visual system and responsive layout rules
- `artifacts/colorforge/.replit-artifact/artifact.toml` — managed web workflow and preview routing
- `artifacts/api-server` — shared API scaffold; ColorForge does not currently require a backend

## Architecture decisions

- The first analysis pass is intentionally local: browser canvas sampling keeps screenshots private and avoids requiring user API keys.
- Dominant colors, luminance, contrast, and heuristic regions are derived from the uploaded image; report sections turn that signal into implementation guidance.
- The latest report is stored in localStorage so a refresh does not discard the current analysis.

## Product

Users can drag or select PNG, JPG, and WebP references, review a staged analysis, inspect inferred regions, browse design-system sections, copy tokens/snippets, and download JSON, CSS variables, or Tailwind config output.

## User preferences

Keep the analysis workflow functional and privacy-preserving; do not replace it with a static demo or add a server dependency unless the product scope changes.

## Gotchas

- Run the ColorForge workflow through `artifacts/colorforge: web`; it provides `PORT` and `BASE_PATH`.
- For a fresh report, use “Start over” to clear the local persisted analysis.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
