"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

interface LocationNode {
  id: string;
  name: string;
  position: number;
  children: LocationNode[];
  stocks: {
    id: string;
    quantity: number;
    material: { code: string; name: string; unit: string; disabled: boolean };
  }[];
}

async function fetchTree(): Promise<LocationNode[]> {
  const response = await fetch("/api/locations/tree");
  if (!response.ok) throw new Error("Failed to load locations");
  const body = await response.json();
  return body.data ?? [];
}

interface Rect { x: number; y: number; w: number; h: number; id: string; name: string; occupancy: number; capacity: number; stocks: LocationNode["stocks"]; children: Rect[]; }

function layoutTree(nodes: LocationNode[], x = 40, y = 40, level = 0): Rect[] {
  const rects: Rect[] = [];
  let currentY = y;
  for (const node of nodes) {
    const stocks = node.stocks.filter((s) => s.material && !s.material.disabled);
    const totalQty = stocks.reduce((sum, s) => sum + s.quantity, 0);
    const capacity = Math.max(10, totalQty * 1.5);
    const rect: Rect = {
      x,
      y: currentY,
      w: 180,
      h: Math.max(60, 40 + stocks.length * 18),
      id: node.id,
      name: node.name,
      occupancy: totalQty,
      capacity,
      stocks,
      children: layoutTree(node.children, x + 200, y, level + 1),
    };
    rects.push(rect);
    currentY = rect.y + rect.h + 20;
  }
  return rects;
}

function drawRect(ctx: CanvasRenderingContext2D, rect: Rect, hovered: boolean): void {
  const fill = hovered ? "#e0f2fe" : "#f8fafc";
  const stroke = hovered ? "#0284c7" : "#cbd5e1";
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = hovered ? 2 : 1;
  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 6);
  ctx.fill();
  ctx.stroke();

  // occupancy bar
  const barH = 8;
  const barY = rect.y + rect.h - barH - 4;
  const barW = rect.w - 8;
  const pct = Math.min(1, rect.occupancy / rect.capacity);
  ctx.fillStyle = "#e2e8f0";
  ctx.fillRect(rect.x + 4, barY, barW, barH);
  ctx.fillStyle = pct > 0.8 ? "#ef4444" : pct > 0.5 ? "#f59e0b" : "#22c55e";
  ctx.fillRect(rect.x + 4, barY, barW * pct, barH);

  // name
  ctx.fillStyle = "#1e293b";
  ctx.font = "bold 12px Inter, system-ui";
  ctx.fillText(rect.name, rect.x + 6, rect.y + 18);

  // occupancy text
  ctx.fillStyle = "#64748b";
  ctx.font = "11px Inter, system-ui";
  ctx.fillText(`${rect.occupancy} / ${rect.capacity}`, rect.x + 6, rect.y + 34);

  // items
  let itemY = rect.y + 46;
  for (const stock of rect.stocks.slice(0, 3)) {
    if (itemY > rect.y + rect.h - 16) break;
    ctx.fillStyle = "#334155";
    ctx.font = "10px Inter, system-ui";
    ctx.fillText(`${stock.material.code} ×${stock.quantity}`, rect.x + 8, itemY);
    itemY += 14;
  }
  if (rect.stocks.length > 3) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "10px Inter, system-ui";
    ctx.fillText(`+${rect.stocks.length - 3} mais…`, rect.x + 8, itemY);
  }
}

export default function IsometricView() {
  const { data: tree = [], isLoading } = useQuery({ queryKey: ["tree"], queryFn: fetchTree });
  const rects = useMemo(() => layoutTree(tree), [tree]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>): void {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.nativeEvent.clientX - rect.left;
    const y = e.nativeEvent.clientY - rect.top;
    let hit: string | null = null;
    function check(list: Rect[]): void {
      for (const r of list) {
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
          hit = r.id;
        }
        check(r.children);
      }
    }
    check(rects);
    setHoveredId(hit);
  }

  function handleMouseLeave(): void {
    setHoveredId(null);
  }

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const totalWidth = useMemo(() => Math.max(800, 40 + 220 * (Math.max(...rects.map((r) => r.x)) / 220 + 1)), [rects]);
  const totalHeight = useMemo(() => Math.max(600, 40 + Math.max(...rects.map((r) => r.y + r.h)) + 40), [rects]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function draw(list: Rect[]): void {
      for (const r of list) {
        drawRect(ctx as CanvasRenderingContext2D, r, hoveredId === r.id);
        draw(r.children);
      }
    }
    ctx.clearRect(0, 0, totalWidth, totalHeight);
    draw(rects);
  }, [rects, hoveredId, totalWidth, totalHeight]);

  if (isLoading) return <p className="text-zinc-500">Carregando mapa…</p>;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-900">
      <canvas
        ref={canvasRef}
        width={totalWidth}
        height={totalHeight}
        style={{ width: "100%", height: "auto", maxWidth: "100%", display: "block" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="block"
      />
      <p className="mt-2 text-xs text-zinc-500">Passe o mouse sobre um local para destacar. Verde = ok, Amarelo = atenção, Vermelho = crítico.</p>
    </div>
  );
}