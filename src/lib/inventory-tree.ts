interface FlatLocation {
  id: string;
  name: string;
  parentId: string | null;
  position: number;
}

export interface TreeStock {
  id: string;
  quantity: number;
  position: number;
  notes: string | null;
  needsReview: boolean;
  material: { code: string; name: string; unit: string };
}

export interface LocationNode {
  id: string;
  name: string;
  position: number;
  children: LocationNode[];
  stocks: TreeStock[];
}

interface StockRow extends Omit<TreeStock, "material"> {
  locationId: string;
  material: TreeStock["material"];
}

/** Breadcrumb path (root to leaf names) for every location id. */
export function breadcrumbMap(locations: FlatLocation[]): Map<string, string[]> {
  const byId = new Map(locations.map((l) => [l.id, l]));
  const paths = new Map<string, string[]>();

  for (const location of locations) {
    const path: string[] = [];
    let current: FlatLocation | undefined = location;
    while (current) {
      path.unshift(current.name);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    paths.set(location.id, path);
  }

  return paths;
}

/** Nest flat locations into a tree, attaching each location's stocks. */
export function buildTree(
  locations: FlatLocation[],
  stocks: StockRow[],
): LocationNode[] {
  const nodes = new Map<string, LocationNode>(
    locations.map((l) => [
      l.id,
      { id: l.id, name: l.name, position: l.position, children: [], stocks: [] },
    ]),
  );

  const roots: LocationNode[] = [];
  for (const location of locations) {
    const node = nodes.get(location.id);
    if (!node) continue;
    const parent = location.parentId ? nodes.get(location.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  for (const stock of stocks) {
    nodes.get(stock.locationId)?.stocks.push({
      id: stock.id,
      quantity: stock.quantity,
      position: stock.position,
      notes: stock.notes,
      needsReview: stock.needsReview,
      material: stock.material,
    });
  }

  const byPosition = (a: { position: number }, b: { position: number }) =>
    a.position - b.position;
  for (const node of nodes.values()) {
    node.children.sort(byPosition);
    node.stocks.sort(byPosition);
  }
  roots.sort(byPosition);

  return roots;
}
