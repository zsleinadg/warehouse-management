/** Shapes returned by /api/locations/tree and /api/search. */

export interface TreeMaterial {
  id: string;
  code: string;
  name: string;
  unit: string;
}

export interface TreeStock {
  id: string;
  quantity: number;
  position: number;
  notes: string | null;
  needsReview: boolean;
  material: TreeMaterial;
}

export interface TreeNode {
  id: string;
  name: string;
  position: number;
  children: TreeNode[];
  stocks: TreeStock[];
}

export interface SearchLocation {
  locationId: string;
  path: string[];
  quantity: number;
  position: number;
  needsReview: boolean;
}

export interface SearchResult {
  code: string;
  name: string;
  unit: string;
  minStock: number;
  totalQuantity: number;
  locations: SearchLocation[];
}

/** Find the id path from a root to the given location id. */
export function findIdPath(nodes: TreeNode[], targetId: string): string[] | null {
  for (const node of nodes) {
    if (node.id === targetId) return [node.id];
    const childPath = findIdPath(node.children, targetId);
    if (childPath) return [node.id, ...childPath];
  }
  return null;
}

/** Find the display path (names) from a root to the given location id. */
export function findNamePath(nodes: TreeNode[], targetId: string): string[] | null {
  for (const node of nodes) {
    if (node.id === targetId) return [node.name];
    const childPath = findNamePath(node.children, targetId);
    if (childPath) return [node.name, ...childPath];
  }
  return null;
}

export function findNode(nodes: TreeNode[], targetId: string): TreeNode | null {
  for (const node of nodes) {
    if (node.id === targetId) return node;
    const found = findNode(node.children, targetId);
    if (found) return found;
  }
  return null;
}
