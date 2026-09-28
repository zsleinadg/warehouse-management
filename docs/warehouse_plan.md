# Warehouse Management — Plano Oficial v1

> Projeto de estudo + sistema profissional + peça de portfólio.
> Nome genérico de propósito: nenhum vínculo com empresa cliente.
> Status: FASE 0 em construção. Seções 4 e 5 são roadmap futuro.

## 0. Contexto e problema

Almoxarifado de materiais elétricos de alto valor (conectores, hastes,
isoladores, caixas, para-raios, cabos — milhares de reais em estoque).
Operação hoje manual: itens fora de ordem, localização só na memória,
processo informal de baixa sem rastreabilidade de quem movimentou o quê.

**Dores que o sistema resolve:**
1. Saber pelo código ou nome exatamente onde cada item está
2. Estrutura flexível — prateleiras com 4 níveis, outras com 1–2
3. Reordenar itens arrastando com o mouse, com ordem persistida
4. Baixa/saída para equipe/obra com comprovante e histórico (futuro)
5. Entrada por Nota Fiscal sem digitação manual (futuro)

**Fonte de verdade v1:** levantamento manual via WhatsApp (P1–P6 +
Corredor P3–P4), mais completo que o protótipo HTML inicial.
Protótipo de referência: `prototype/prototype_warehouse.html`.

## 1. Stack — padrão Vault (não trocar sem registrar em Decisoes.md)

### 1.1 Base

| Camada  | Decisão |
|---------|---------|
| App     | Monólito Next.js 16 App Router + TypeScript `strict` |
| Linguagem | Código em inglês; docs e contexto em português |
| Deploy  | Só Vercel: `main` = prod, `develop` = preview por PR |
| Git     | `develop` + `feature/*`, squash → develop, merge → main + tag SemVer |
| Commits | Inglês, `tipo(escopo): assunto` imperativo, corpo explica o porquê; 1 tema por commit (didático) |

### 1.2 Frontend (React 19 / Next 16)

- Componentes funcionais com hooks; lógica extraída para custom hooks
- App Router: separar Server e Client Components; mutations via
  Server Actions (`"use server"`) + `useActionState`
- Forms: **React Hook Form + Zod**, validação dupla (form + server);
  `z.coerce` para números vindos de input
- Data no client: **TanStack Query** (cache, mutations, invalidação);
  `revalidatePath`/`redirect` nas server actions
- UI: **Tailwind v4** (classes canônicas, sem arbitrário com equivalente)
  + **shadcn/ui** (construído sobre Radix = acessibilidade pronta).
  Regra Vault: antes de criar UI do zero, buscar em
  `04-Snippets/<UI|Forms|Layout|Feedback>/`. Os snippets estão vazios
  hoje — os patterns deste projeto (árvore, busca com jump, drag reorder,
  isométrica SVG) serão cadastrados como os primeiros snippets
- Auth web: cookie httpOnly (`warehouse_token`) via `cookies().set`

### 1.3 Backend & APIs

Segue `03-Patterns/API-Patterns/backend-layering`, adaptado ao monólito:

```
validateSchema (Zod) → auth → admin → controller/action → service.execute() → Prisma
```

- **Mutações de UI:** Server Actions (`"use server"`) + `useActionState`
  para formulários diretos do app (POST opaco interno do Next.js)
- **REST APIs (Route Handlers em `app/api/`):** consultas complexas,
  integração com leitores/OCR e qualquer rota exposta a terceiros
- **Contrato & Documentação:** schemas Zod convertidos para OpenAPI v3
  via `@asteasolutions/zod-to-openapi`, expostos em `/docs` (Swagger UI)
  + collection Postman versionada em `postman/`
- Services com método `execute()`; services lançam
  `new Error("msg descritiva")`, sem try/catch espalhado
- Validação Zod em toda entrada; erro padrão `{ field, message }`
- Nomenclatura: `create-stock-service.ts` → `CreateStockService`
- Upload futuro (CSV/OCR): buffer em memória 5MB, sem persistir arquivo cru

### 1.4 Banco (Prisma 7 + Neon Postgres)

- Singleton `PrismaPg`; `select` explícito (nunca `select *`)
- Check-exists antes de update/delete; soft-delete via `disabled`
- Preço em centavos (`Int`); converter com `Math.round(parseFloat * 100)`
- Enums no Prisma: `Role ADMIN|OPERADOR|CONSULTA`,
  `MovementType ENTRADA|SAIDA|TRANSFER|AJUSTE`
- Erro global final mapeando 401/403/400/500

### 1.5 Qualidade mínima (desde o commit 1)

- Husky: `pre-commit` eslint (sem --fix) + testes; `commit-msg` valida
  `tipo(escopo): assunto` em inglês; `pre-push` build
- Zod em toda entrada; sem segredo no código (`.env.local`, nunca commit)
- Checklist pré-push: `git status` limpo, lint + build + testes ok

### 1.6 Infraestrutura & DevOps

| Recurso | Estratégia |
|---|---|
| **CI/CD** | GitHub Actions (`ci.yml`): lint, typecheck, testes e build em cada PR para `develop`/`main` |
| **Conteinerização** | `Dockerfile` multistage (standalone, non-root) + `compose.yml` com Postgres local para dev/testes |
| **Testes** | **Jest** (unit/regras de negócio) + Playwright e2e (futuro) |
| **Deploy** | Vercel: preview automático por PR, produção via `main` |

## 2. Modelo de dados v1

```prisma
Location { id, name, parent_id → Location?, ordem, qr_code, disabled }
Material { id, codigo @unique, nome, unidade, estoque_min, custo_centavos Int, disabled }
Stock    { material_id, location_id, quantidade, ordem, observacao, revisar Bool }
Movement { id, tipo MovementType, qty, user_id, destino_obra, created_at }
User     { id, name, role Role }
```

Regras: `parent_id` recursivo aceita qualquer ramificação; mesmo `codigo`
pode ter N `Stock` (ex: `990243` em dois pontos); `(2x)(3x)` do
levantamento → `quantidade`; marcações de inconsistência no levantamento
(`*...*`, `_confusão_`) → `revisar=true` + badge "pendente de auditoria"
na UI; `Meio N Continuando` → mesma Location, continua `ordem`.

## 3. FASE 0 — Protótipo usável (ESCOPO ATUAL)

1. `chore(init): scaffold next` — feito
2. `chore(db): prisma + neon connect + singleton`
3. `feat(db): schema location/material/stock/movement/user`
4. `feat(seed): import levantamento P1–P6 preservando ordem`
5. `feat(api): GET árvore + busca codigo/nome (Route Handlers REST)`
6. `feat(ui): árvore + busca + breadcrumb "onde está" + jump`
7. `feat(ui): drag reorder com ordem persistida`
8. `feat(ui): isométrica SVG gerada da árvore, cor por ocupação`
9. `feat(auth): login ADMIN único`
10. `chore(deploy): vercel preview ligado no Neon`

## 4. FUTURO A — Operação profissional diária (fora do protótipo)

11. `feat(stock): entrada/saída com baixa automática de qty`
12. `feat(movement): saída p/ equipe-obra + comprovante imprimível`
13. `feat(alert): aviso estoque_min`
14. `feat(qr): etiqueta por location, rota /l/[qr]`
15. `feat(import): upload CSV da NF (ponte até o OCR)`
16. `feat(reports): valor total, histórico, export CSV`
17. `feat(api-docs): openapi.json + Swagger UI em /docs + collection Postman`
18. `test(stock): jest entrada/saída/transfer`

## 5. FUTURO B — Automação (fora do protótipo)

18. `feat(ocr): foto NF → OCR → tela conferência → entrada 1-clique`
19. `feat(ocr-exceptions): código novo, qtd divergente, ilegível`
20. `feat(barcode): leitura câmera na entrada/saída`
21. `feat(pwa): fila offline com sync`
22. `feat(isometric-pro): drag de location inteira`

## 6. Portfólio (contínuo)

- README com GIF (busca/drag/isométrica) + link demo + seção arquitetura
- `docs/Decisoes.md`: cada fuga do default com data, contexto, decisão,
  alternativa descartada e motivo
- Snippets promovidos ao Vault ao final de cada UI pronta

## 7. Trade-offs de arquitetura

- **Por que monólito Next.js em vez de microsserviços?**
  Para o escopo atual, o monólito reduz a complexidade de deploy, garante
  consistência em transações do banco e acelera a entrega. A camada de
  serviços (`service.execute()`) é isolada para permitir extração futura
  se necessário.
- **Por que Prisma + Neon Postgres?**
  Neon oferece branching do banco para os ambientes de preview da Vercel,
  enquanto o Prisma garante type-safety ponta a ponta com TypeScript.
- **Por que `Location` recursiva (`parent_id`)?**
  Modela o almoxarifado em árvore com profundidade dinâmica
  (galpão → corredor → prateleira → nível → caixa) sem mudar o schema.
