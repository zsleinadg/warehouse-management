# Resumo da Implementação - Warehouse Management

## Data: 20/10/2026

---

## ✅ CONCLUÍDO

### 1. Catálogo de Fornecedores (PR #21 - merged)
- **Branch**: `feature/catalog-import`
- **Tabela**: `CatalogMaterial` (standalone, 15.959 linhas)
- **Endpoints**: 
  - `GET /api/catalog` - busca paginada com disponibilidade no estoque
  - `GET /api/catalog?q=` - busca por código/nome
- **Importador**: `prisma/import-catalog.ts` (idempotente, 165 conflitos de depósito)
- **Renomeação**: 190 materiais renomeados para nomes oficiais do catálogo (BLCT preferido)
- **Aba**: `/catalogo` (consulta read-only com busca, filtro por planta, paginação)

### 2. Etiquetas (PR #22 - merged)
- **Branch**: `feature/etiquetas`
- **Aba**: `/etiquetas` com 3 tabs:
  - **Pequena**: grade 4×4 (16/folha A4 paisagem)
  - **Grande**: 1 por folha + opção palete com cortes
  - **Do Word** (em desenvolvimento)
- **Recursos**:
  - Code 39 barcode (fonte Libre Barcode 39)
  - Logo B&Q 39 anos
  - Geometria milimétrica fiel à planilha original
  - Impressão A4 paisagem sem margens

### 3. Histórico de Contagens (PR #24 - merged)
- **Branch**: `feature/count-history`
- **Migration**: `20261015122807_add_stock_count` (aplicada em prod)
- **Tabelas**: `StockCount`, `StockCountItem`, `Movement.countId`
- **APIs**:
  - `POST /api/adjustments` - cria contagem + itens + movements (batch)
  - `GET /api/adjustments` - lista contagens
  - `GET /api/adjustments/:id` - detalhe da contagem
- **Dashboard**: cards agrupados por `countId` (1 card por sessão)
- **Página Contagem**: histórico clicável + deep-link `?count=`

### 4. Senha Admin
- **Email**: `admin@warehouse.local`
- **Senha**: `Warehouse@Admin123`
- **Ambientes**: Dev + Prod (ambos atualizados)

---

## 🚧 EM ANDAMENTO

### 5. Etiquetas: Impressão a partir de Word (.docx)
**Status**: Backend 90% pronto, Frontend pendente

#### Backend: `POST /api/labels/from-word`
- ✅ Rota criada: `src/app/api/labels/from-word/route.ts`
- ✅ Extração de placeholders (`{{CAMPO}}`) via mammoth
- ✅ Geração de .docx preenchido via `docx` v9 (SectionProperties)
- ✅ Busca catálogo por códigos (`itemCodes` no formData)
- ✅ Gera 1 página A4 paisagem por item (ATENDIMENTO / OBRAS / DATA)
- ⏳ Integração com mapeamento de placeholders personalizados

#### Template Word
- **Arquivo**: `data/template-identificacao-obras.docx` (40KB)
- **Estrutura**: A4 paisagem, logo B&Q, "ATENDIMENTO" / "OBRAS" / Data
- **Placeholders detectados**: nenhum (template estático - precisa adicionar `{{CODIGO}}`, `{{NOME}}`, etc.)

#### Frontend (pendente)
- Nova aba **"Do Word"** em `/etiquetas`
- Upload drag-and-drop .docx
- Detecção automática de placeholders
- UI de mapeamento: placeholder → campo do catálogo
- Preview HTML do template
- Botão "Gerar e Baixar .docx"

---

## 📋 PENDENTES PRIORITÁRIOS

### 6. Contagem: Solicitar Contagem Flexível
**Objetivo**: Separar "solicitar" → "contar" → "aplicar"

#### Novos Estados (`StockCount.status`):
- `PENDING` → `COUNTED` → `APPLIED` | `CANCELLED`

#### Nova Tela "Nova Contagem":
- Radio: "Por Localização" | "Por Materiais"
- Se Local: select tree → carrega itens do local
- Se Materiais: multi-select com busca (CodePicker igual etiquetas)
- Cria `StockCount` com `status: PENDING`, `countedQuantity: null`

#### Tela "Contar" (nova):
- Lista contagens `PENDING` do usuário
- `countedQuantity` inicia **vazio** (não pré-preenchido)
- Botão "Finalizar Contagem" → `PATCH /api/counts/:id/count` → `COUNTED`
- **NÃO atualiza estoque** nem cria movements

#### Tela "Aplicar" (aprovação):
- Lista `COUNTED` (ADMIN vê todas)
- Botão "Aplicar ao Estoque" → `POST /api/counts/:id/apply`
  - Cria `Movement` tipo `ADJUSTMENT` + atualiza `Stock.quantity`
  - Status → `APPLIED` + `appliedAt` + `appliedBy`
- Botão "Cancelar" → `PENDING` ou `CANCELLED`

#### Novas Rotas API:
| Rota | Método | Descrição |
|------|--------|-----------|
| `/api/counts` | POST | Criar solicitação (local OU materiais) |
| `/api/counts` | GET | Listar com filtros |
| `/api/counts/:id` | GET | Detalhe |
| `/api/counts/:id/count` | PATCH | Salvar contadas |
| `/api/counts/:id/apply` | POST | Aplicar ao estoque |
| `/api/counts/:id/cancel` | POST | Cancelar |

---

### 7. Saídas: Busca de Material (Type-ahead)
**Problema**: `LineItemArray` usa `FormSelect` com 190+ opções (dropdown inutilizável)

#### Solução: `MaterialPicker` (reutiliza `CodePicker`)
- Busca em `GET /api/materials?q=` (novo param)
- Debounce 300ms, dedup por código
- Mostra: `CÓDIGO — NOME (UN)`
- Click seleciona → preenche `materialId` no `LineItemArray`

#### API: `GET /api/materials?q=` (busca por código/nome, `take: 20`)

---

### 8. Etiquetas: Correção Digitação Rápida
**Bug**: No `CodePicker`, digitação rápida apaga o que foi digitado

**Causa**: `onChange` zera `item` antes do debounce; re-render → efeito roda com `debounced` velho → apaga escolha

**Fix** (já aplicado em `/contagem`, replicar em `/etiquetas`):
```tsx
const onChangeRef = useRef(onChange);
useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

// No onChange do input - NÃO chamar onChange imediatamente
onChange={(e) => {
  lockedRef.current = "";
  setOpen(true);
  // NÃO chamar onChange aqui
}}

// No efeito - usar onChangeRef.current
```

---

## 📦 PRÓXIMOS PASSOS (Ordem Sugerida)

1. **Correção digitação etiquetas** (30 min - bug crítico)
2. **MaterialPicker nas Saídas** (2h - alto impacto)
3. **Word → Etiquetas frontend** (4-6h)
4. **Contagem Flexível** (8-12h - maior, migration + telas + APIs)

---

## 🔧 COMANDOS ÚTEIS

```bash
# Gates de qualidade
npx tsc --noEmit
npx eslint <arquivos>
npm run build
npm run doctor

# Testar docx localmente
node -e "
const { Document, Packer, SectionProperties } = require('docx');
const doc = new Document({
  sections: [{
    properties: {
      pageSize: { orientation: 'landscape', width: 16838, height: 11906 },
      pageMargin: { top: 720, right: 720, bottom: 720, left: 720 },
    },
    children: []
  }]
});
require('docx').Packer.toBuffer(doc).then(b => console.log('OK:', b.length));
"
```

---

## 📁 ARQUIVOS-CHAVE

| Arquivo | Descrição |
|---------|-----------|
| `src/app/api/labels/from-word/route.ts` | Backend Word → Labels |
| `src/app/(dashboard)/etiquetas/page.tsx` | Frontend etiquetas (3 tabs) |
| `src/app/(dashboard)/contagem/page.tsx` | Contagem (atual + histórico) |
| `src/app/(dashboard)/saidas/page.tsx` | Saídas (precisa MaterialPicker) |
| `src/app/api/adjustments/route.ts` | API contagens (POST/GET) |
| `src/app/api/adjustments/[id]/route.ts` | Detalhe contagem |
| `src/app/api/dashboard/route.ts` | Dashboard (agrupa por countId) |
| `src/app/api/materials/route.ts` | Precisa `?q=` para MaterialPicker |
| `data/template-identificacao-obras.docx` | Template Word (40KB) |
| `prisma/migrations/20261015122807_add_stock_count/` | Migration contagens |

---

## 📝 VAULT - PENDENTE
- Atualizar `05-Projetos/warehouse/Progresso.md`
- Atualizar `05-Projetos/warehouse/Decisoes.md` (decisão tabela standalone, contagem em 3 fases)

---

**Última atualização**: 20/10/2026 - Branch atual: `feature/count-history` (local, limpa)