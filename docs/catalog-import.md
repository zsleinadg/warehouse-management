# Catalog Import Plan — RECEBIMENTO BLCT spreadsheet

> Status: implemented (revised). Source: boss's spreadsheet (local-only copy
> at `data/recebimento-blct.xlsx`, gitignored — the original lives only on
> his logged-in work PC). Goal: full catalog in the system, values exactly
> as they are, in its own table that rarely changes.

## 1. Context

The boss runs purchasing off a spreadsheet with ~16k rows (material names,
codes, base UM, arrivals, demands). Only a fraction sits in our warehouse,
but the whole catalog must exist in the system so code/name lookups work
against real data. His workflow stays spreadsheet-first for now.

The catalog lives in its own part of the database (`CatalogMaterial`): it is
the source of information (check code, material name), while warehouse
`Material`/`Stock` record only what is physically on hand and how much.
The two sides are independent — no foreign key, no shared writes.

Conventions (locked): code, variables, DB columns and comments in **English**;
**Portuguese only** for data coming from Sheets and for UI labels. Commits,
PRs and docs bodies in English; this plan doc in PT-BR for the team.

## 2. Locked decisions

- Import **everything, literally as-is** (all rows, all centers, raw values);
  organization/normalization comes after.
- Code, variables and DB columns in English; Sheets **data** stays Portuguese.
- Catalog is a standalone `CatalogMaterial` table (`code`, `plant`, `name`,
  `storageLocation`, `unit`, `@@unique([code, plant])`). Warehouse `Material`
  is untouched and keeps `@unique(code)` — no lookup changes were needed.
- `RECEBIMENTO ESTOQUE` / `SAIDA TRANSFERENCIA` sheets are **not** imported
  as stock (would double-count) — catalog only. `ROMANEIO` is a picking form
  template, ignored.
- `GET /api/catalog` is the catalog search: paginated, filterable by `q`
  (code/name) and `plant`; every row carries warehouse availability matched
  by code (`inWarehouse`, `totalQuantity`). Existing `/api/search` stays
  warehouse-only.
- Source XLSX is local-only and gitignored; development runs against a Neon
  database branch so production never breaks.
- Recurring sync deferred (see §7). Paginated server search on selects is a
  required follow-up before daily use with 16k options.

## 3. Source analysis (verified by parsing the file)

| Sheet | Rows (data) | Columns | Key facts |
|---|---|---|---|
| BANCO DE DADOS | 16,124 | Material, Texto breve de material, Centro, Depósito, UM básica | 16,124 rows → 15,959 distinct (code, plant); 1 fully blank row skipped; 165 duplicate (code, plant) pairs, all differing in Depósito (first wins, logged); BLCT = 2,337 rows |
| RECEBIMENTO ESTOQUE | 613 | CÓDIGO, DESCRIÇÃO, UND.MED, QTDs, NOTA, Data recebimento, PEDIDO, DATA Regularização, Centro Fornecedor, STATUS, OBSERVAÇÃO | Real inbound history (reference only for now) |
| SAIDA TRANSFERENCIA | 3 | CÓDIGO … CENTRO RECEPTOR, STATUS … | Negligible volume, reference only |
| ROMANEIO | 6 content rows, 26 cols | OT picking form | No data, ignore |

UM values found (imported literally): UN, M, KG, CDA, PAR, CJT, PI, RLL, NA,
CXT, MM, KIT, JG, PEÇ (+ encoding artifacts to verify on import).

Per-plant totals after import: BLCT 2,337 · BLCP 2,350 · BLCQ 2,345 ·
BLCS 2,328 · BLCR 2,335 · BLAS 1,464 · BLAD 1,387 · BLAR 1,413.

## 4. Column mapping (Sheets PT → code EN)

| Sheets header | Target | Rule |
|---|---|---|
| Material | `code` | numeric `100024.0` → `"100024"`; skip empty; trim |
| Texto breve de material | `name` | trim as-is (PT) |
| Centro | `plant` | as-is (`"BLCT"`) |
| Depósito | `storageLocation` | as-is |
| UM básica | `unit` | as-is; empty → `"UN"` (mirrors Material default) |

Duplicate (code, plant) pairs: identical rows merge; divergent rows go to a
`conflicts[]` report (first wins, mirroring the seed importer).

## 5. Phase 1 execution (one-shot bulk import)

1. Branch `feature/catalog-import` from updated `develop`.
2. Migration: new `CatalogMaterial` table only (no change to `Material`) →
   diff → `db execute` (Neon dev branch) → `resolve --applied` → `generate`.
3. Script `prisma/import-catalog.ts` (tsx, like the seed): reads the XLSX,
   normalizes per §4, inserts by `(code, plant)` in 500-row batches with a
   `{created, updated, unchanged, merged, skipped, conflicts}` report.
   Idempotent (rerun = created 0, updated 0).
4. Endpoint `GET /api/catalog` with warehouse-availability enrichment.
5. Run, verify counts per plant + spot checks (2 BLCT conflict row, 1 other
   plant, 1 odd UM like `CDA`, `PEÇ` with UTF-8 Ç preserved).
6. Validate: `tsc`, `eslint` (no `--fix`), `jest`, `build`, `doctor`.
7. Commits (English, one theme each): `chore(repo)` ignore rule,
   `feat(catalog)` table + migration, importer (+ `xlsx` dep), endpoint,
   then docs; push; PR → `develop`; squash.

## 6. Detailed runbook for the new session (follow top to bottom, no skipping)

> Work from `feature/catalog-import` (create from updated `develop` if missing).
> Develop against the Neon dev branch (`DATABASE_URL` in `.env.local`,
> never committed). After every step, run the gate command; stop and fix
> before continuing.

### Step 0 — Sync and inspect (terminal, 2 min)
```powershell
git checkout develop; git pull --ff-only origin develop
git checkout feature/catalog-import  # or -qb to create
git status --porcelain               # expect: only intended files
npx tsc --noEmit                     # GATE: clean
```
If `develop` moved, rebase the feature branch (`HUSKY=0 git rebase develop`
only if no conflicts; else stop and report).

### Step 1 — Schema + migration (code + DB, 10 min)
1.1. Add standalone `CatalogMaterial` model to `prisma/schema.prisma`
(`code`, `plant`, `name`, `storageLocation`, `unit`,
`@@unique([code, plant])`, indexes on `code`/`name`). Do NOT touch `Material`.
1.2. Generate SQL (read-only):
`npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script --output prisma/migrations/pending_review.sql`
1.3. **Read the SQL before applying.** Expected: `CREATE TABLE
"CatalogMaterial"` + indexes only. If anything else appears (drift), stop.
1.4. Apply in order (used successfully on this Neon project before):
`New-Item -ItemType Directory prisma/migrations/<yyyyMMddHHmmss>_add_catalog_material`;
move SQL to `migration.sql`; `npx prisma db execute --file ...`;
`npx prisma migrate resolve --applied <dirname>`; `npx prisma generate`.
1.5. GATE: `npx prisma migrate status` → "up to date"; `npm run doctor` clean.

### Step 2 — Dropped (not needed)

Warehouse `Material` keeps `@unique(code)`, so no lookup disambiguation is
required. `POST /api/materials`, `POST /api/stocks` and `GET /api/search`
stay as they are.

### Step 3 — Importer script + catalog endpoint (code, 40 min)
3.1. New `prisma/import-catalog.ts` (tsx, mirrors `prisma/seed.ts` style):
read `data/recebimento-blct.xlsx` (sheet `BANCO DE DADOS`, `xlsx` dep),
normalize per §4 table, skip empty codes with report, merge identical dup
pairs, list divergent ones in `conflicts[]` (first wins).
3.2. Insert by `(code, plant)` in 500-row batches (`createMany
skipDuplicates` + targeted updates only for differing fields), printing
per-batch progress and totals. Rerun must print created 0, updated 0.
3.3. New `GET /api/catalog` (roles ADMIN/OPERATOR/VIEWER): `q` (code/name),
`plant`, `take` (max 200), `skip`; returns `{ data, meta: { total, take,
skip } }` with `inWarehouse` + `totalQuantity` matched by code.
3.4. GATE: `npx tsc --noEmit` + `npx eslint <touched files>` clean.

### Step 4 — Run + verify against the DB (terminal, 15 min)
4.1. `npx tsx --env-file=.env.local prisma/import-catalog.ts` → expect
`created = 15,959`, `updated 0`, `skipped 1` (blank row), `conflicts` = 165
known dup pairs (all Depósito-divergent) for eyeballing.
4.2. Rerun → `created 0, updated 0, unchanged 15,959` (idempotent).
4.3. Spot check via `GET /api/catalog`: per-plant totals (§3 table),
BLCT = 2,337; 5-code check (conflict row 330814, odd UMs `CDA`/`PEÇ`).
4.4. GATE: counts match §3 table; endpoint returns availability flags.

### Step 5 — Validate, commit, push, PR (terminal + browser, 15 min)
5.1. `npx tsc --noEmit`; `npx eslint src/ prisma/import-catalog.ts`;
`npx jest`; `npm run build`; `npm run doctor` — all green, fix manually
(never `--fix`).
5.2. Commits in English, one theme each, code and docs separate:
`chore(repo): ignore local supplier spreadsheet`,
`feat(catalog): standalone supplier catalog table`,
`feat(catalog): bulk XLSX importer with diff report`,
`feat(catalog): searchable catalog endpoint with warehouse availability`,
`docs(catalog): revised import plan for standalone catalog`.
5.3. Push branch → PR to `develop` (template auto-fills; complete fields) →
squash merge → delete branch.
5.4. Do NOT touch: RECEBIMENTO/SAIDA sheets (no stock import), UI labels
language (PT-BR stays), recurring sync (Phase 2, §7).

## 7. Mandatory reading for a new session (in order)

1. This file (`docs/catalog-import.md`).
2. `docs/autenticacao.md` (sessions, cookies, LAN ops).
3. `prisma/schema.prisma` (models, uniques, relations).
4. `src/lib/stock-ledger.ts` + `src/lib/locations.ts` (placement/leaf rules).
5. Vault `00-Meta/github-workflow.md` (git flow, English commits, validation).
6. Conventions: UI labels PT-BR, everything else English; `tsc`/`eslint`/
   `jest`/`build` green before every commit; restart after `generate`
   (rebuild when on `start`); one server per port 3000.

## 8. Future sync playbook (when access is granted)

1. **Get access** (pick one): share the sheet as reader with your account
   (recommended — export fresh XLSX anytime without touching his original);
   or `File → Publish to web` as CSV with a fixed URL; or keep manual
   copy-over ritual.
2. **Sync mechanics**: replace the file → rerun the importer: reports
   `created/updated/unchanged`, **never deletes** (material missing
   from the sheet is listed, not removed — guards against bad exports).
3. **Follow-up before daily use**: catalog-backed material selects
   (server-paginated; 16k options freeze current dropdowns) and a catalog
   consultation page using `GET /api/catalog`.
