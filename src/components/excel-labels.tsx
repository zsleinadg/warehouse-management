"use client";

import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import "@fontsource/libre-barcode-39-extended-text/latin-400.css";

export interface LabelItem {
  name: string;
  unit: string;
}

export const BARCODE_FONT = '"Libre Barcode 39 Extended Text", monospace';
const ARIAL = 'Arial, "Liberation Sans", Helvetica, sans-serif';

const colMm = (w: number): number => (w * 7 * 25.4) / 96;

const THICK = "2.25pt solid #000";
const NA = "#N/A";

export const LABEL_PRINT = {
  largeScale: 0.74,
  smallTopOffsetMm: 5,
  logoFit: "fill" as "fill" | "contain",
};

/* ------------------------------------------------------------------ */
/* ETIQUETA PEQUENA                                                   */
/* ------------------------------------------------------------------ */

export const SMALL_PER_PAGE = 16;

const SMALL_COLS = [
  { a: 25.6640625, b: 4.5546875 },
  { a: 25.88671875, b: 4.44140625 },
  { a: 25.88671875, b: 3.77734375 },
  { a: 25.88671875, b: 3.77734375 },
];
const SMALL_COL_GAP = 4.109375;
const SMALL_ROWS_PT = [31.2, 41.4, 51.6];
const SMALL_ROW_GAP_PT = 14.4;

const cell = (extra: CSSProperties): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  boxSizing: "border-box",
  fontFamily: ARIAL,
  fontWeight: 700,
  color: "#000",
  ...extra,
});

export function SmallLabel({
  code,
  item,
  col,
}: {
  code: string;
  item: LabelItem | null;
  col: number;
}) {
  const { a, b } = SMALL_COLS[col % 4];
  const hasCode = code.trim() !== "";
  const name = item?.name ?? (hasCode ? NA : "");
  const unit = item?.unit ?? (hasCode ? NA : "");

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `${colMm(a)}mm ${colMm(b)}mm`,
        gridTemplateRows: SMALL_ROWS_PT.map((h) => `${h}pt`).join(" "),
        border: THICK,
        boxSizing: "border-box",
        background: "#fff",
        width: `${colMm(a + b)}mm`,
        height: `${SMALL_ROWS_PT.reduce((s, n) => s + n, 0)}pt`,
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
      }}
    >
      <div style={cell({ fontSize: "20pt", lineHeight: 1.1 })}>{code}</div>
      <div style={cell({ fontSize: "8pt", lineHeight: 1.15 })}>
        <span>
          Und.
          <br />
          Med
        </span>
      </div>

      <div
        style={cell({
          fontSize: "10pt",
          lineHeight: 1.1,
          padding: "0 2px",
          overflow: "hidden",
          wordBreak: "break-word",
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
        })}
      >
        <span>{name}</span>
      </div>
      <div style={cell({ fontSize: "9pt", whiteSpace: "nowrap" })}>{unit}</div>

      <div
        style={{
          gridColumn: "1 / 3",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: BARCODE_FONT,
          fontSize: "36pt",
          lineHeight: 1,
          fontWeight: 400,
          whiteSpace: "nowrap",
          overflow: "hidden",
          color: "#000",
        }}
      >
        {hasCode ? `*${code.trim()}*` : ""}
      </div>
    </div>
  );
}

export function SmallSheet({
  labels,
}: {
  labels: { key: number | string; code: string; item: LabelItem | null }[];
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: SMALL_COLS.map((c) => `${colMm(c.a + c.b)}mm`).join(" "),
        columnGap: `${colMm(SMALL_COL_GAP)}mm`,
        rowGap: `${SMALL_ROW_GAP_PT}pt`,
        width: "fit-content",
      }}
    >
      {labels.map((l, i) => (
        <SmallLabel key={l.key} code={l.code} item={l.item} col={i % 4} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ETIQUETA GRANDE                                                    */
/* ------------------------------------------------------------------ */

const K = LABEL_PRINT.largeScale;
const LCOL_MM = colMm(13) * K;
const lpt = (n: number): string => `${(n * K).toFixed(3)}pt`;

const L_ROWS = {
  header: 80.4,
  descTitle: 79.8,
  desc: 145.8,
  barcode: 199.2,
  pallet: 186,
};

const lcell = (
  col: string,
  row: number,
  extra: CSSProperties,
): CSSProperties => ({
  gridColumn: col,
  gridRow: row,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  boxSizing: "border-box",
  fontFamily: ARIAL,
  fontWeight: 700,
  color: "#000",
  position: "relative",
  ...extra,
});

export function formatMeters(n: number): string {
  return String(Number(n.toFixed(2))).replace(".", ",");
}

export function LargeLabel({
  code,
  item,
  pallet,
  cuts,
  total,
}: {
  code: string;
  item: LabelItem | null;
  pallet: boolean;
  cuts: number[];
  total: number;
}): ReactNode {
  const showPallet = pallet && cuts.length > 0;
  const rows = [L_ROWS.header, L_ROWS.descTitle, L_ROWS.desc, L_ROWS.barcode];
  if (showPallet) rows.push(L_ROWS.pallet);
  const name = item?.name ?? (code.trim() !== "" ? NA : "");
  const unit = item?.unit ?? (code.trim() !== "" ? NA : "");

  const PX = 25.4 / 96;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(15, ${LCOL_MM}mm)`,
        gridTemplateRows: rows.map((h) => lpt(h)).join(" "),
        width: `${LCOL_MM * 15}mm`,
        background: "#fff",
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
      }}
    >
      {/* Linha 1–6 ------------------------------------------------ */}
      <div
        style={lcell("1 / 4", 1, {
          fontSize: lpt(26),
          lineHeight: 1.15,
          borderLeft: THICK,
          borderTop: THICK,
        })}
      >
        <span>MATERIAL ENEL</span>
      </div>
      <div
        style={lcell("4 / 7", 1, {
          fontSize: lpt(48),
          justifyContent: "flex-end",
          paddingRight: "2px",
          borderLeft: THICK,
          borderTop: THICK,
        })}
      >
        CÓD:
      </div>
      <div
        style={lcell("7 / 13", 1, {
          fontSize: lpt(72),
          borderLeft: THICK,
          borderTop: THICK,
        })}
      >
        {code}
      </div>
      <div
        style={lcell("13 / 16", 1, {
          borderLeft: THICK,
          borderRight: THICK,
          borderTop: THICK,
        })}
      >
        <div
          style={{
            position: "absolute",
            left: `${16 * PX * K}mm`,
            top: `${16 * PX * K}mm`,
            width: `${216 * PX * K}mm`,
            height: `${82.4 * PX * K}mm`,
          }}
        >
          <Image
            src="/logo-39anos.png"
            alt="39 Anos B&Q"
            fill
            unoptimized
            style={{ objectFit: LABEL_PRINT.logoFit === "fill" ? "fill" : "contain" }}
          />
        </div>
      </div>

      {/* Linha 7–12 ------------------------------------------------ */}
      <div
        style={lcell("1 / 13", 2, {
          fontSize: lpt(65),
          borderLeft: THICK,
          borderRight: THICK,
          borderTop: THICK,
        })}
      >
        DESCRIÇÃO:
      </div>
      <div
        style={lcell("13 / 16", 2, {
          fontSize: lpt(26),
          borderRight: THICK,
          borderTop: THICK,
        })}
      >
        UND.MED
      </div>

      {/* Linha 13–23 ----------------------------------------------- */}
      <div
        style={lcell("1 / 13", 3, {
          fontSize: lpt(37),
          lineHeight: 1.2,
          padding: "0 4px",
          wordBreak: "break-word",
          borderLeft: THICK,
          borderRight: THICK,
          borderTop: THICK,
        })}
      >
        <span>{name}</span>
      </div>
      <div
        style={lcell("13 / 16", 3, {
          fontSize: lpt(68),
          fontWeight: 400,
          borderRight: THICK,
          borderTop: THICK,
        })}
      >
        {unit}
      </div>

      {/* Linha 24–38 ----------------------------------------------- */}
      <div
        style={{
          gridColumn: "1 / 16",
          gridRow: 4,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxSizing: "border-box",
          borderLeft: THICK,
          borderRight: THICK,
          borderTop: THICK,
          borderBottom: showPallet ? "none" : THICK,
          fontFamily: BARCODE_FONT,
          fontSize: lpt(120),
          lineHeight: 1,
          fontWeight: 400,
          whiteSpace: "nowrap",
          color: "#000",
        }}
      >
        {code.trim() !== "" ? `*${code.trim()}*` : ""}
      </div>

      {/* Linha 39–46 (só em palete) -------------------------------- */}
      {showPallet && (
        <div
          style={{
            gridColumn: "1 / 16",
            gridRow: 5,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            boxSizing: "border-box",
            border: THICK,
            fontFamily: ARIAL,
            fontWeight: 700,
            fontSize: lpt(30),
            lineHeight: 1.15,
            padding: "0 2px",
            whiteSpace: "pre-wrap",
            color: "#000",
          }}
        >
          {`ESCOLTAS DE: ${cuts.map(formatMeters).join("; ")}\n\nTOTAL DE: ${formatMeters(total)}M`}
        </div>
      )}
    </div>
  );
}