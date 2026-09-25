// Extracts a human-readable message from a DRF-style API error.
// Mirrors frontend/src/utils/errorMessage.js exactly.

export const extractErrorMessage = (
  error: unknown,
  fallback = 'Something went wrong',
): string => {
  if (!error || typeof error !== 'object') return fallback;

  const err = error as {
    response?: { data?: unknown };
    message?: string;
  };

  const data = err?.response?.data;
  if (!data) return err?.message ?? fallback;

  if (typeof data === 'string') return data;

  const d = data as Record<string, unknown>;

  if (d.detail) {
    return Array.isArray(d.detail) ? String(d.detail[0]) : String(d.detail);
  }

  const firstKey = Object.keys(d)[0];
  if (firstKey) {
    const val = d[firstKey];
    return Array.isArray(val) ? String(val[0]) : String(val);
  }

  return fallback;
};
