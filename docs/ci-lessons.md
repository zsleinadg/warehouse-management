# CI Lessons — erros que não se repetem

> Registro didático: cada item abaixo quebrou o CI uma vez por passar
> local e falhar no checkout limpo. Ler antes de mexer no pipeline.

## Regra de ouro (vale para todo PR)

Validar local **apagando os artefatos gerados primeiro** e rodando a
sequência exata do `ci.yml`:

```bash
Remove-Item -Recurse -Force .next, prisma/generated -ErrorAction SilentlyContinue
npm ci
npx next typegen
npx prisma generate
npx eslint .
npx tsc --noEmit
npm run build
```

Motivo: na sua máquina, `.next/` e `prisma/generated/` acumulam restolhos
de comandos anteriores e mascaram erros que o runner limpo encontra.

## Lição 1 — `LayoutProps` não existe sem typegen (PR #1)

- **Erro:** `TS2304: Cannot find name 'LayoutProps'` em `tsc --noEmit`
- **Causa:** `LayoutProps<"/">` é gerado em `.next/types/` (gitignored).
  Local passava porque um `build` anterior o havia criado; no CI o `tsc`
  rodava antes de qualquer comando que o gerasse.
- **Fix:** step `npx next typegen` após `npm ci`, antes de lint/typecheck.
- **Commit:** `fix(ci): generate route types before typecheck`

## Lição 2 — Client Prisma gerado não existe no CI (PR #3)

- **Erro:** `TS2307: Cannot find module '../../prisma/generated/client'`
- **Causa:** `prisma/generated/` é gitignored e nada o criava antes do `tsc`.
  Local passava porque o `generate` havia sido rodado na mão.
- **Fix:** job `env.DATABASE_URL` com valor dummy
  (`postgresql://ci:ci@localhost:5432/ci` — `generate` nunca conecta,
  só exige a variável presente) + step `npx prisma generate`
  após o `typegen`.
- **Segurança:** credencial real nunca entra no workflow; vive em
  `.env.local` (local) e env da Vercel (produção/preview).
- **Commit:** `fix(ci): generate prisma client with dummy database url`

## Lição 3 — Config TS do Jest quebra no Node do CI (PR #6)

- **Erro:** `Jest: 'ts-node' is required for the TypeScript configuration
  files` no step `npm test` (exit 1), só no runner.
- **Causa:** o Jest só lê `jest.config.ts` via `ts-node`, que não é
  dependência do projeto. Local passava por acidente de ambiente:
  Node 24 tem type-stripping nativo de `.ts`, mas o CI roda Node 20,
  que não carrega `.ts` sem `ts-node`.
- **Fix:** `jest.config.ts` → `jest.config.js` (CommonJS,
  `require("next/jest.js")`, mesmo conteúdo) — carrega em qualquer
  Node, zero dependência nova. Alternativa descartada: adicionar
  `ts-node` como devDep (peso morto só para parsear config).
- **Corolário:** versão do Node local ≠ CI mascara falhas. Espelhar o
  CI localmente (mesmo major do `setup-node`) antes do push quando o
  erro cheirar a ambiente.
- **Commit:** `fix(ci): use plain js jest config for node 20 runner`

## Checklist ao alterar o pipeline

1. A mudança precisa de algum artefato gerado? Se sim, quem o cria no CI?
2. Algum step novo precisa de segredo? Se sim, via Secrets/Vercel env — nunca hardcoded.
3. Rode a Regra de ouro acima do zero antes do push.
4. Produção (Vercel) precisa do mesmo: `prisma generate` com URL real
   no build (build command ou `postinstall`).
