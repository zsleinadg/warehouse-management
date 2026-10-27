const SPREADSHEET_ID = "1qvMoKjUIoS2gpsiHgTpomG0MMLb5WKIQRcEt8ylIUlM";

const ABA_SAIDAS = "SAIDA DE ESTOQUE";
const ABA_DEVOLUCOES = "DEVOLUÇÃO PARA ESTOQUE";
const ABA_DEBUG = "DEBUG";

const HEADERS_SAIDAS = [
  "CODIGO", "DESCRIÇÃO", "UND.MED", "QTDs", "OT",
  "DATA", "NOTA DE ENTREGA", "RECEBEDOR", "STATUS",
  "OBSERVAÇAO", "MARIA"
];

const HEADERS_DEVOLUCOES = [
  "CÓDIGO", "DESCRIÇÃO", "UND.MED", "QTDs", "OT",
  "Data Devolução", "CHEFE DE TURMA", "NOTA", "STATUS",
  "OBSERVAÇAO"
];

// Sempre abre a planilha pelo ID fixo.
function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function logDebug(message) {
  const texto = String(message);
  console.log("[SAIDA-DEVOLUCAO] " + texto);

  try {
    const ss = getSpreadsheet();
    let sheet = ss.getSheetByName(ABA_DEBUG);

    if (!sheet) {
      sheet = ss.insertSheet(ABA_DEBUG);
      sheet.appendRow(["DATA/HORA", "MENSAGEM"]);
    }

    sheet.appendRow([new Date(), texto]);
  } catch (error) {
    console.error("Falha no DEBUG: " + error.message);
  }
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    const ss = getSpreadsheet();
    const aba = e && e.parameter && e.parameter.aba
      ? e.parameter.aba
      : ABA_SAIDAS;

    const sheet = ss.getSheetByName(aba);

    if (!sheet) {
      return jsonResponse({
        status: "erro",
        message: "Aba não encontrada: " + aba,
        spreadsheetId: ss.getId(),
        spreadsheetUrl: ss.getUrl()
      });
    }

    const values = sheet.getDataRange().getValues();

    return jsonResponse({
      status: "sucesso",
      spreadsheetId: ss.getId(),
      spreadsheetUrl: ss.getUrl(),
      aba: aba,
      linhas: Math.max(0, values.length - 1),
      dados: values.length > 1 ? values.slice(1) : []
    });
  } catch (error) {
    logDebug("Erro no doGet: " + error.message);

    return jsonResponse({
      status: "erro",
      message: error.message
    });
  }
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("Corpo da requisição ausente.");
    }

    const payload = JSON.parse(e.postData.contents);
    const ss = getSpreadsheet();

    logDebug("Recebida ação: " + payload.action);
    logDebug("Planilha destino: " + ss.getId());

    let resultado;

    if (payload.action === "sync_saida") {
      resultado = processarSaida(payload);
    } else if (payload.action === "sync_devolucao") {
      resultado = processarDevolucao(payload);
    } else {
      throw new Error("Ação não reconhecida: " + payload.action);
    }

    return jsonResponse({
      ...resultado,
      spreadsheetId: ss.getId(),
      spreadsheetUrl: ss.getUrl()
    });
  } catch (error) {
    logDebug("ERRO doPost: " + error.message);

    return jsonResponse({
      status: "erro",
      message: error.message
    });
  }
}

function openSheet(aba, headers) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(aba);

  if (!sheet) {
    sheet = ss.insertSheet(aba);
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length)
      .setValues([headers])
      .setFontWeight("bold");
  }

  return sheet;
}

function gravarLinhas(aba, headers, rows) {
  if (!rows.length) {
    throw new Error("Nenhuma linha para gravar na aba " + aba);
  }

  const ss = getSpreadsheet();
  const sheet = openSheet(aba, headers);

  // Confirma que a quantidade de colunas está correta.
  rows.forEach((row, index) => {
    if (row.length !== headers.length) {
      throw new Error(
        "Linha " + index + " tem " + row.length +
        " colunas; esperado: " + headers.length
      );
    }
  });

  const primeiraLinha = sheet.getLastRow() + 1;

  sheet.getRange(
    primeiraLinha, 1, rows.length, headers.length
  ).setValues(rows);

  SpreadsheetApp.flush();

  // Confere os valores efetivamente gravados.
  const gravados = sheet.getRange(
    primeiraLinha, 1, rows.length, headers.length
  ).getValues();

  if (gravados.length !== rows.length) {
    throw new Error("A quantidade de linhas gravadas não confere.");
  }

  logDebug(
    "Gravação verificada. Planilha=" + ss.getId() +
    "; aba=" + aba +
    "; primeiraLinha=" + primeiraLinha +
    "; quantidade=" + gravados.length
  );

  return {
    status: "sucesso",
    aba: aba,
    linhas: gravados.length,
    primeiraLinha: primeiraLinha
  };
}

function processarSaida(payload) {
  const issue = payload.issue;
  const items = payload.items;

  if (!issue || !Array.isArray(items) || items.length === 0) {
    throw new Error("Saída sem issue ou sem itens.");
  }

  const rows = items.map(item => {
    if (!item.material) {
      throw new Error("Item de saída sem material.");
    }

    const material = item.material;
    const quantidade = item.fulfilledQuantity ?? item.quantity ?? 0;

    let status = issue.status || "Pendente";

    if (issue.status === "CLOSED") {
      status = quantidade < (item.quantity ?? 0)
        ? "PARCIAL"
        : "REGULARIZADO";
    } else if (issue.status === "DRAFT") {
      status = "Pendente";
    } else if (issue.status === "CANCELLED") {
      status = "Cancelado";
    }

    const observacoes = [];

    if (issue.notes) {
      observacoes.push("Obs: " + issue.notes);
    }

    if (item.additions && item.additions.length) {
      observacoes.push(
        "Acréscimos: " +
        item.additions.map(a => "+" + a.quantity).join("; ")
      );
    }

    if (issue.status === "CANCELLED" && issue.cancelReason) {
      observacoes.push("Cancelada: " + issue.cancelReason);
    }

    return [
      material.code ?? "",
      material.name ?? "",
      material.unit ?? "",
      quantidade,
      issue.ot ?? "",
      // CORREÇÃO: usa issue.createdAt enviado pelo Next.js (formato DD/MM/AAAA)
      // em vez de gerar data/hora atual
      issue.createdAt ?? "",
      issue.nfNumber ?? "",
      issue.foreman ?? "",
      status,
      observacoes.join(" | "),
      ""
    ];
  });

  return gravarLinhas(ABA_SAIDAS, HEADERS_SAIDAS, rows);
}

function processarDevolucao(payload) {
  const devolucao = payload.devolucao;
  const items = payload.items;

  if (!devolucao || !Array.isArray(items) || items.length === 0) {
    throw new Error("Devolução sem dados ou sem itens.");
  }

  const rows = items.map(item => {
    if (!item.material) {
      throw new Error("Item de devolução sem material.");
    }

    const material = item.material;

    return [
      material.code ?? "",
      material.name ?? "",
      material.unit ?? "",
      item.quantity ?? 0,
      devolucao.ot ?? "",
      // CORREÇÃO: usa devolucao.createdAt enviado pelo Next.js (formato DD/MM/AAAA)
      // em vez de re-formatar com new Date().toLocaleString() que adiciona horário
      devolucao.createdAt ?? "",
      devolucao.userName ?? "",
      devolucao.nfNumber ?? "",
      "REGULARIZADO",
      devolucao.reason ?? ""
    ];
  });

  return gravarLinhas(ABA_DEVOLUCOES, HEADERS_DEVOLUCOES, rows);
}

// Teste de conexão: não altera as abas de movimentação.
function testarConexao() {
  const ss = getSpreadsheet();

  const resultado = {
    status: "sucesso",
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl(),
    abas: ss.getSheets().map(s => s.getName())
  };

  logDebug("Teste de conexão: " + JSON.stringify(resultado));
  console.log(JSON.stringify(resultado));

  return resultado;
}