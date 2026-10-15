"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

/** Code 39 barcode (same `*code*` symbology as the spreadsheet labels). */
export function Barcode({ code, height = 44 }: { code: string; height?: number }) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (ref.current && code.trim() !== "") {
      try {
        JsBarcode(ref.current, code.trim(), {
          format: "CODE39",
          height,
          displayValue: true,
          fontSize: 13,
          margin: 2,
        });
      } catch {
        // Unsupported characters: leave the SVG empty, code still prints as text.
      }
    }
  }, [code, height]);

  if (code.trim() === "") return null;
  return <svg ref={ref} className="max-w-full" />;
}
