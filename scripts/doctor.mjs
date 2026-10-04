/**
 * npm run doctor — checagem rápida anti-"Unknown field/argument".
 *
 * O erro `PrismaClientValidationError: Unknown field X` quase sempre significa
 * UMA destas três dessincronias:
 *   1. schema.prisma mudou mas `prisma generate` não rodou (cliente velho no disco);
 *   2. servidor rodando com cliente antigo na memória (falta restart / rebuild);
 *   3. migration não aplicada no banco (falta aplicar + resolve).
 *
 * Uso: node scripts/doctor.mjs [--fix-hint]
 * Só usa node puro (sem dependências). Não altera nada.
 */
import { existsSync, readFileSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const SCHEMA = join(ROOT, "prisma", "schema.prisma");
const GENERATED = join(ROOT, "prisma", "generated");
const MIGRATIONS = join(ROOT, "prisma", "migrations");

let failures = 0;
function ok(msg) {
  console.log(`  [ok] ${msg}`);
}
function fail(msg, hint) {
  failures++;
  console.log(`  [FALHA] ${msg}`);
  if (hint) console.log(`         -> ${hint}`);
}

// 1. Arquivos base existem?
for (const [label, path] of [["schema.prisma", SCHEMA], ["prisma/generated", GENERATED], ["prisma/migrations", MIGRATIONS]]) {
  if (existsSync(path)) ok(`${label} existe`);
  else fail(`${label} não encontrado em ${path}`, "rode `npx prisma generate`");
}

// 2. Cada model do schema tem arquivo gerado com todos os campos?
if (existsSync(SCHEMA) && existsSync(GENERATED)) {
  const schema = readFileSync(SCHEMA, "utf8");
  const modelBlocks = [...schema.matchAll(/^model (\w+) \{([^}]*)\}/gm)];
  for (const [, model, body] of modelBlocks) {
    const generatedFile = join(GENERATED, "models", `${model}.ts`);
    if (!existsSync(generatedFile)) {
      fail(`model ${model}: sem arquivo gerado`, "rode `npx prisma generate`");
      continue;
    }
    const generated = readFileSync(generatedFile, "utf8");
    const fields = [...body.matchAll(/^\s{2}(\w+)\s[^/]/gm)]
      .map((m) => m[1])
      .filter((f) => !f.startsWith("@@"));
    const missing = fields.filter((f) => !generated.includes(f));
    if (missing.length === 0) ok(`model ${model}: ${fields.length} campos no cliente`);
    else fail(`model ${model}: campos ausentes no cliente: ${missing.join(", ")}`, "rode `npx prisma generate`");
  }
  // 3. Cliente mais novo que o schema?
  try {
    const schemaTime = statSync(SCHEMA).mtimeMs;
    const genEntries = readdirSync(join(GENERATED, "models"));
    const newest = Math.max(...genEntries.map((f) => statSync(join(GENERATED, "models", f)).mtimeMs));
    if (newest >= schemaTime) ok("cliente gerado após última edição do schema");
    else fail("cliente gerado ANTES da última edição do schema", "rode `npx prisma generate` e reinicie o servidor");
  } catch {
    fail("não foi possível comparar datas", "rode `npx prisma generate`");
  }
}

// 4. Servidor rodando agora? (se sim, ele pode estar com cliente velho na memória)
try {
  const out = execSync("netstat -ano", { encoding: "utf8" });
  const listeners = out.split("\n").filter((l) => l.includes(":3000") && l.includes("LISTENING"));
  if (listeners.length === 0) ok("porta 3000 livre (nenhum servidor rodando)");
  else fail(`porta 3000 ocupada:\n${listeners.map((l) => `         ${l.trim()}`).join("\n")}`, "pare (Ctrl+C) e suba de novo para carregar o cliente atual");
} catch {
  console.log("  [pulo] não foi possível checar a porta 3000");
}

console.log("");
if (failures > 0) {
  console.log(`Resultado: ${failures} problema(s). Ordem de correção: generate -> migrate resolve/aplicar -> restart (dev) ou build+restart (start).`);
  process.exit(1);
}
console.log("Resultado: tudo consistente. Se o erro persistir, o processo rodando é anterior ao generate: reinicie-o.");
