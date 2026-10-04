"use client";

import type { TreeNode } from "@/lib/warehouse";

interface LocationTreeProps {
  nodes: TreeNode[];
  expanded: Set<string>;
  selectedId: string | null;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
}

export default function LocationTree({
  nodes,
  expanded,
  selectedId,
  onToggle,
  onSelect,
}: LocationTreeProps) {
  return (
    <div>
      {nodes.map((node) => (
        <TreeRow
          key={node.id}
          node={node}
          depth={0}
          expanded={expanded}
          selectedId={selectedId}
          onToggle={onToggle}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function TreeRow({
  node,
  depth,
  expanded,
  selectedId,
  onToggle,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  selectedId: string | null;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.id);
  const isSelected = node.id === selectedId;
  const reviewCount = node.stocks.filter((s) => s.needsReview).length;

  return (
    <div>
      <div
        role="treeitem"
        aria-expanded={hasChildren ? isOpen : undefined}
        aria-selected={isSelected}
         onClick={() => {
           if (hasChildren) onToggle(node.id);
           onSelect(node.id);
         }}
        style={{ marginLeft: depth * 10 }}
        className={`flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] hover:bg-sky-100 dark:hover:bg-sky-950 ${
          isSelected
            ? "border border-sky-400 bg-sky-100 font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-300"
            : "border border-transparent"
        }`}
      >
        <span className="inline-block w-2.5 text-[10px] text-zinc-500">
          {hasChildren ? (isOpen ? "▾" : "▸") : ""}
        </span>
        <span>{node.name}</span>
        {reviewCount > 0 && (
          <span
            title={`${reviewCount} item(ns) pendente(s) de auditoria`}
            className="rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900 dark:text-amber-200"
          >
            {reviewCount}
          </span>
        )}
      </div>
      {hasChildren && isOpen && (
        <div role="group">
          {node.children.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              selectedId={selectedId}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
