// Profile values may be native arrays, JSON text, or PostgreSQL array literals.
// Return null for malformed/truncated data rather than inventing missing tokens.
export function parseProfileArray(value: unknown): string[] | null {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value.every((item) => typeof item === 'string') ? value : null;
  }
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (text.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(text);
      return Array.isArray(parsed) ? parseProfileArray(parsed) : null;
    } catch {
      return null;
    }
  }
  if (!text.startsWith('{') || !text.endsWith('}')) return null;
  const body = text.slice(1, -1).trim();
  if (!body) return [];
  const tokens = body.split(',').map((item) => item.trim());
  if (!tokens.every((item) => /^(?:[A-Z0-9_:-]+|"[A-Z0-9_:-]+")$/.test(item))) {
    return null;
  }
  return tokens.map((item) => item.replace(/^"|"$/g, ''));
}
