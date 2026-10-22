"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/ui/forms";

const PRINT_CSS = `
@page { 
  size: A4 landscape; 
  margin: 0; 
}
@media print {
  aside, header { display: none !important; }
  main { padding: 0 !important; margin: 0 !important; background: #fff !important; }
  .md\\:ml-64, .md\\:ml-16 { margin-left: 0 !important; }
  
  .etq-outer-frame {
    width: 297mm;
    height: 209mm;
    max-height: 209mm;
    padding: 12.7mm;
    box-sizing: border-box;
    background: #fff;
    overflow: hidden;
    page-break-after: avoid;
    break-after: avoid;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .etq-inner-border {
    width: 100%;
    height: 100%;
    border: 1.5pt solid #000;
    box-sizing: border-box;
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: space-evenly;
    align-items: center;
    padding: 10mm 5mm;
    overflow: hidden;
  }
}
`;

async function printLabels(): Promise<void> {
  try {
    await document.fonts.ready;
  } catch {
    // continue anyway
  }
  window.print();
}

export function WordLabelsTab() {
  const [linha1, setLinha1] = useState("ATENDIMENTO");
  const [linha2, setLinha2] = useState("OBRAS");
  const [data, setData] = useState(() => new Date().toLocaleDateString("pt-BR"));

  return (
    <div>
      <style>{PRINT_CSS}</style>
      <h2 className="mb-3 text-lg font-semibold print:hidden">Etiqueta Template (Word)</h2>

      <Card className="mb-4 print:hidden">
        <CardHeader>
          <CardTitle>Configuração</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 max-w-md">
          <FormInput
            label="Primeira linha"
            value={linha1}
            onChange={(e) => setLinha1(e.target.value)}
            placeholder="ATENDIMENTO"
          />
          <FormInput
            label="Segunda linha"
            value={linha2}
            onChange={(e) => setLinha2(e.target.value)}
            placeholder="OBRAS"
          />
          <FormInput
            label="Data"
            value={data}
            onChange={(e) => setData(e.target.value)}
            placeholder="19.10.2026"
          />
          <Button size="sm" onClick={() => void printLabels()}>
            Imprimir
          </Button>
        </CardContent>
      </Card>

      {/* Visão de Impressão (Forçada estritamente a 1 página) */}
      <div className="hidden print:block">
        <div className="etq-outer-frame">
          <div className="etq-inner-border">
            {/* Logo com z-index controlado */}
            <div style={{ position: "absolute", top: "4mm", right: "6mm", zIndex: 10 }}>
              <img
                src="/logo-39anos.png"
                alt="35/39 Anos B&Q"
                style={{ width: "77mm", height: "33mm", objectFit: "contain" }}
              />
            </div>

            {/* Textos centralizados com zIndex superior */}
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-evenly", alignItems: "center", width: "100%", height: "100%", zIndex: 20, position: "relative" }}>
              <h1
                style={{
                  fontFamily: "Calibri, Arial, sans-serif",
                  fontSize: "72pt",
                  fontWeight: "bold",
                  margin: 0,
                  lineHeight: 1,
                  textAlign: "center",
                  color: "#000",
                }}
              >
                {linha1}
              </h1>

              <h2
                style={{
                  fontFamily: "Calibri, Arial, sans-serif",
                  fontSize: "72pt",
                  fontWeight: "bold",
                  margin: 0,
                  lineHeight: 1,
                  textAlign: "center",
                  color: "#000",
                }}
              >
                {linha2}
              </h2>

              <p
                style={{
                  fontFamily: "Calibri, Arial, sans-serif",
                  fontSize: "72pt",
                  fontWeight: "bold",
                  margin: 0,
                  lineHeight: 1,
                  textAlign: "center",
                  color: "#000",
                }}
              >
                {data}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Pré-visualização na tela */}
      <Card className="print:hidden">
        <CardHeader>
          <CardTitle>Pré-visualização (A4 paisagem)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto bg-muted/20 p-2 flex justify-center">
            <div
              className="bg-white shadow-sm"
              style={{
                width: "297mm",
                height: "209mm",
                padding: "12.7mm",
                boxSizing: "border-box",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  border: "1.5pt solid #000",
                  boxSizing: "border-box",
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-evenly",
                  alignItems: "center",
                  padding: "10mm 5mm",
                  overflow: "hidden",
                }}
              >
                {/* Logo no canto superior direito */}
                <div style={{ position: "absolute", top: "4mm", right: "6mm", zIndex: 10 }}>
                  <img
                    src="/logo-39anos.png"
                    alt="35/39 Anos B&Q"
                    style={{ width: "77mm", height: "33mm", objectFit: "contain" }}
                  />
                </div>

                {/* Textos com zIndex para garantir prioridade visual */}
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-evenly", alignItems: "center", width: "100%", height: "100%", zIndex: 20, position: "relative" }}>
                  <h1
                    style={{
                      fontFamily: "Calibri, Arial, sans-serif",
                      fontSize: "72pt",
                      fontWeight: "bold",
                      margin: 0,
                      lineHeight: 1,
                      textAlign: "center",
                      color: "#000",
                    }}
                  >
                    {linha1}
                  </h1>

                  <h2
                    style={{
                      fontFamily: "Calibri, Arial, sans-serif",
                      fontSize: "72pt",
                      fontWeight: "bold",
                      margin: 0,
                      lineHeight: 1,
                      textAlign: "center",
                      color: "#000",
                    }}
                  >
                    {linha2}
                  </h2>

                  <p
                    style={{
                      fontFamily: "Calibri, Arial, sans-serif",
                      fontSize: "72pt",
                      fontWeight: "bold",
                      margin: 0,
                      lineHeight: 1,
                      textAlign: "center",
                      color: "#000",
                    }}
                  >
                    {data}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}