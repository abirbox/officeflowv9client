// Shared helpers + hooks for dispatch pages
import { useEffect, useState } from 'react';
import { api } from '@/lib/axios';

export function useList(url, params = {}) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let dead = false;
    setLoading(true);
    api.get(url, { params }).then(({ data }) => {
      if (!dead) setData(Array.isArray(data) ? data : data.items || []);
    }).catch(() => !dead && setData([]))
      .finally(() => !dead && setLoading(false));
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, JSON.stringify(params), reload]);
  return { data, loading, refetch: () => setReload((x) => x + 1) };
}

export const STATUS_BADGE = {
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  inactive: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  suspended: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  terminated: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  on_leave: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
};

export const CONFIRM_BADGE = {
  Confirmed:      'bg-emerald-700 text-emerald-50 border-emerald-800 dark:bg-emerald-600 dark:text-emerald-50 dark:border-emerald-500',
  Pending:        'bg-amber-700 text-amber-50 border-amber-800 dark:bg-amber-600 dark:text-amber-50 dark:border-amber-500',
  Declined:       'bg-rose-700 text-rose-50 border-rose-800 dark:bg-rose-600 dark:text-rose-50 dark:border-rose-500',
  'No Response':  'bg-violet-700 text-violet-50 border-violet-800 dark:bg-violet-600 dark:text-violet-50 dark:border-violet-500',
  'Not Confirmed':'bg-slate-700 text-slate-50 border-slate-800 dark:bg-slate-600 dark:text-slate-50 dark:border-slate-500',
};


/**
 * Uniform post-pin display: "VENDOR_CODE # PIN". Falls back to "# PIN" when
 * the vendor has no code, or to null when there is no pin at all. Prefers
 * the server-supplied `post_pin_display` when present so the same string
 * used by CSV/PDF exports appears on-screen.
 */
export function formatPin(row) {
  if (!row) return null;
  if (row.post_pin_display) return row.post_pin_display;
  const pin = row.post_pin;
  if (!pin) return null;
  const code = (row.vendor_code || '').trim();
  return code ? `${code} # ${pin}` : `# ${pin}`;
}
