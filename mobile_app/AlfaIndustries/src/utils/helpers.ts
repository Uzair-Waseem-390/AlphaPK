// Date helpers — mirrors frontend/src/utils/helpers.js exactly.
// Always use local getters (not toISOString) to avoid the UTC-midnight
// bug in UTC+ timezones like Pakistan (PKT, UTC+5).

export const toLocalDateString = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const todayLocalDate = (): string => toLocalDateString(new Date());

export const daysFromTodayLocalDate = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toLocalDateString(d);
};

export const currentMonthLocal = (): string => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

// Credit score tier → semantic color token key
export const creditScoreTierColor = (
  tier: string | undefined,
): 'success' | 'warning' | 'error' | 'neutral' => {
  if (tier === 'good') return 'success';
  if (tier === 'average') return 'warning';
  if (tier === 'poor') return 'error';
  return 'neutral';
};

// Format a number as Pakistani Rupee amount
export const formatCurrency = (
  amount: number | null | undefined,
  decimals = 2,
): string => {
  if (amount == null) return '—';
  return `Rs ${Number(amount).toLocaleString('en-PK', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
};

// Strip undefined/null from an object before sending as query params
export const cleanParams = (
  obj: Record<string, unknown>,
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(obj)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => [k, String(v)]),
  );
