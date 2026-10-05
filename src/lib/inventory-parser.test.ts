import { parseInventory } from "./inventory-parser";

describe("parseInventory", () => {
  it("parses a simple two-level section", () => {
    const entries = parseInventory(`P1 Left
850402 Haste 1500MM
850383 Haste 2000MM`);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      path: ["P1", "Left"],
      code: "850402",
      name: "Haste 1500MM",
      quantity: 1,
      needsReview: false,
    });
  });

  it("nests Meio under Baixo/Meio/Cima by rank", () => {
    const entries = parseInventory(`P1 Right
Baixo
300647 Isolador Roldana
Meio
990243 Para-Raios DH T 12KV
Cima
164487 Caixa Derivada`);

    expect(entries[0].path).toEqual(["P1", "Right", "Baixo"]);
    expect(entries[1].path).toEqual(["P1", "Right", "Meio"]);
    expect(entries[2].path).toEqual(["P1", "Right", "Cima"]);
  });

  it("nests numbered sub-levels and resolves Continuando", () => {
    const entries = parseInventory(`P2 Left
Meio
Meio 1
9900014115 Descon 15KV
Meio 2
275695 Conector Perf
Meio 1 Continuando
300031 Isolador Poste`);

    expect(entries[0].path).toEqual(["P2", "Left", "Meio", "Meio 1"]);
    expect(entries[1].path).toEqual(["P2", "Left", "Meio", "Meio 2"]);
    expect(entries[2].path).toEqual(["P2", "Left", "Meio", "Meio 1"]);
  });

  it("reads (Nx) suffix as quantity", () => {
    const entries = parseInventory(`P1 Right
Cima
164518 Caixa Protecao Secundaria (4x)`);

    expect(entries[0]).toMatchObject({ quantity: 4, name: "Caixa Protecao Secundaria" });
  });

  it("flags asterisk-wrapped lines for review", () => {
    const entries = parseInventory(`P2 Left
Meio 1 Continuando
*170041 Elo Fusivel*`);

    expect(entries[0]).toMatchObject({
      code: "170041",
      name: "Elo Fusivel",
      needsReview: true,
    });
  });

  it("extracts underscore notes and flags review", () => {
    const entries = parseInventory(`P4 Left
Meio 1
251893 _confusao_ Sapatilha`);

    expect(entries[0]).toMatchObject({
      code: "251893",
      name: "Sapatilha",
      notes: "confusao",
      needsReview: true,
    });
  });

  it("supports corridor sections and part sub-levels", () => {
    const entries = parseInventory(`Corredor P3-P4
Meio 2
780702 Bucha
P3 Right
Meio 3 Parte 1
274861 Abracadeira`);

    expect(entries[0].path).toEqual(["Corredor P3-P4", "Meio 2"]);
    expect(entries[1].path).toEqual(["P3", "Right", "Meio 3 Parte 1"]);
  });

  it("allows the same code in two locations", () => {
    const entries = parseInventory(`P1 Right
Baixo
990243 Para-Raios DH T 12KV
Meio
990243 Para-Raios DH T 12KV`);

    expect(entries[0].path).not.toEqual(entries[1].path);
    expect(entries[0].code).toBe(entries[1].code);
  });

  it("keeps a lone Meio 1 as sibling of Baixo instead of nesting", () => {
    const entries = parseInventory(`P4 Left
Baixo
780709 Arruela Quadrada
Meio 1
990293 Isolador`);

    expect(entries[0].path).toEqual(["P4", "Left", "Baixo"]);
    expect(entries[1].path).toEqual(["P4", "Left", "Meio 1"]);
  });

  it("keeps corridor sub-levels flat under the corridor", () => {
    const entries = parseInventory(`Corredor P3-P4
Baixo
780700 Peca
Meio 2
780702 Bucha`);

    expect(entries[0].path).toEqual(["Corredor P3-P4", "Baixo"]);
    expect(entries[1].path).toEqual(["Corredor P3-P4", "Meio 2"]);
  });

  it("nests numbered headings only under their prefix parent", () => {
    const entries = parseInventory(`P2 Left
Meio
Meio 1
9900014115 Descon 15KV
Cima
280054 Caixa Protecao`);

    expect(entries[0].path).toEqual(["P2", "Left", "Meio", "Meio 1"]);
    expect(entries[1].path).toEqual(["P2", "Left", "Cima"]);
  });
});
