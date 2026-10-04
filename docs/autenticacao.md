# Autenticação — como funciona

> Sistema: JWT de acesso curto (12h) + refresh opaco com rotação (30d), ambos em
> cookies `httpOnly`. Papéis: `ADMIN` > `OPERATOR` > `VIEWER`.

## 1. Visão geral

```
[login/page] --email/senha--> POST /api/auth/login --bcrypt ok-->
  cria Session + JWT --> Set-Cookie: warehouse_token (12h) + warehouse_refresh (30d)
[qualquer página/API] --> proxy.ts (borda) --> authorize() (papel) --> dados
[avatar > Sair] --> POST /api/auth/logout --> revoga Session + limpa cookies
```

- **Access token**: JWT HS256 assinado com `AUTH_SECRET` (`sub` = id do usuário,
  `role`, `iat`, `exp` = `iat` + 12h). Validado sem banco na maioria das rotas.
- **Refresh token**: string aleatória de 32 bytes (hex); no banco fica só o
  **SHA-256** (`Session.tokenHash`) — o valor puro nunca é persistido.
- **Cookies**: `httpOnly`, `SameSite=Lax`, `Path=/`, sem `Domain` (host-only).
  `Secure` segue `COOKIE_SECURE` (`true`/`false` explícito, senão `NODE_ENV ===
  "production"`). Ver `src/lib/tokens.ts:54-62`.
- **Sessão dura 12h corridas desde o login.** Depois disso o servidor responde
  401 e a UI trata como deslogado. O refresh de 30 dias existe no backend, mas
  **nenhum código do front o chama hoje** (renovação silenciosa não implementada).

## 2. Fluxos

### 2.1 Login — `POST /api/auth/login`
Arquivo: `src/app/api/auth/login/route.ts`.

1. Schema zod com `trim()` (teclado mobile costuma inserir espaço):
   `email` (minúsculo + formato) e `password` (`route.ts:10-13`).
2. Busca `User` por email; rejeita inexistente/**desabilitado** com 401 genérico
   "Invalid credentials" (não revela se o email existe).
3. `bcrypt.compare` (custo 12, ver §5). Erro → mesmo 401 genérico.
4. Cria `Session` (`userId`, `tokenHash`, `expiresAt` = +30d).
5. Responde `{ data: { id, name, email, role } }` + `setAuthCookies()` com os dois
   cookies. Front redireciona para `/` (`src/app/(auth)/login/page.tsx:24-44`).

### 2.2 Guarda de borda — `src/proxy.ts`
Roda antes de páginas e APIs (exceto `/_next/*`, `favicon` e `api/auth/*`):

| Caminho | Sem token válido | Com token válido |
|---|---|---|
| `/login` | mostra o form | redireciona para `/` |
| Qualquer página | redireciona para `/login` | segue |
| Qualquer `/api/*` | 401 JSON | segue (cada rota ainda checa o papel) |

### 2.3 Autorização por papel — `src/lib/roles.ts`
`authorize(request, ["ADMIN", "OPERATOR"])` lê o cookie `warehouse_token`,
verifica assinatura/expiração e compara `claims.role` com a lista. Falhas:
token ausente/forjado/expirado → 401; papel fora da lista → 403. Exemplos:
mutação de estoque exige `ADMIN/OPERATOR`; `GET /api/materials` e auditoria
aceitam `VIEWER`.

### 2.4 Quem sou eu — `GET /api/auth/me`
Arquivo: `src/app/api/auth/me/route.ts`. Valida o JWT, recusa usuário
inexistente/**desabilitado** e devolve `{ id, name, email, role }`. Consumido
por `useMe`/`useCanEdit`/`useIsAdmin` (`src/hooks/use-me.ts`): o header mostra
nome/papel e os botões de edição (`canEdit = ADMIN ou OPERATOR`) aparecem ou
não conforme o papel.

### 2.5 Logout — `POST /api/auth/logout`
Arquivo: `src/app/api/auth/logout/route.ts`. Marca a `Session` atual como
`revokedAt` (pelo hash do refresh) e **sempre** limpa os dois cookies, mesmo sem
sessão ("Always succeeds"). Front: avatar → Sair (`Header.tsx:124-134`).

### 2.6 Refresh com rotação — `POST /api/auth/refresh`
Arquivo: `src/app/api/auth/refresh/route.ts`. Valida o refresh contra
`Session` (inexistente/revogada/expirada → 401 + limpa cookies), cria a próxima
sessão, marca a atual `revokedAt + replacedBy` e reemite os dois cookies.
**Detecção de roubo**: apresentar um refresh já rotacionado (`replacedBy`
preenchido) revoga **todas** as sessões do usuário. ⚠️ Hoje sem chamador no
front — documentado como gap (§7).

## 3. Arquivos envolvidos

| Arquivo | Papel (linhas-chave) |
|---|---|
| `src/proxy.ts` | guarda de borda: `/login`, páginas e `/api/*` (`:9-30`), `matcher` (`:32-34`) |
| `src/app/api/auth/login/route.ts` | login, schema com trim (`:10-13`), bcrypt (`:41`), cria Session (`:50-57`), cookies (`:62-66`) |
| `src/app/api/auth/logout/route.ts` | revoga sessão (`:13-16`) + limpa cookies (`:20`), sempre 200 |
| `src/app/api/auth/me/route.ts` | valida JWT (`:8`), recusa desabilitado (`:20-25`) |
| `src/app/api/auth/refresh/route.ts` | rotação (`:82-95`), anti-roubo (`:55-66`), expiração (`:45-52`) |
| `src/lib/tokens.ts` | `signAccessToken`/`verifyAccessToken` (jose, HS256), TTLs (`:6-7`), `cookieSecure()` (`:54-62`), set/clear cookies |
| `src/lib/auth.ts` | `hashPassword`/`comparePassword` (bcryptjs, custo 12), refresh opaco + SHA-256 (`:18-25`) |
| `src/lib/roles.ts` | `authorize()` — 401 sem token, 403 sem papel (`:13-37`) |
| `src/hooks/use-me.ts` | `useMe`, `useCanEdit` (ADMIN/OPERATOR), `useIsAdmin` |
| `src/app/(auth)/login/page.tsx` | form, trim no submit, `autoCapitalize="none"`, erro visível sempre, sem travar em "Entrando…" |
| `src/components/layout/Header.tsx` | avatar com papel + Sair (`:100-136`); hamburger mobile |
| `prisma/schema.prisma` | `User` (role, `disabled`), `Session` (`tokenHash` único, `expiresAt`, `revokedAt`, `replacedBy`) |
| `prisma/admin.ts` | cria/atualiza o primeiro `ADMIN` via `ADMIN_EMAIL`/`ADMIN_PASSWORD` (mín. 12 chars) |
| `prisma/seed.ts` | seed de demonstração (não usar em produção) |
| `.env.local` / `.env.example` | `AUTH_SECRET` (32+ chars), `COOKIE_SECURE`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `DATABASE_URL` |
| `scripts/doctor.mjs` | `npm run doctor`: consistência schema × cliente gerado, datas, porta 3000 |

## 4. Tokens e cookies em detalhe

- **JWT** (`warehouse_token`): header `{"alg":"HS256"}`, payload `{role, sub,
  iat, exp}`. `iat`/`exp` são **Unix timestamps** (segundos desde 01/01/1970
  UTC): `exp − iat = 43200` = 12h. Conversão: `new
  Date(iat*1000).toLocaleString("pt-BR")` (JS usa ms) ou
  `datetime.fromtimestamp(iat, fuso)` (Python). Cookies mostram `Expires` em UTC
  (subtraia 3h para Brasília).
- O payload é **assinado, não criptografado**: dá para ler em jwt.io — nunca
  cole tokens em prints/chats.
- **`warehouse_refresh`**: 64 hex chars, `Expires` = +30 dias. Revogado no
  logout; rotacionado no refresh.
- **`COOKIE_SECURE=false`**: obrigatório para `next start` via HTTP em rede
  local (`http://192.168.x.x:3000`) — navegadores **descartam** cookie `Secure`
  em HTTP não-localhost e o login "entra e volta". Em `localhost` funciona
  mesmo com `Secure` (origem confiável). Produção na internet: servir via HTTPS
  e **remover** essa variável.

## 5. Senhas e papéis

- Hash **bcrypt custo 12**; senha nunca em texto claro, nunca no log, nunca no
  `select` das rotas. Comparação por `bcrypt.compare` (tempo constante contra
  timing attack básico).
- Papéis (`Role`): `ADMIN` (tudo, inclui excluir locais e gerir), `OPERATOR`
  (opera estoque/OTs/NFs), `VIEWER` (só leitura onde a rota permite). Usuário
  `disabled` não loga e perde o acesso mesmo com token válido (checagem em
  `/me`; rotas de escrita checam via `authorize` + papel).
- Primeiro admin: `ADMIN_EMAIL` + `ADMIN_PASSWORD` no `.env.local` →
  `npm run db:seed:admin` (faz `upsert`: cria ou redefine senha/papel).

## 6. Operação

```powershell
npm run db:seed:admin   # cria o ADMIN (env ADMIN_EMAIL/ADMIN_PASSWORD)
npm run doctor          # consistência prisma + porta 3000
npm run dev             # programar (recarrega; -H 0.0.0.0 + allowedDevOrigins p/ LAN)
npm run build           # após QUALQUER mudança de código p/ produção
npm start               # uso (PC + celular)
```

Regras que evitam os incidentes já ocorridos:

1. `prisma generate`/migration → **restart obrigatório** (dev) ou **rebuild +
   restart** (`start` empacota o cliente no build). Servidor velho = `Unknown
   field` 500.
2. **Um servidor por vez na 3000** (`dev` e `start` juntos = um não vincula e
   você fala com o velho sem perceber).
3. Mudança de IP do PC (DHCP) → atualizar `allowedDevOrigins` (`next.config.ts`)
   e o endereço no celular.

## 7. Troubleshooting

| Sintoma | Causa provável | Ação |
|---|---|---|
| Cai para login a cada 12h | `exp` do JWT (sessão por turno) | esperado; logue de novo |
| "Entra e volta" pelo IP, sem erro | cookie `Secure` descartado em HTTP LAN | `COOKIE_SECURE=false` + rebuild + restart |
| `Unknown field/argument` 500 após migration | processo com cliente Prisma velho | restart (dev) / rebuild+restart (start) |
| Página carrega, login não fixa no celular | ver linha acima; ou `AUTH_SECRET` divergente | conferir env + rebuild |
| `Blocked cross-origin request` no dev | origem fora de `localhost` | `allowedDevOrigins` com o IP + restart do dev |
| Botão preso em "Entrando…" (versões antigas) | fetch sem try/catch | já corrigido no login atual |

## 8. Gaps conhecidos (não implementados)

1. Link **"Recuperar senha"** no login **sem rota** (404 se clicado).
2. **Refresh sem uso**: `/api/auth/refresh` pronto, mas o front nunca renova —
   sessão morre exatamente em 12h mesmo em uso (sem sliding).
3. **Sem rate-limit** no login (força bruta) e sem lockout após tentativas.
4. **Sem troca de senha** pelo usuário (só via `db:seed:admin`/banco).
5. Sem auditoria de logins (quem entrou, de onde, quando).
6. `GET /api/returns` não aceita `VIEWER` (auditor não lista devoluções).
