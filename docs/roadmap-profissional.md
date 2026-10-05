# Almoxarifado Profissional — Plano Completo

> Documento-mestre de contexto. Leia este arquivo primeiro em qualquer sessão nova.
> Stack: Next.js 16.3.6, React 19, TS strict, Tailwind v4, Prisma 7.10 + Neon Postgres, JWT próprio (jose + bcryptjs, sem NextAuth).
> Branches: `main` (sagrada) ← `develop` ← `feature/*` (squash + delete). Commits/PRs em inglês, `tipo(escopo):`, 1 tema por commit.
> Nome genérico no repo — nunca vincular a empresa real.

## 1. Estado atual (verdade em 2026-09-29)

- `develop` = `44285ec` (PRs #1–#8 mergeados: CI, docs, plano, Prisma 7, 6 models, seed+parser+tree/search, auth, UI dashboard).
- Branch ativa: `feature/catalog` com 1 commit (`0e29726` fix do parser). Trabalho NÃO commitado: CRUD de materiais/locais (parcial, sessão anterior).
- **Banco Neon LIMPO de dados de levantamento**: wipe executado (185 stocks, 44 locations, 181 materials apagados). Mantido: usuário admin (`admin@warehouse.local`).
- Login funciona; dashboard em `http://localhost:3000` (dev local).
- `.env.local` (gitignored) contém: `DATABASE_URL`, `AUTH_SECRET` (48 bytes), `ADMIN_EMAIL`, `ADMIN_PASSWORD` (32 hex, gerada; trocar quando quiser + `npm run db:seed:admin`).

## 2. O que existe e funciona

- **Parser** (`src/lib/inventory-parser.ts`, 11 testes): texto de levantamento → entradas estruturadas; regra sibling-aware (numerado só aninha sob prefixo — corrige "Meio dentro de Baixo").
- **Seed** (`prisma/seed.ts` + `data/inventory.txt`): import idempotente com `needsReview` em conflitos. Banco zerado agora; seed serve para re-bootstrap e teste.
- **API**: `GET /api/locations/tree`, `GET /api/search`, `POST/PATCH/DELETE /api/stocks`, auth (`login/refresh/logout/me`), `authorize()` por papel.
- **Auth**: access 15min + refresh 30d rotativo com reuse detection (queima a cadeia), cookies httpOnly, `src/proxy.ts` edge (anon → `/login`), `/login` em PT, `prisma/admin.ts` via env.
- **UI**: dashboard com árvore, busca com salto, breadcrumb, badges de revisão, drag-reorder persistido, add/remove com confirmação, TanStack Query.
- **CI** (`ci.yml`): `npm ci → next typegen → prisma generate (URL dummy) → npm test → eslint → tsc → build`. Lições em `docs/ci-lessons.md` (3 lições).

## 3. Bug conhecido e corrigido (não reabrir)

"Meio dentro de Baixo": rank fixo aninhava `Meio 1` sob `Baixo` quando não havia `Meio` declarado (P4/P5/Corredor). Fix `0e29726` + 3 testes. Como o banco foi zerado, não há reparo pendente — o cadastro manual parte de árvore limpa.

## 4. O que está faltando (backlog ordenado)

### Lote 1 — Catálogo (branch `feature/catalog`, EM ANDAMENTO)
1. `feat(api+ui): material catalog CRUD` — tela Materiais: código único, nome, unidade, custo, estoque mín/máx, especificação, barcode, ativo/inativo. `GET/POST /api/materials`, `PATCH /api/materials/[id]` (ADMIN/OPERATOR).
2. `feat(api+ui): location management` — tela Locais: criar/renomear/mover com proteção anti-ciclo/desativar; `GET/POST/PATCH /api/locations`.
3. Placements com **quantidade 0** permitidos (reserva de posição): relaxar `quantity.min(1)` → `min(0)` em `POST /api/stocks`.
4. Push + PR para `develop` (squash + delete).

### Lote 2 — Estoque real: NF, entradas, contagem (`feature/inventory`)
5. `feat(db): movement ledger` — estender `Movement` com `nfNumber?`, `reason?`, `issueId?`; criar `PurchaseInvoice { number @unique, supplier, issuedAt, lines: [{ materialId, quantity, unitCostCents }] }` + migration.
6. `feat(api+ui): purchase invoice entry` — cadastro de NF gera `INBOUND` por item e soma `Stock.quantity`; NF imutável após consumo (409 em PUT/DELETE).
7. `feat(api+ui): cycle counting` — tela Contagem por location; divergência gera `ADJUSTMENT` com motivo obrigatório + usuário/data.
8. `feat(ui): stock levels` — saldos, alerta < mínimo, valorização (qtd × custo médio). Incluir `fix(auth)`: rate limit no login + purga de sessões.

### Lote 3 — Saídas + devoluções (`feature/issues`)
9. `feat(db): issue voucher` — `Issue { number auto, ot, destination, foreman, notes, status DRAFT|CLOSED|CANCELLED, userId }` + `IssueItem { issueId, materialId, quantity }`.
10. `feat(api+ui): issue flow` — rascunho sem efeito; fechar = `OUTBOUND` com validação de saldo (parcial permitido, restante pendente); comprovante imprimível.
11. `feat(api+ui): returns` — devolução vinculada à saída de origem (qual OT, itens, motivo) → `RETURN` soma de volta.
12. `feat(ui): consumption reports` — por OT/obra/período/material + export CSV.

### Lote 4 — Overhaul UI + portfólio (por último)
App shell com navegação (Dashboard, Materiais, Locais, Entradas/NF, Saídas, Devoluções, Contagem, Auditoria, Relatórios); páginas finas → componentes → hooks → services; isométrica SVG por ocupação; README com GIF + arquitetura; snippets ao Vault.

## 5. Dívidas e travas (não esquecer)

- **URGENTE (só o dono)**: reset da senha do Neon (vazou no chat) + trocar `ADMIN_PASSWORD` quando quiser.
- Sem rate limit no login; sessões expiradas sem purga; corrida no refresh pode false-positive (documentado, aceitar ou janela de graça de 10s).
- Vercel: criar branch preview no Neon antes do primeiro deploy (banco único hoje).
- Pinar Actions por SHA; criar `05-Projetos/warehouse/` no Vault; README ainda é template.
- Comandos: `npm test`, `npm run db:seed`, `npm run db:seed:admin`, sequência da Regra de ouro antes de todo push (`docs/ci-lessons.md`).

## 6. Padrões profissionais adotados (pesquisa)

Catálogo governado (código único, 409 em conflito); posição fixa por SKU; PEPS orientando picking; requisição com status (Rascunho→Atendida/Cancelada, parcial permitido); comprovante por entrega (quem/o quê/quando/OT); NF imutável após consumo (preserva custo médio); contagem cíclica no lugar de inventário anual; trilha completa auditável (estilo RMA/SIPAC).

## 7. Como retomar (nova sessão)

1. `git checkout develop && git pull && git checkout feature/catalog` (ou nova branch do lote).
2. `npm ci && npx prisma generate` (Neon via `.env.local`).
3. Validar login em `http://localhost:3000/login`.
4. Continuar do item 1 do Lote 1 (§4). Estado exato do trabalho não commitado: pedir `git status` na nova sessão.
