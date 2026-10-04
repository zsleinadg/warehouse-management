/** Shared API error-shape helpers for client components. */

export async function safeJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function apiErrorMessage(body: unknown, fallback: string): string {
  if (
    body &&
    typeof body === "object" &&
    "errors" in body &&
    Array.isArray(body.errors) &&
    body.errors.length > 0 &&
    typeof body.errors[0]?.message === "string"
  ) {
    return body.errors[0].message;
  }
  return fallback;
}

export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
