export interface FlatLocationLike {
  id: string;
  name: string;
  parentId: string | null;
  disabled: boolean;
}

export interface LocationOptionItem {
  value: string;
  label: string;
}

interface BuildOptions {
  /** Only locations with no active children. */
  leavesOnly?: boolean;
  /** Hide one location (e.g. transfer source). */
  excludeId?: string | null;
  /** Hide a location and its whole subtree (e.g. reparent select). */
  excludeSubtreeOf?: string | null;
}

/**
 * Location options labeled by full path ("P1 → Direita → Nível 1") in tree
 * order, so homonyms under different parents stay distinguishable.
 */
export function buildLocationOptions(
  locations: FlatLocationLike[],
  options: BuildOptions = {},
): LocationOptionItem[] {
  const { leavesOnly = false, excludeId = null, excludeSubtreeOf = null } = options;
  const byId = new Map(locations.map((l) => [l.id, l]));
  const active = locations.filter((l) => !l.disabled);

  const childParentIds = new Set(
    active.filter((l) => l.parentId).map((l) => l.parentId as string),
  );

  const excluded = new Set<string>();
  if (excludeId) excluded.add(excludeId);
  if (excludeSubtreeOf) {
    const stack: (string | null)[] = [excludeSubtreeOf];
    while (stack.length > 0) {
      const current = stack.pop() as string;
      if (!current || excluded.has(current)) continue;
      excluded.add(current);
      for (const loc of active) {
        if (loc.parentId === current) stack.push(loc.id);
      }
    }
  }

  function pathOf(id: string): string[] {
    const names: string[] = [];
    const guard = new Set<string>();
    let current = byId.get(id);
    while (current && !guard.has(current.id)) {
      guard.add(current.id);
      names.unshift(current.name);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return names.length > 0 ? names : [byId.get(id)?.name ?? id];
  }

  const eligible = active.filter((l) => {
    if (excluded.has(l.id)) return false;
    if (leavesOnly && childParentIds.has(l.id)) return false;
    return true;
  });
  const eligibleIds = new Set(eligible.map((l) => l.id));

  const childrenOf = (parentId: string | null): FlatLocationLike[] =>
    eligible
      .filter((l) => {
        const pid = l.parentId ?? null;
        if (pid !== parentId) return false;
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  const out: LocationOptionItem[] = [];
  // Roots: no parent, or parent missing/hidden (keeps orphans reachable).
  const roots = eligible.filter((l) => {
    const pid = l.parentId ?? null;
    return pid === null || !eligibleIds.has(pid);
  }).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  function walk(parentId: string | null): void {
    const kids = parentId === null ? roots : childrenOf(parentId);
    for (const kid of kids) {
      out.push({ value: kid.id, label: pathOf(kid.id).join(" → ") });
      walk(kid.id);
    }
  }
  walk(null);
  return out;
}
