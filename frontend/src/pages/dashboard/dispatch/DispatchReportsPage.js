import { useEffect, useState, useCallback } from 'react';
import { api, formatApiErrorDetail } from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/components/ui/sonner';
import { Download, FileText, FileSpreadsheet, ChevronRight, Trash2, Plus, X } from 'lucide-react';
import useAuthStore from '@/stores/authStore';
import { hasPermission } from '@/lib/permissions';
import { formatPin } from './_shared';

const isoToday = () => new Date().toISOString().slice(0, 10);
const isoDaysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

const REPORT_TABS = [
  { key: 'schedules', label: 'Schedules', endpoint: '/dispatch/reports/schedules',
    columns: [
      { key: 'date', label: 'Date' }, { key: 'officer_name', label: 'Officer' },
      { key: 'post_pin_display', label: 'Post Pin' }, { key: 'post_site_name', label: 'Post Site' },
      { key: 'client_name', label: 'Client' }, { key: 'vendor_name', label: 'Vendor' },
      { key: 'shift_type', label: 'Shift' }, { key: 'start_time', label: 'Start' }, { key: 'end_time', label: 'End' },
      { key: 'duty_hours', label: 'Hours' }, { key: 'completed_hours', label: 'Paid Hrs' },
      { key: 'confirmation_status', label: 'Confirmation' },
      { key: 'shift_status', label: 'Status' },
    ],
    financialColumns: [{ key: 'duty_rate', label: 'Duty Rate' }, { key: 'cost_amount', label: 'Payout' }, { key: 'billing_rate', label: 'Billing' }, { key: 'work_order_number', label: 'W.O.' }] },
  { key: 'by-officer', label: 'By Officer', endpoint: '/dispatch/reports/by-officer',
    columns: [
      { key: 'officer_name', label: 'Officer' }, { key: 'total_shifts', label: 'Shifts' },
      { key: 'completed', label: 'Completed' },
      { key: 'total_hours', label: 'Paid Hrs' }, { key: 'attendance_pct', label: 'Attendance %' },
    ],
    financialColumns: [{ key: 'cost_amount', label: 'Payout' }, { key: 'billing_amount', label: 'Billing' }, { key: 'margin', label: 'Margin' }] },
  { key: 'by-post-site', label: 'By Post Site', endpoint: '/dispatch/reports/by-post-site',
    columns: [
      { key: 'post_pin_display', label: 'Post Pin' }, { key: 'post_site_name', label: 'Post Site' },
      { key: 'required_officers', label: 'Required' }, { key: 'total_shifts', label: 'Shifts' },
      { key: 'completed', label: 'Completed' },
      { key: 'total_hours', label: 'Paid Hrs' },
      { key: 'coverage_pct', label: 'Coverage %' },
    ],
    financialColumns: [{ key: 'cost_amount', label: 'Payout' }, { key: 'billing_amount', label: 'Billing' }, { key: 'margin', label: 'Margin' }] },
  { key: 'by-client', label: 'By Client', endpoint: '/dispatch/reports/by-client',
    columns: [
      { key: 'client_name', label: 'Client' }, { key: 'total_shifts', label: 'Shifts' },
      { key: 'completed', label: 'Completed' },
      { key: 'total_hours', label: 'Paid Hrs' },
    ],
    financialColumns: [{ key: 'cost_amount', label: 'Payout' }, { key: 'billing_amount', label: 'Billing' }, { key: 'margin', label: 'Margin' }] },
  { key: 'by-vendor', label: 'By Vendor', endpoint: '/dispatch/reports/by-vendor',
    columns: [
      { key: 'vendor_name', label: 'Vendor' }, { key: 'total_shifts', label: 'Shifts' },
      { key: 'completed', label: 'Completed' },
      { key: 'total_hours', label: 'Paid Hrs' },
    ],
    financialColumns: [{ key: 'cost_amount', label: 'Payout' }, { key: 'billing_amount', label: 'Billing' }, { key: 'margin', label: 'Margin' }] },
];

const SEARCH_PLACEHOLDER = {
  'schedules': 'Search officer, client, vendor, post pin…',
  'by-officer': 'Search officer name, email, phone…',
  'by-post-site': 'Search post pin, site name, address…',
  'by-client': 'Search client name or code…',
  'by-vendor': 'Search vendor name or code…',
};

const DispatchReportsPage = () => {
  const { user } = useAuthStore();
  const canView = hasPermission(user, 'dispatch.reports.view');
  const canExport = hasPermission(user, 'dispatch.reports.export');
  const canFinancial = hasPermission(user, 'dispatch.financial.view');
  const canDelete = hasPermission(user, 'dispatch.schedule.delete');

  const [active, setActive] = useState('schedules');
  const [dateFrom, setDateFrom] = useState(isoDaysAgo(30));
  const [dateTo, setDateTo] = useState(isoToday());
  const [limit, setLimit] = useState(50);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [data, setData] = useState({ items: [], count: 0 });
  const [loading, setLoading] = useState(false);

  // Debounce the search input so we do not slam the backend on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const cfg = REPORT_TABS.find((t) => t.key === active);

  // Map report tab key → entity_type for the drill-down detail dialog
  const ENTITY_TYPE_BY_TAB = { 'by-officer': 'officer', 'by-post-site': 'post_site', 'by-client': 'client', 'by-vendor': 'vendor' };
  const ENTITY_ID_KEY = { 'by-officer': 'officer_id', 'by-post-site': 'post_site_id', 'by-client': 'client_id', 'by-vendor': 'vendor_id' };
  const ENTITY_NAME_KEY = { 'by-officer': 'officer_name', 'by-post-site': 'post_site_name', 'by-client': 'client_name', 'by-vendor': 'vendor_name' };

  const [detail, setDetail] = useState(null); // { entity_type, entity_id, data }
  const [detailLoading, setDetailLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickedCols, setPickedCols] = useState([]);
  const [clientFilter, setClientFilter] = useState(''); // officer-only: filter shifts by client
  const [pendingDelete, setPendingDelete] = useState(null); // { id, date, officer_name, ... }
  const [deleting, setDeleting] = useState(false);
  const [payslipDialog, setPayslipDialog] = useState(false);

  const confirmDelete = async () => {
    if (!pendingDelete?.id) return;
    setDeleting(true);
    try {
      await api.delete(`/dispatch/schedules/${pendingDelete.id}`);
      toast.success('Dispatch report deleted');
      setPendingDelete(null);
      await load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  const fetchDetail = useCallback(async (entity_type, entity_id, cid) => {
    setDetailLoading(true);
    try {
      const params = { entity_type, entity_id, date_from: dateFrom, date_to: dateTo };
      if (cid) params.client_id = cid;
      const { data } = await api.get('/dispatch/reports/entity-detail', { params });
      setDetail((d) => ({ ...(d || { entity_type, entity_id }), data }));
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
    finally { setDetailLoading(false); }
  }, [dateFrom, dateTo]);

  const openDetail = async (row) => {
    const entity_type = ENTITY_TYPE_BY_TAB[active];
    const entity_id = row[ENTITY_ID_KEY[active]];
    if (!entity_type || !entity_id) return;
    setDetail({ entity_type, entity_id, entity_name: row[ENTITY_NAME_KEY[active]] });
    setClientFilter('');
    // Initialize picker with ALL allowed columns
    const allKeys = [...ENTITY_EXPORT_COLS.map(c => c.key), ...(canFinancial ? ENTITY_EXPORT_COLS_FIN.map(c => c.key) : [])];
    setPickedCols(allKeys);
    await fetchDetail(entity_type, entity_id, '');
  };

  // Re-fetch when the officer/client filter changes
  useEffect(() => {
    if (detail && detail.entity_type === 'officer') {
      fetchDetail(detail.entity_type, detail.entity_id, clientFilter);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientFilter]);

  const isOfficerPayslip = detail?.entity_type === 'officer' && detail?.data?.client_info;
  const paidHoursTotal = detail?.data?.summary?.total_duty_hours ?? 0;
  const actualHoursTotal = detail?.data?.summary?.total_actual_hours ?? 0;
  const totalAmount = detail?.data?.summary?.total_amount ?? 0;

  const MIME_BY_FMT = {
    csv: 'text/csv',
    pdf: 'application/pdf',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };

  const downloadEntityDetail = async (fmt, opts = {}) => {
    try {
      const params = {
        entity_type: detail.entity_type,
        entity_id: detail.entity_id,
        date_from: dateFrom,
        date_to: dateTo,
        format: fmt,
      };
      if (detail.entity_type === 'officer' && clientFilter) params.client_id = clientFilter;
      if (opts.template) params.template = opts.template;
      if (opts.columns) params.columns = opts.columns;
      const res = await api.get('/dispatch/reports/export/entity-detail', { params, responseType: 'blob' });
      const blob = new Blob([res.data], { type: MIME_BY_FMT[fmt] || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const label = opts.template === 'payslip' ? 'payslip' : detail.entity_type;
      a.download = `${label}-${detail.entity_name || detail.entity_id}-${dateFrom}-${dateTo}.${fmt}`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success(`${fmt === 'xlsx' ? 'Excel' : fmt.toUpperCase()} downloaded`);
    } catch (e) { toast.error('Export failed'); }
  };

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const params = { date_from: dateFrom, date_to: dateTo };
      if (active === 'schedules') params.limit = limit;
      if (debouncedQuery) params.q = debouncedQuery;
      const { data } = await api.get(cfg.endpoint, { params });
      setData(data);
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
    finally { setLoading(false); }
  }, [active, dateFrom, dateTo, limit, debouncedQuery, cfg.endpoint, canView]);

  useEffect(() => { load(); }, [load]);

  const download = async (format) => {
    try {
      const params = { type: active, format, date_from: dateFrom, date_to: dateTo };
      if (debouncedQuery) params.q = debouncedQuery;
      const res = await api.get('/dispatch/reports/export', { params, responseType: 'blob' });
      const blob = new Blob([res.data], { type: MIME_BY_FMT[format] || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `dispatch-${active}-${dateFrom}-${dateTo}.${format}`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success(`${format === 'xlsx' ? 'Excel' : format.toUpperCase()} downloaded`);
    } catch (e) {
      // blob errors need decoding
      try {
        const text = await e.response?.data?.text?.();
        const detail = text ? JSON.parse(text).detail : null;
        toast.error(detail || 'Export failed');
      } catch { toast.error('Export failed'); }
    }
  };

  if (!canView) return <div className="p-8 text-[#64748B]" data-testid="reports-no-access">You do not have permission to view Dispatch reports.</div>;

  const cols = [...cfg.columns, ...(canFinancial ? cfg.financialColumns : [])];

  return (
    <div className="space-y-6" data-testid="dispatch-reports-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-[#0F172A] dark:text-[#FAFAFA]">Dispatch Reports</h1>
          <p className="text-sm text-[#64748B] mt-1">
            {data.count} record{data.count !== 1 && 's'} · Financial data {canFinancial ? 'visible' : 'hidden'}
          </p>
        </div>
        {canExport && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => download('xlsx')} data-testid="export-excel">
              <FileSpreadsheet className="w-4 h-4 mr-2" /> Export Excel
            </Button>
            <Button variant="outline" size="sm" onClick={() => download('pdf')} data-testid="export-pdf">
              <FileText className="w-4 h-4 mr-2" /> Export PDF
            </Button>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A] rounded-xl p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="md:col-span-2">
          <Label className="text-xs">Search</Label>
          <div className="relative">
            <Input
              type="text"
              placeholder={SEARCH_PLACEHOLDER[active] || 'Search…'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pr-8"
              data-testid="rf-search"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#FAFAFA] text-lg leading-none"
                aria-label="Clear search"
                data-testid="rf-search-clear"
              >×</button>
            )}
          </div>
        </div>
        <div><Label className="text-xs">Date From</Label><Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} data-testid="rf-from" /></div>
        <div><Label className="text-xs">Date To</Label><Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} data-testid="rf-to" /></div>
        {active === 'schedules' && (
          <div><Label className="text-xs">Limit</Label>
            <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
              <SelectTrigger data-testid="rf-limit"><SelectValue /></SelectTrigger>
              <SelectContent>{[50, 100, 250, 500, 1000].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}
        <div className="md:col-span-4 flex items-center justify-between text-xs text-[#64748B]">
          <span>Paid hours = shifts once <b>Clocked In</b>. Payout = paid hours × officer duty rate.</span>
          <span>Max 3 months (92 days).</span>
        </div>
      </div>

      <Tabs value={active} onValueChange={setActive}>
        <TabsList className="grid grid-cols-5 max-w-2xl">
          {REPORT_TABS.map((t) => <TabsTrigger key={t.key} value={t.key} data-testid={`tab-${t.key}`}>{t.label}</TabsTrigger>)}
        </TabsList>
        {REPORT_TABS.map((t) => (
          <TabsContent key={t.key} value={t.key} className="mt-4">
            <div className="bg-white dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A] rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#F8FAFC] dark:bg-[#0F0F11] text-left text-xs uppercase tracking-wider text-[#64748B]">
                  <tr>
                    {cols.map((c) => <th key={c.key} className="px-3 py-3">{c.label}</th>)}
                    {t.key === 'schedules' && canDelete && <th className="px-3 py-3 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#27272A]">
                  {loading ? <tr><td colSpan={cols.length + (t.key === 'schedules' && canDelete ? 1 : 0)} className="px-4 py-8 text-center text-[#64748B]">Loading…</td></tr>
                  : (data.items || []).length === 0 ? <tr><td colSpan={cols.length + (t.key === 'schedules' && canDelete ? 1 : 0)} className="px-4 py-8 text-center text-[#64748B]">No data</td></tr>
                  : data.items.map((r, i) => {
                    const clickable = ENTITY_TYPE_BY_TAB[t.key];
                    return (
                    <tr
                      key={r.id || `${r.officer_id || r.client_id || r.vendor_id || r.post_site_id || i}`}
                      data-testid={`report-row-${i}`}
                      className={clickable ? 'hover:bg-[#F8FAFC] dark:hover:bg-[#0F0F11] cursor-pointer' : ''}
                      onClick={clickable ? () => openDetail(r) : undefined}
                    >
                      {cols.map((c, j) => (
                        <td key={c.key} className="px-3 py-2 text-[#334155] dark:text-[#E4E4E7]">
                          {j === 0 && clickable ? (
                            <span className="text-[#4F46E5] hover:underline font-medium inline-flex items-center gap-1">
                              {r[c.key] ?? '—'} <ChevronRight className="w-3 h-3" />
                            </span>
                          ) : (r[c.key] ?? '—')}
                        </td>
                      ))}
                      {t.key === 'schedules' && canDelete && (
                        <td className="px-3 py-2 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-[#DC2626] hover:text-[#B91C1C] hover:bg-rose-50 dark:hover:bg-rose-950/30 h-8 px-2"
                            onClick={(e) => { e.stopPropagation(); setPendingDelete(r); }}
                            data-testid={`delete-report-btn-${i}`}
                            aria-label="Delete dispatch report"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  );})}
                </tbody>
              </table>
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {/* Entity Detail Dialog — day-by-day breakdown */}
      <Dialog open={!!detail} onOpenChange={(o) => { if (!o) { setDetail(null); setPickerOpen(false); setClientFilter(''); } }}>
        <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto" data-testid="entity-detail-dialog">
          <DialogHeader>
            <DialogTitle>
              {detail?.entity_type === 'officer' ? 'Officer Payslip' : `${detail?.entity_type?.replace('_', ' ')} Detail`} — {detail?.entity_name}
            </DialogTitle>
            <DialogDescription>
              Full day-by-day breakdown between {dateFrom} and {dateTo}. Paid hours & totals count once officers are Clocked In.
            </DialogDescription>
          </DialogHeader>
          {detailLoading ? <p className="text-sm text-[#64748B]">Loading detail…</p>
            : detail?.data && (
              <div className="space-y-4">
                {/* Client filter — officers only */}
                {detail.entity_type === 'officer' && (detail.data.clients_available || []).length > 0 && (
                  <div className="flex flex-wrap items-center gap-3">
                    <Label className="text-xs">Client</Label>
                    <Select value={clientFilter || '__all__'} onValueChange={(v) => setClientFilter(v === '__all__' ? '' : v)}>
                      <SelectTrigger className="w-64" data-testid="detail-client-filter"><SelectValue placeholder="All clients" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">All clients</SelectItem>
                        {detail.data.clients_available.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-[#64748B]">Filter shifts by the client this officer worked for.</p>
                  </div>
                )}

                {/* Payslip-style header (officer + client selected) */}
                {isOfficerPayslip && (
                  <div className="rounded-xl border border-[#E2E8F0] dark:border-[#27272A] bg-white dark:bg-[#0F0F11] p-4" data-testid="payslip-header">
                    <div className="grid grid-cols-3 items-center gap-4">
                      <div className="flex items-start gap-3">
                        {detail.data.client_info.logo_url ? (
                          <img src={detail.data.client_info.logo_url} alt="client logo" className="w-16 h-16 object-contain rounded border border-[#E2E8F0] dark:border-[#27272A]" />
                        ) : (
                          <div className="w-16 h-16 rounded border border-dashed border-[#CBD5E1] flex items-center justify-center text-[10px] text-[#94A3B8]">Logo</div>
                        )}
                        <div className="space-y-1 text-xs">
                          <div><span className="text-[#64748B]">Security Officer's Name:</span> <span className="font-semibold text-[#0F172A] dark:text-[#FAFAFA]" data-testid="payslip-officer-name">{detail.entity_name}</span></div>
                          <div><span className="text-[#64748B]">Duty Periods:</span> <span className="font-semibold text-[#0F172A] dark:text-[#FAFAFA]">{dateFrom} to {dateTo}</span></div>
                        </div>
                      </div>
                      <div className="text-center">
                        <h2 className="text-xl md:text-2xl font-bold text-[#0F172A] dark:text-[#FAFAFA]" data-testid="payslip-client-name">{detail.data.client_info.name}</h2>
                        {detail.data.client_info.city && (
                          <p className="text-xs text-[#64748B]">{detail.data.client_info.city}</p>
                        )}
                      </div>
                      <div className="flex justify-end">
                        {canExport && (
                          <Button size="sm" onClick={() => setPayslipDialog(true)} data-testid="download-payslip-pdf">
                            <FileText className="w-4 h-4 mr-2" /> Customize & Download
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Summary tiles */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.entries(detail.data.summary || {}).map(([k, v]) => (
                    <div key={k} className="rounded-lg border border-[#E2E8F0] dark:border-[#27272A] p-3">
                      <p className="text-[10px] uppercase tracking-wider text-[#64748B]">{k.replace(/_/g, ' ')}</p>
                      <p className="text-lg font-bold text-[#0F172A] dark:text-[#FAFAFA]">{v}</p>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Shifts ({detail.data.count})</h3>
                  {canExport && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)} data-testid="detail-pick-columns">
                        <Download className="w-4 h-4 mr-2" /> Choose columns & export
                      </Button>
                    </div>
                  )}
                </div>

                {/* Payslip-style table when we can identify one client for the officer */}
                {isOfficerPayslip ? (
                  <div className="border border-[#E2E8F0] dark:border-[#27272A] rounded-lg overflow-x-auto">
                    <table className="w-full text-xs min-w-[1100px]" data-testid="payslip-table">
                      <thead className="bg-[#FBE4EA] text-[#0F172A] uppercase tracking-wider">
                        <tr>
                          <th className="px-2 py-2 text-left">Date</th>
                          <th className="px-2 py-2 text-left">Shift</th>
                          <th className="px-2 py-2 text-left">Start Time</th>
                          <th className="px-2 py-2 text-left">End Time</th>
                          <th className="px-2 py-2 text-right">Duty Hours</th>
                          {canFinancial && <th className="px-2 py-2 text-right">Hourly Rate</th>}
                          {canFinancial && <th className="px-2 py-2 text-right">Total</th>}
                          <th className="px-2 py-2 text-left">Post Site Name</th>
                          <th className="px-2 py-2 text-left">City</th>
                          <th className="px-2 py-2 text-left">Post Site Pin</th>
                          <th className="px-2 py-2 text-left">Remarks</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#27272A]">
                        {detail.data.items.map((r) => (
                          <tr key={r.id}>
                            <td className="px-2 py-2 bg-[#FBE4EA]/40 font-medium">{r.date}</td>
                            <td className="px-2 py-2">{r.shift_type || '—'}</td>
                            <td className="px-2 py-2 font-mono">{r.start_time || '—'}</td>
                            <td className="px-2 py-2 font-mono">{r.end_time || '—'}</td>
                            <td className="px-2 py-2 text-right">{r.duty_hours ?? '—'}</td>
                            {canFinancial && <td className="px-2 py-2 text-right">{r.hourly_rate != null ? `$${Number(r.hourly_rate).toFixed(2)}` : '—'}</td>}
                            {canFinancial && <td className="px-2 py-2 text-right font-semibold">{r.total != null ? `$${Number(r.total).toFixed(2)}` : '—'}</td>}
                            <td className="px-2 py-2">{r.post_site_name || '—'}</td>
                            <td className="px-2 py-2">{r.city || '—'}</td>
                            <td className="px-2 py-2 text-[#DC2626] font-semibold">{formatPin(r) || '—'}</td>
                            <td className="px-2 py-2 max-w-[220px] truncate" title={r.remarks || ''}>{r.remarks || '—'}</td>
                          </tr>
                        ))}
                        {detail.data.items.length === 0 && (
                          <tr><td colSpan={canFinancial ? 11 : 9} className="px-4 py-6 text-center text-[#64748B]">No shifts in this range</td></tr>
                        )}
                      </tbody>
                      {detail.data.items.length > 0 && (
                        <tfoot className="bg-[#F8FAFC] font-bold text-[#0F172A]" data-testid="payslip-totals">
                          <tr>
                            <td className="px-2 py-2" colSpan={4}>Totals</td>
                            <td className="px-2 py-2 text-right" data-testid="payslip-total-duty">{paidHoursTotal}</td>
                            {canFinancial && <td className="px-2 py-2" />}
                            {canFinancial && <td className="px-2 py-2 text-right" data-testid="payslip-total-amount">${Number(totalAmount).toFixed(2)}</td>}
                            <td className="px-2 py-2" colSpan={4} />
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                ) : (
                  <div className="border border-[#E2E8F0] dark:border-[#27272A] rounded-lg overflow-x-auto">
                    <table className="w-full text-xs min-w-[1200px]">
                      <thead className="bg-[#F8FAFC] dark:bg-[#0F0F11] uppercase tracking-wider text-[#64748B]">
                        <tr>
                          <th className="px-2 py-2 text-left">Date</th>
                          <th className="px-2 py-2 text-left">Shift</th>
                          <th className="px-2 py-2 text-left">Scheduled</th>
                          <th className="px-2 py-2 text-left">Clocked In</th>
                          <th className="px-2 py-2 text-left">Clocked Out</th>
                          <th className="px-2 py-2 text-left">Hours</th>
                          <th className="px-2 py-2 text-left">Post</th>
                          <th className="px-2 py-2 text-left">Officer</th>
                          <th className="px-2 py-2 text-left">Client / Vendor</th>
                          <th className="px-2 py-2 text-left">Confirmation</th>
                          <th className="px-2 py-2 text-left">Status</th>
                          <th className="px-2 py-2 text-left">Remarks</th>
                          {canFinancial && <>
                            <th className="px-2 py-2 text-left">Duty Rate</th>
                            <th className="px-2 py-2 text-left">Billing</th>
                            <th className="px-2 py-2 text-left">W.O.</th>
                          </>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#27272A]">
                        {detail.data.items.map((r) => (
                          <tr key={r.id}>
                            <td className="px-2 py-2">{r.date}</td>
                            <td className="px-2 py-2">{r.shift_type}</td>
                            <td className="px-2 py-2 font-mono">{r.start_time}–{r.end_time}</td>
                            <td className="px-2 py-2 font-mono">{r.actual_check_in || '—'}</td>
                            <td className="px-2 py-2 font-mono">{r.actual_check_out || '—'}</td>
                            <td className="px-2 py-2">{r.duty_hours}h</td>
                            <td className="px-2 py-2">{formatPin(r) || '—'} {r.post_site_name ? `— ${r.post_site_name}` : ''}</td>
                            <td className="px-2 py-2">{r.officer_name}</td>
                            <td className="px-2 py-2">{r.client_name} / {r.vendor_name}</td>
                            <td className="px-2 py-2">{r.confirmation_status}{r.confirmation_method ? ` (${r.confirmation_method})` : ''}</td>
                            <td className="px-2 py-2">{r.shift_status}</td>
                            <td className="px-2 py-2 max-w-[220px] truncate" title={r.remarks || ''}>{r.remarks || '—'}</td>
                            {canFinancial && <>
                              <td className="px-2 py-2">{r.duty_rate ?? '—'}</td>
                              <td className="px-2 py-2">{r.billing_rate ?? '—'}</td>
                              <td className="px-2 py-2">{r.work_order_number ?? '—'}</td>
                            </>}
                          </tr>
                        ))}
                        {detail.data.items.length === 0 && (
                          <tr><td colSpan={20} className="px-4 py-6 text-center text-[#64748B]">No shifts in this range</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
        </DialogContent>
      </Dialog>

      {/* Column Picker dialog — used for entity-detail export */}
      <ColumnPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        canFinancial={canFinancial}
        picked={pickedCols}
        onChange={setPickedCols}
        onExport={(fmt) => { downloadEntityDetail(fmt, { columns: pickedCols.join(',') || undefined }); setPickerOpen(false); }}
      />

      {/* Payslip customization dialog */}
      {payslipDialog && detail && isOfficerPayslip && (
        <PayslipCustomizeDialog
          open={payslipDialog}
          onClose={() => setPayslipDialog(false)}
          officerId={detail.entity_id}
          officerName={detail.entity_name}
          clientId={clientFilter}
          clientName={detail.data?.client_info?.name}
          dateFrom={dateFrom}
          dateTo={dateTo}
          subtotal={Number(detail.data?.summary?.total_amount || 0)}
          shifts={detail.data?.items || []}
        />
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={!!pendingDelete} onOpenChange={(o) => !o && !deleting && setPendingDelete(null)}>
        <DialogContent className="max-w-md" data-testid="delete-report-dialog">
          <DialogHeader>
            <DialogTitle>Delete this dispatch report?</DialogTitle>
            <DialogDescription>
              This permanently removes the schedule
              {pendingDelete?.date ? ` on ${pendingDelete.date}` : ''}
              {pendingDelete?.officer_name ? ` for ${pendingDelete.officer_name}` : ''}
              {pendingDelete?.post_site_name ? ` at ${pendingDelete.post_site_name}` : ''}.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPendingDelete(null)} disabled={deleting} data-testid="delete-report-cancel">
              Cancel
            </Button>
            <Button
              className="bg-[#DC2626] hover:bg-[#B91C1C] text-white"
              onClick={confirmDelete}
              disabled={deleting}
              data-testid="delete-report-confirm"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const ENTITY_EXPORT_COLS = [
  { key: 'date', label: 'Date' }, { key: 'shift_type', label: 'Shift' },
  { key: 'start_time', label: 'Scheduled Start' }, { key: 'end_time', label: 'Scheduled End' },
  { key: 'actual_check_in', label: 'Actual Check-In' }, { key: 'actual_check_out', label: 'Actual Check-Out' },
  { key: 'duty_hours', label: 'Hours' },
  { key: 'officer_name', label: 'Officer' },
  { key: 'post_pin_display', label: 'Post Pin' }, { key: 'post_site_name', label: 'Post Site' },
  { key: 'client_name', label: 'Client' }, { key: 'vendor_name', label: 'Vendor' },
  { key: 'confirmation_status', label: 'Confirmation' }, { key: 'confirmation_method', label: 'Method' },
  { key: 'shift_status', label: 'Shift Status' }, { key: 'remarks', label: 'Remarks' },
  { key: 'last_modified_by_name', label: 'Last Modified By' },
  { key: 'last_modified_action', label: 'Last Action' },
];
const ENTITY_EXPORT_COLS_FIN = [
  { key: 'duty_rate', label: 'Duty Rate' },
  { key: 'billing_rate', label: 'Billing Rate' },
  { key: 'work_order_number', label: 'Work Order' },
];

const PayslipCustomizeDialog = ({
  open, onClose,
  officerId, officerName,
  clientId, clientName,
  dateFrom, dateTo,
  subtotal, shifts,
}) => {
  const [extras, setExtras] = useState([]);
  const [advance, setAdvance] = useState('');
  const [prevBalance, setPrevBalance] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [loadingBalance, setLoadingBalance] = useState(false);

  // Load unused-advance carried from the last payslip
  useEffect(() => {
    if (!open || !officerId) return;
    let alive = true;
    setLoadingBalance(true);
    (async () => {
      try {
        const { data } = await api.get('/dispatch/reports/advance-balance', {
          params: { officer_id: officerId, client_id: clientId || undefined },
        });
        if (!alive) return;
        const bal = Number(data?.balance || 0);
        setPrevBalance(bal);
        if (bal > 0) setAdvance(String(bal));
      } catch { /* silent */ }
      finally { if (alive) setLoadingBalance(false); }
    })();
    return () => { alive = false; };
  }, [open, officerId, clientId]);

  const extrasTotal = extras.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const gross = subtotal + extrasTotal;
  const advanceNum = Math.max(0, Number(advance) || 0);
  const applied = Math.min(advanceNum, gross);
  const carryForward = Math.max(0, advanceNum - gross);
  const netPayable = Math.max(0, gross - applied);

  const addExtra = () => setExtras([...extras, { label: '', amount: '' }]);
  const removeExtra = (i) => setExtras(extras.filter((_, idx) => idx !== i));
  const updateExtra = (i, key, val) => {
    setExtras(extras.map((e, idx) => (idx === i ? { ...e, [key]: val } : e)));
  };

  const download = async () => {
    setDownloading(true);
    try {
      const payload = {
        entity_id: officerId,
        date_from: dateFrom, date_to: dateTo,
        client_id: clientId || null,
        advance_amount: advanceNum,
        extras: extras
          .filter((e) => (e.label || '').trim() || Number(e.amount) > 0)
          .map((e) => ({
            label: (e.label || 'Extra').trim() || 'Extra',
            amount: Number(e.amount) || 0,
          })),
        commit_carryforward: true,
      };
      const res = await api.post(
        '/dispatch/reports/export/entity-detail/payslip',
        payload,
        { responseType: 'blob' },
      );
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payslip-${officerName}-${dateFrom}-${dateTo}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success('Payslip downloaded');
      onClose();
    } catch (e) {
      toast.error('Failed to generate payslip');
    } finally { setDownloading(false); }
  };

  const money = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !downloading && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto" data-testid="payslip-customize-dialog">
        <DialogHeader>
          <DialogTitle>Customize payslip · {officerName}</DialogTitle>
          <DialogDescription>
            Review the shifts, add extras or an advance deduction, then download the PDF.
            {clientName ? ` Client: ${clientName}.` : ''}
          </DialogDescription>
        </DialogHeader>

        {/* Shifts review (read-only) */}
        <div className="border border-[#E2E8F0] dark:border-[#27272A] rounded-lg overflow-x-auto">
          <table className="w-full text-xs" data-testid="payslip-shifts-table">
            <thead className="bg-[#F8FAFC] dark:bg-[#0F0F11] text-[#64748B] uppercase tracking-wider">
              <tr>
                <th className="px-2 py-2 text-left">Date</th>
                <th className="px-2 py-2 text-left">Shift</th>
                <th className="px-2 py-2 text-right">Hours</th>
                <th className="px-2 py-2 text-right">Rate</th>
                <th className="px-2 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#27272A]">
              {shifts.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-4 text-center text-[#64748B]">No shifts in this period</td></tr>
              ) : shifts.map((r) => (
                <tr key={r.id}>
                  <td className="px-2 py-1.5">{r.date}</td>
                  <td className="px-2 py-1.5">{r.shift_type || '—'}</td>
                  <td className="px-2 py-1.5 text-right">{r.duty_hours ?? '—'}</td>
                  <td className="px-2 py-1.5 text-right">{r.hourly_rate != null ? money(r.hourly_rate) : '—'}</td>
                  <td className="px-2 py-1.5 text-right font-semibold">{r.total != null ? money(r.total) : '—'}</td>
                </tr>
              ))}
              <tr className="bg-[#F8FAFC] dark:bg-[#0F0F11] font-semibold">
                <td className="px-2 py-2" colSpan={4}>Subtotal</td>
                <td className="px-2 py-2 text-right" data-testid="payslip-subtotal">{money(subtotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Extras */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Extra Payments (+)</h4>
            <Button size="sm" variant="outline" onClick={addExtra} data-testid="payslip-add-extra">
              <Plus className="w-4 h-4 mr-1" /> Add extra
            </Button>
          </div>
          {extras.length === 0 ? (
            <p className="text-xs text-[#64748B]">Add hotel fee, parking fee, or any other custom charge that increases the payout.</p>
          ) : (
            <div className="space-y-2">
              {extras.map((e, i) => (
                <div key={i} className="grid grid-cols-[1fr_140px_36px] gap-2 items-center" data-testid={`payslip-extra-row-${i}`}>
                  <Input
                    placeholder="Label (e.g. Hotel Fee)"
                    value={e.label}
                    onChange={(ev) => updateExtra(i, 'label', ev.target.value)}
                    data-testid={`payslip-extra-label-${i}`}
                  />
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={e.amount}
                    onChange={(ev) => updateExtra(i, 'amount', ev.target.value)}
                    className="text-right"
                    data-testid={`payslip-extra-amount-${i}`}
                  />
                  <Button
                    variant="ghost" size="icon"
                    onClick={() => removeExtra(i)}
                    className="text-[#DC2626] hover:bg-rose-50 dark:hover:bg-rose-950/30"
                    aria-label="Remove extra"
                    data-testid={`payslip-remove-extra-${i}`}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Advance / Adjustment */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Advance / Adjustment (−)</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
            <div>
              <Label className="text-xs">Amount to deduct this period</Label>
              <Input
                type="number" step="0.01" min="0"
                placeholder="0.00"
                value={advance}
                onChange={(e) => setAdvance(e.target.value)}
                data-testid="payslip-advance-input"
              />
              {prevBalance > 0 && (
                <p className="text-xs text-[#B45309] mt-1" data-testid="payslip-prev-balance">
                  Carried forward from last period: {money(prevBalance)} (prefilled — edit as needed)
                </p>
              )}
              {loadingBalance && <p className="text-xs text-[#64748B] mt-1">Checking previous balance…</p>}
            </div>
            <p className="text-xs text-[#64748B] pt-6">
              Any amount larger than the net total carries forward to the next payslip automatically.
            </p>
          </div>
        </div>

        {/* Summary */}
        <div className="rounded-xl border border-[#E2E8F0] dark:border-[#27272A] bg-[#F8FAFC] dark:bg-[#0F0F11] p-4 space-y-1">
          <div className="flex justify-between text-sm"><span>Subtotal</span><span data-testid="payslip-summary-subtotal">{money(subtotal)}</span></div>
          {extras.length > 0 && (
            <div className="flex justify-between text-sm text-[#059669]"><span>+ Extras</span><span data-testid="payslip-summary-extras">{money(extrasTotal)}</span></div>
          )}
          {advanceNum > 0 && (
            <div className="flex justify-between text-sm text-[#DC2626]">
              <span>− Advance applied</span>
              <span data-testid="payslip-summary-advance">-{money(applied)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold border-t border-[#E2E8F0] dark:border-[#27272A] pt-2">
            <span>Net Payable</span>
            <span data-testid="payslip-summary-net">{money(netPayable)}</span>
          </div>
          {carryForward > 0 && (
            <div className="flex justify-between text-xs text-[#B45309]">
              <span>Unused advance → next period</span>
              <span data-testid="payslip-summary-carry">{money(carryForward)}</span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={downloading} data-testid="payslip-cancel-btn">Cancel</Button>
          <Button onClick={download} disabled={downloading} className="bg-[#4F46E5] hover:bg-[#4338CA] text-white" data-testid="payslip-download-btn">
            <FileText className="w-4 h-4 mr-2" />
            {downloading ? 'Generating…' : 'Download PDF'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const ColumnPickerDialog = ({ open, onClose, canFinancial, picked, onChange, onExport }) => {
  const all = canFinancial ? [...ENTITY_EXPORT_COLS, ...ENTITY_EXPORT_COLS_FIN] : ENTITY_EXPORT_COLS;
  const set = new Set(picked);
  const toggle = (k) => { const n = new Set(set); n.has(k) ? n.delete(k) : n.add(k); onChange(Array.from(n)); };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" data-testid="column-picker-dialog">
        <DialogHeader>
          <DialogTitle>Choose columns to export</DialogTitle>
          <DialogDescription>
            Tick the columns you want in the file. Order is preserved from top → bottom of this list.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-2">
          {all.map((c) => (
            <label key={c.key} className="flex items-center gap-2 text-sm cursor-pointer" data-testid={`col-${c.key}`}>
              <Checkbox checked={set.has(c.key)} onCheckedChange={() => toggle(c.key)} />
              <span className="text-[#334155] dark:text-[#E4E4E7]">{c.label}</span>
            </label>
          ))}
        </div>
        <div className="flex justify-between pt-2">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onChange(all.map((c) => c.key))} data-testid="col-select-all">Select all</Button>
            <Button variant="outline" size="sm" onClick={() => onChange([])} data-testid="col-clear-all">Clear</Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onExport('xlsx')} data-testid="detail-export-excel" disabled={picked.length === 0}>
              <FileSpreadsheet className="w-4 h-4 mr-2" /> Excel
            </Button>
            <Button variant="outline" size="sm" onClick={() => onExport('pdf')} data-testid="detail-export-pdf" disabled={picked.length === 0}>
              <FileText className="w-4 h-4 mr-2" /> PDF
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DispatchReportsPage;
