import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { FileText, Download, Eye, Plus, Trash2, X } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../../../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../../components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '../../../components/ui/popover';
import { Checkbox } from '../../../components/ui/checkbox';
import { Textarea } from '../../../components/ui/textarea';
import api, { formatApiErrorDetail } from '../../../lib/axios';

const emptyForm = {
  client_id: '', vendor_id: '',
  post_site_ids: [],
  invoice_number: '', invoice_date: new Date().toISOString().slice(0, 10),
  billing_period_from: '', billing_period_to: '',
  notes: '',
  // `lines` becomes populated on Preview; the user can then edit each row,
  // add/remove lines, and hit Save & Download.
  lines: null,
};

// Blank line-item template used when the user clicks "Add Line".
const blankLine = () => ({
  schedule_id: null,
  shift_date: '',
  location: '',
  post_pin: '',
  pin_display: '',
  work_order: '',
  actual_hours: 0,
  rate: 0,
  total_amount: 0,
});

/**
 * Dispatch → Invoices page.
 * - Lists saved invoices for the org.
 * - "Generate Invoice" dialog collects the Client + Vendor + metadata,
 *   fetches a live preview, then lets admins Save + Download or just Download.
 */
const DispatchInvoicesPage = () => {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);

  const [clients, setClients] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [locations, setLocations] = useState([]);
  const [locationsLoading, setLocationsLoading] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/dispatch/invoices');
      setInvoices(data.items || []);
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    api.get('/dispatch/clients').then((r) => setClients(r.data)).catch(() => {});
    api.get('/dispatch/vendors').then((r) => setVendors(r.data)).catch(() => {});
  }, [load]);

  // Locations are schedule-backed: refresh them whenever the billing period,
  // Client, or Vendor changes, and clear a selection that is no longer valid.
  const loadLocations = useCallback(async () => {
    const { billing_period_from: date_from, billing_period_to: date_to, client_id, vendor_id } = form;
    if (!dialogOpen || !date_from || !date_to) {
      setLocations([]);
      return;
    }
    setLocationsLoading(true);
    try {
      const { data } = await api.get('/dispatch/invoices/locations', {
        params: { date_from, date_to, client_id: client_id || undefined, vendor_id: vendor_id || undefined },
      });
      setLocations(data || []);
      // Drop selections that are no longer in the returned option set
      setForm((prev) => {
        const valid = new Set((data || []).map((l) => l.id));
        const kept = (prev.post_site_ids || []).filter((id) => valid.has(id));
        return kept.length === (prev.post_site_ids || []).length ? prev : { ...prev, post_site_ids: kept };
      });
    } catch (e) {
      setLocations([]);
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally { setLocationsLoading(false); }
  }, [dialogOpen, form.billing_period_from, form.billing_period_to, form.client_id, form.vendor_id]);

  useEffect(() => { loadLocations(); }, [loadLocations]);

  const canPreview = form.client_id && form.vendor_id && form.billing_period_from && form.billing_period_to && form.invoice_number && form.invoice_date;

  const runPreview = async () => {
    if (!canPreview) { toast.error('Fill Client, Vendor, Invoice #, Date and Billing Period'); return; }
    setPreviewLoading(true);
    try {
      // Fetch the auto-populated preview WITHOUT any user-edited lines so
      // the "Preview" action always shows fresh data from the schedules.
      const { lines: _stripLines, ...formSansLines } = form;
      const { data } = await api.post('/dispatch/invoices/preview', formSansLines);
      setPreview(data);
      // Seed the editable line grid with the fetched lines so the customise
      // screen is populated ready for the user to tweak.
      setForm((prev) => ({ ...prev, lines: (data.lines || []).map((l) => ({ ...l })) }));
    } catch (e) {
      setPreview(null);
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally { setPreviewLoading(false); }
  };

  // Helpers used by the editable line grid ---------------------------------
  const updateLine = (idx, patch) => {
    setForm((prev) => {
      const lines = [...(prev.lines || [])];
      const cur = { ...lines[idx], ...patch };
      const hrs = Number(cur.actual_hours) || 0;
      const rate = Number(cur.rate) || 0;
      cur.total_amount = Number((hrs * rate).toFixed(2));
      lines[idx] = cur;
      return { ...prev, lines };
    });
  };
  const addLine = () => setForm((prev) => ({ ...prev, lines: [...(prev.lines || []), blankLine()] }));
  const removeLine = (idx) => setForm((prev) => ({
    ...prev,
    lines: (prev.lines || []).filter((_, i) => i !== idx),
  }));
  const resetLinesFromSchedules = () => { setPreview(null); setForm((prev) => ({ ...prev, lines: null })); };

  const editedTotals = useMemo(() => {
    const lines = form.lines || [];
    let hours = 0, amount = 0;
    for (const ln of lines) {
      hours += Number(ln.actual_hours) || 0;
      amount += Number(ln.total_amount) || 0;
    }
    return { hours: Number(hours.toFixed(2)), amount: Number(amount.toFixed(2)) };
  }, [form.lines]);

  const openDialog = async () => {
    // Default the billing period to the previous 7 days so admins can start
    // fast — they can always tweak.
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - 6);
    // Auto-fetch the next invoice number (starts at 5250)
    let nextNumber = '';
    try {
      const { data } = await api.get('/dispatch/invoices/next-number');
      nextNumber = data?.invoice_number || '';
    } catch (e) { /* non-fatal — user can type it manually */ }
    setForm({
      ...emptyForm,
      invoice_number: nextNumber,
      billing_period_from: from.toISOString().slice(0, 10),
      billing_period_to: to.toISOString().slice(0, 10),
    });
    setPreview(null);
    setDialogOpen(true);
  };

  const downloadPreviewPdf = async () => {
    if (!canPreview) return;
    try {
      const res = await api.post('/dispatch/invoices/preview/pdf', form, { responseType: 'blob' });
      _saveBlob(res.data, `Invoice-${form.invoice_number}.pdf`);
    } catch (e) { toast.error('PDF download failed'); }
  };

  const saveInvoice = async () => {
    if (!canPreview) return;
    setSaving(true);
    try {
      const { data } = await api.post('/dispatch/invoices', form);
      toast.success(`Invoice #${data.invoice_number} saved`);
      // Immediately download the freshly saved PDF for the user
      const res = await api.get(`/dispatch/invoices/${data.id}/pdf`, { responseType: 'blob' });
      _saveBlob(res.data, `Invoice-${data.invoice_number}.pdf`);
      setDialogOpen(false);
      setForm(emptyForm);
      setPreview(null);
      await load();
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  const downloadSaved = async (inv) => {
    try {
      const res = await api.get(`/dispatch/invoices/${inv.id}/pdf`, { responseType: 'blob' });
      _saveBlob(res.data, `Invoice-${inv.invoice_number}.pdf`);
    } catch (e) { toast.error('Download failed'); }
  };

  const removeInvoice = async (inv) => {
    if (!window.confirm(`Permanently delete Invoice #${inv.invoice_number}?`)) return;
    try {
      await api.delete(`/dispatch/invoices/${inv.id}`);
      toast.success('Invoice deleted');
      await load();
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };

  const clientMap = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients]);
  const vendorMap = useMemo(() => Object.fromEntries(vendors.map((v) => [v.id, v])), [vendors]);

  return (
    <div className="space-y-6" data-testid="dispatch-invoices-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A] dark:text-[#FAFAFA]">Invoices</h1>
          <p className="text-sm text-[#64748B]">Generate branded Client → Vendor invoices from completed dispatch shifts.</p>
        </div>
        <Button onClick={openDialog} className="bg-[#4F46E5] hover:bg-[#4338CA]" data-testid="generate-invoice-btn">
          <Plus className="w-4 h-4 mr-2" /> Generate Invoice
        </Button>
      </div>

      <div className="bg-white dark:bg-[#18181B] border border-[#E2E8F0] dark:border-[#27272A] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#F8FAFC] dark:bg-[#0F0F11] text-xs uppercase tracking-wider text-[#64748B]">
            <tr>
              <th className="px-3 py-3 text-left">Invoice #</th>
              <th className="px-3 py-3 text-left">Date</th>
              <th className="px-3 py-3 text-left">Client</th>
              <th className="px-3 py-3 text-left">Vendor</th>
              <th className="px-3 py-3 text-left">Billing Period</th>
              <th className="px-3 py-3 text-right">Hours</th>
              <th className="px-3 py-3 text-right">Amount</th>
              <th className="px-3 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#27272A]">
            {loading && <tr><td colSpan={8} className="px-4 py-6 text-center text-[#64748B]">Loading…</td></tr>}
            {!loading && invoices.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-[#64748B]">No invoices yet. Click <b>Generate Invoice</b> to create your first one.</td></tr>
            )}
            {invoices.map((inv) => (
              <tr key={inv.id} data-testid={`invoice-row-${inv.id}`}>
                <td className="px-3 py-2 font-mono">{inv.invoice_number}</td>
                <td className="px-3 py-2">{inv.invoice_date}</td>
                <td className="px-3 py-2">{inv.client_snapshot?.name || clientMap[inv.client_id]?.name || '—'}</td>
                <td className="px-3 py-2">{inv.vendor_snapshot?.name || vendorMap[inv.vendor_id]?.name || '—'}</td>
                <td className="px-3 py-2 text-xs text-[#64748B]">{inv.billing_period_from} → {inv.billing_period_to}</td>
                <td className="px-3 py-2 text-right">{Number(inv.total_hours || 0).toFixed(2)}</td>
                <td className="px-3 py-2 text-right font-semibold">${Number(inv.total_amount || 0).toFixed(2)}</td>
                <td className="px-3 py-2 text-right space-x-2">
                  <Button size="sm" variant="outline" onClick={() => downloadSaved(inv)} data-testid={`invoice-download-${inv.id}`}>
                    <Download className="w-4 h-4 mr-1" /> PDF
                  </Button>
                  <Button size="sm" variant="outline" className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20" onClick={() => removeInvoice(inv)} data-testid={`invoice-delete-${inv.id}`}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Generate Invoice dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto" data-testid="generate-invoice-dialog">
          <DialogHeader>
            <DialogTitle>Generate Invoice</DialogTitle>
            <DialogDescription>
              Pick a Client and Vendor, set the billing period, then Preview to customise every line — dates, locations, hours and rates — before you save or download the invoice.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <div><Label>Client (BILLING FROM) *</Label>
              <Select value={form.client_id} onValueChange={(v) => { setForm({ ...form, client_id: v, lines: null }); setPreview(null); }}>
                <SelectTrigger data-testid="inv-client"><SelectValue placeholder="Select client" /></SelectTrigger>
                <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Vendor (BILLING TO) *</Label>
              <Select value={form.vendor_id} onValueChange={(v) => { setForm({ ...form, vendor_id: v, lines: null }); setPreview(null); }}>
                <SelectTrigger data-testid="inv-vendor"><SelectValue placeholder="Select vendor" /></SelectTrigger>
                <SelectContent>{vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Invoice Number *</Label>
              <Input value={form.invoice_number} onChange={(e) => setForm({ ...form, invoice_number: e.target.value })} placeholder="e.g. 5257" data-testid="inv-number" />
            </div>
            <div><Label>Invoice Date *</Label>
              <Input type="date" value={form.invoice_date} onChange={(e) => setForm({ ...form, invoice_date: e.target.value })} data-testid="inv-date" />
            </div>
            <div><Label>Billing Period — From *</Label>
              <Input type="date" value={form.billing_period_from} onChange={(e) => { setForm({ ...form, billing_period_from: e.target.value, lines: null }); setPreview(null); }} data-testid="inv-period-from" />
            </div>
            <div><Label>Billing Period — To *</Label>
              <Input type="date" value={form.billing_period_to} onChange={(e) => { setForm({ ...form, billing_period_to: e.target.value, lines: null }); setPreview(null); }} data-testid="inv-period-to" />
            </div>
            <div className="col-span-2"><Label>Locations (optional — pick one or more)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button" variant="outline"
                    className="w-full justify-between font-normal"
                    disabled={locationsLoading || !form.billing_period_from || !form.billing_period_to}
                    data-testid="inv-location"
                  >
                    <span className="truncate text-left">
                      {locationsLoading
                        ? 'Loading locations…'
                        : (form.post_site_ids && form.post_site_ids.length > 0
                          ? `${form.post_site_ids.length} location(s) selected`
                          : 'All locations')}
                    </span>
                    <span className="text-xs text-[#94A3B8] ml-2">▾</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-2 max-h-72 overflow-y-auto">
                  <div className="flex items-center justify-between px-1 pb-2 border-b border-[#E2E8F0] dark:border-[#27272A] mb-2">
                    <Button
                      type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs"
                      onClick={() => { setForm({ ...form, post_site_ids: [], lines: null }); setPreview(null); }}
                      data-testid="inv-location-clear"
                    >Clear all</Button>
                    <span className="text-xs text-[#64748B]">{locations.length} option(s)</span>
                  </div>
                  {locations.length === 0 && (
                    <p className="text-xs text-[#64748B] px-1 py-4 text-center">No assigned locations in this range.</p>
                  )}
                  {locations.map((location) => {
                    const checked = (form.post_site_ids || []).includes(location.id);
                    const toggle = () => {
                      const cur = new Set(form.post_site_ids || []);
                      if (cur.has(location.id)) cur.delete(location.id); else cur.add(location.id);
                      setForm({ ...form, post_site_ids: Array.from(cur), lines: null });
                      setPreview(null);
                    };
                    return (
                      <label
                        key={location.id}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[#F8FAFC] dark:hover:bg-[#27272A] cursor-pointer"
                        data-testid={`inv-location-option-${location.id}`}
                      >
                        <Checkbox checked={checked} onCheckedChange={toggle} />
                        <span className="text-sm">
                          {[location.location, location.city, location.name, location.post_pin].filter(Boolean).join(' · ')}
                        </span>
                      </label>
                    );
                  })}
                </PopoverContent>
              </Popover>
              <p className="text-xs text-[#64748B] mt-1">Options match the selected date range, Client, and Vendor. Leave empty to include all locations.</p>
            </div>
            <div className="col-span-2"><Label>Notes (optional)</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="inv-notes" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Button variant="outline" onClick={runPreview} disabled={!canPreview || previewLoading} data-testid="inv-preview-btn">
              <Eye className="w-4 h-4 mr-2" />{previewLoading ? 'Loading…' : 'Preview & Customize'}
            </Button>
            <Button variant="outline" onClick={downloadPreviewPdf} disabled={!canPreview} data-testid="inv-download-preview-btn">
              <Download className="w-4 h-4 mr-2" /> Download PDF (no save)
            </Button>
            <div className="flex-1" />
            <Button onClick={saveInvoice} disabled={!canPreview || saving} className="bg-[#4F46E5] hover:bg-[#4338CA]" data-testid="inv-save-btn">
              <FileText className="w-4 h-4 mr-2" />{saving ? 'Saving…' : 'Save & Download'}
            </Button>
          </div>

          {preview && (
            <div className="border border-[#E2E8F0] dark:border-[#27272A] rounded-lg p-4 mt-3" data-testid="invoice-preview">
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <p className="uppercase tracking-wider text-[#64748B]">Billing From</p>
                  <p className="font-semibold text-sm text-[#0F172A] dark:text-[#FAFAFA]">{preview.client?.name}</p>
                  {preview.client?.email && <p>Email: {preview.client.email}</p>}
                  {preview.client?.phone && <p>Phone: {preview.client.phone}</p>}
                  {preview.client?.website && <p>Web: {preview.client.website}</p>}
                </div>
                <div>
                  <p className="uppercase tracking-wider text-[#64748B]">Billing To</p>
                  <p className="font-semibold text-sm text-[#0F172A] dark:text-[#FAFAFA]">{preview.vendor?.name}</p>
                  {preview.vendor?.email && <p>Email: {preview.vendor.email}</p>}
                  {preview.vendor?.phone && <p>Phone: {preview.vendor.phone}</p>}
                  {preview.vendor?.website && <p>Web: {preview.vendor.website}</p>}
                </div>
              </div>

              <div className="flex items-center justify-between mt-3 mb-2">
                <p className="text-xs uppercase tracking-wider text-[#64748B]">
                  Line Items — <span className="normal-case text-[#0F172A] dark:text-[#FAFAFA]">edit any cell before saving</span>
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline" size="sm"
                    onClick={resetLinesFromSchedules}
                    data-testid="inv-reset-lines-btn"
                    title="Discard edits and refetch from schedules"
                  >
                    Reset from schedules
                  </Button>
                  <Button
                    variant="outline" size="sm"
                    onClick={addLine}
                    data-testid="inv-add-line-btn"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add Line
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs border border-[#E2E8F0] dark:border-[#27272A]" data-testid="inv-lines-table">
                  <thead className="bg-[#F8FAFC] dark:bg-[#0F0F11] uppercase tracking-wider text-[#64748B]">
                    <tr>
                      <th className="px-2 py-1.5 text-left w-32">Shift Date</th>
                      <th className="px-2 py-1.5 text-left">Location</th>
                      <th className="px-2 py-1.5 text-left w-32">Work Order</th>
                      <th className="px-2 py-1.5 text-right w-24">Actual Hour</th>
                      <th className="px-2 py-1.5 text-right w-24">Rate</th>
                      <th className="px-2 py-1.5 text-right w-28">Total</th>
                      <th className="px-2 py-1.5 w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#27272A]">
                    {(form.lines || []).map((ln, idx) => (
                      <tr key={ln.schedule_id || `custom-${idx}`} data-testid={`inv-line-row-${idx}`}>
                        <td className="px-1 py-1">
                          <Input
                            type="date"
                            value={ln.shift_date || ''}
                            onChange={(e) => updateLine(idx, { shift_date: e.target.value })}
                            className="h-7 text-xs"
                            data-testid={`inv-line-date-${idx}`}
                          />
                        </td>
                        <td className="px-1 py-1">
                          <Input
                            value={ln.location || ''}
                            onChange={(e) => updateLine(idx, { location: e.target.value })}
                            placeholder="Location"
                            className="h-7 text-xs"
                            data-testid={`inv-line-location-${idx}`}
                          />
                        </td>
                        <td className="px-1 py-1">
                          <Input
                            value={ln.work_order || ''}
                            onChange={(e) => updateLine(idx, { work_order: e.target.value })}
                            placeholder="W.O."
                            className="h-7 text-xs font-mono"
                            data-testid={`inv-line-wo-${idx}`}
                          />
                        </td>
                        <td className="px-1 py-1">
                          <Input
                            type="number" step="0.01" min="0"
                            value={ln.actual_hours ?? 0}
                            onChange={(e) => updateLine(idx, { actual_hours: e.target.value })}
                            className="h-7 text-xs text-right"
                            data-testid={`inv-line-hours-${idx}`}
                          />
                        </td>
                        <td className="px-1 py-1">
                          <Input
                            type="number" step="0.01" min="0"
                            value={ln.rate ?? 0}
                            onChange={(e) => updateLine(idx, { rate: e.target.value })}
                            className="h-7 text-xs text-right"
                            data-testid={`inv-line-rate-${idx}`}
                          />
                        </td>
                        <td className="px-2 py-1 text-right font-semibold" data-testid={`inv-line-total-${idx}`}>
                          {ln.total_amount != null ? `$${Number(ln.total_amount).toFixed(2)}` : '—'}
                        </td>
                        <td className="px-1 py-1 text-center">
                          <Button
                            variant="ghost" size="sm"
                            onClick={() => removeLine(idx)}
                            className="h-7 w-7 p-0 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950"
                            data-testid={`inv-line-remove-${idx}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {(!form.lines || form.lines.length === 0) && (
                      <tr>
                        <td colSpan={7} className="px-2 py-4 text-center text-[#64748B]">
                          No line items yet. Click <b>Add Line</b> to add a custom row, or set a Client/Vendor and hit <b>Preview</b> to auto-populate from completed shifts.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {form.lines && form.lines.length > 0 && (
                    <tfoot className="bg-[#F8FAFC] dark:bg-[#0F0F11] font-bold">
                      <tr>
                        <td className="px-2 py-1.5" colSpan={3}>Totals</td>
                        <td className="px-2 py-1.5 text-right" data-testid="preview-total-hours">{editedTotals.hours.toFixed(2)}</td>
                        <td />
                        <td className="px-2 py-1.5 text-right" data-testid="preview-total-amount">${editedTotals.amount.toFixed(2)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              <p className="text-xs mt-2 text-[#64748B]">Total in-words is regenerated when you save so it matches the edited grand total.</p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}><X className="w-4 h-4 mr-2" /> Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

function _saveBlob(blob, filename) {
  const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default DispatchInvoicesPage;
