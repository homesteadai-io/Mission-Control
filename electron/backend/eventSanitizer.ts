export type SanitizedDetail = Record<string, string | number | boolean | null>;

export function sanitizeDetail(detail: Record<string, unknown> | undefined) {
  if (!detail) return undefined;

  return Object.fromEntries(
    Object.entries(detail)
      .filter(([key]) => !/key|secret|token|authorization/i.test(key))
      .map(([key, value]) => [key, sanitizeValue(value)])
  ) as SanitizedDetail;
}

function sanitizeValue(value: unknown): string | number | boolean | null {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return null;
}
