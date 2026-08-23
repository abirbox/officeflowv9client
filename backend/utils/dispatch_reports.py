"""CSV + PDF builders for Dispatch reports (permission-aware)."""
import csv
import io
import os
from datetime import datetime
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, letter, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm, inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image,
)


def build_csv(rows: list, columns: list) -> bytes:
    """columns: list of (header, key)"""
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow([h for h, _ in columns])
    for r in rows:
        w.writerow([r.get(k, "") if r.get(k) is not None else "" for _, k in columns])
    return buf.getvalue().encode("utf-8")


def build_xlsx(rows: list, columns: list, *, title: str = "Report",
               subtitle: str = "") -> bytes:
    """Excel workbook that mirrors the PDF report formatting: indigo header
    band, banded rows, red-bold post pin, currency-aware widths. Preserves
    the visual identity users see on-screen so exports feel like a designed
    report rather than raw CSV."""
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    ws = wb.active
    ws.title = (title or "Report")[:31] or "Sheet1"

    indigo = "4F46E5"
    band_a = "FFFFFF"
    band_b = "F8FAFC"
    grid = "E2E8F0"
    text_dark = "0F172A"
    red = "DC2626"

    thin = Side(style="thin", color=grid)
    border = Border(top=thin, left=thin, right=thin, bottom=thin)

    # Title + subtitle rows on top
    ncols = max(len(columns), 1)
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=ncols)
    tcell = ws.cell(row=1, column=1, value=title)
    tcell.font = Font(name="Calibri", size=16, bold=True, color=text_dark)
    tcell.alignment = Alignment(vertical="center")
    ws.row_dimensions[1].height = 24

    if subtitle:
        ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=ncols)
        scell = ws.cell(row=2, column=1, value=subtitle)
        scell.font = Font(name="Calibri", size=10, color="64748B")

    header_row_idx = 3 if subtitle else 2

    # Header
    for c, (label, _key) in enumerate(columns, start=1):
        cell = ws.cell(row=header_row_idx, column=c, value=label)
        cell.font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor=indigo)
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = border
    ws.row_dimensions[header_row_idx].height = 22

    # Body
    money_keys = {"duty_rate", "billing_rate", "hourly_rate", "total", "cost_amount",
                  "billing_amount", "margin"}
    pin_keys = {"post_pin", "post_pin_display"}
    numeric_keys = money_keys | {"duty_hours", "total_hours", "actual_hours",
                                  "completed_hours", "total_shifts", "completed",
                                  "absent", "late", "early_checkout", "cancelled",
                                  "confirmed", "attendance_pct", "coverage_pct"}

    for r, row in enumerate(rows, start=1):
        excel_row = header_row_idx + r
        band = band_a if r % 2 == 1 else band_b
        for c, (_label, key) in enumerate(columns, start=1):
            val = row.get(key)
            if val is None:
                val = ""
            cell = ws.cell(row=excel_row, column=c, value=val)
            cell.border = border
            cell.fill = PatternFill("solid", fgColor=band)
            if key in money_keys and isinstance(val, (int, float)):
                cell.number_format = '"$"#,##0.00'
                cell.alignment = Alignment(horizontal="right", vertical="center")
            elif key in numeric_keys and isinstance(val, (int, float)):
                cell.alignment = Alignment(horizontal="right", vertical="center")
            else:
                cell.alignment = Alignment(vertical="center", wrap_text=False)
            if key in pin_keys and val:
                cell.font = Font(name="Calibri", size=11, bold=True, color=red)
            else:
                cell.font = Font(name="Calibri", size=11, color=text_dark)

    # Column widths — a bit larger for text-heavy columns
    width_by_key = {
        "date": 12, "shift_type": 12, "start_time": 10, "end_time": 10,
        "duty_hours": 10, "hourly_rate": 12, "total": 12,
        "duty_rate": 12, "billing_rate": 12, "cost_amount": 12,
        "billing_amount": 12, "margin": 12, "attendance_pct": 12,
        "coverage_pct": 12, "total_shifts": 10, "completed": 12,
        "absent": 10, "late": 10, "early_checkout": 12,
        "confirmed": 12, "cancelled": 12, "work_order_number": 14,
        "post_pin": 12, "post_pin_display": 18, "post_site_name": 26,
        "post_site_address": 26, "city": 14,
        "client_name": 22, "vendor_name": 22, "officer_name": 22,
        "confirmation_status": 16, "confirmation_method": 16,
        "shift_status": 14, "remarks": 32, "last_modified_by_name": 20,
        "last_modified_action": 18, "actual_check_in": 14, "actual_check_out": 14,
    }
    for c, (_, key) in enumerate(columns, start=1):
        ws.column_dimensions[get_column_letter(c)].width = width_by_key.get(key, 14)

    # Freeze the header
    ws.freeze_panes = ws.cell(row=header_row_idx + 1, column=1).coordinate

    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()



def build_pdf(title: str, subtitle: str, rows: list, columns: list) -> bytes:
    """Simple tabular PDF."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4),
                            leftMargin=1.2*cm, rightMargin=1.2*cm,
                            topMargin=1.2*cm, bottomMargin=1.2*cm)
    styles = getSampleStyleSheet()
    story = []
    story.append(Paragraph(title, ParagraphStyle('t', parent=styles['Title'], fontSize=16)))
    story.append(Paragraph(subtitle, ParagraphStyle('s', parent=styles['Normal'], fontSize=9, textColor=colors.grey)))
    story.append(Spacer(1, 0.4*cm))

    header = [h for h, _ in columns]
    body = [[str(r.get(k, "") if r.get(k) is not None else "") for _, k in columns] for r in rows]
    tbl = Table([header] + body, repeatRows=1)
    tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#4F46E5')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.25, colors.HexColor('#E2E8F0')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F8FAFC')]),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    story.append(tbl)
    story.append(Spacer(1, 0.5*cm))
    story.append(Paragraph(f"Generated {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}",
                           ParagraphStyle('f', parent=styles['Normal'], fontSize=8, textColor=colors.grey)))
    doc.build(story)
    return buf.getvalue()


# ---- Branded per-officer payslip PDF (matches user's mockup) ---------------

def _fmt_date(iso: str) -> str:
    """'2026-08-01' → 'Sat, 1 Aug' (short, weekday-first)."""
    try:
        d = datetime.strptime(iso, "%Y-%m-%d")
        return d.strftime("%a, %d %b")
    except Exception:
        return iso or ""


def _fmt_date_long(iso: str) -> str:
    try:
        d = datetime.strptime(iso, "%Y-%m-%d")
        # e.g. "31st July 2026"
        day = d.day
        suffix = "th" if 4 <= day % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(day % 10, "th")
        return f"{day}{suffix} {d.strftime('%B %Y')}"
    except Exception:
        return iso or ""


def _resolve_logo_bytes(logo_url: str) -> bytes | None:
    """Given a URL like '/api/files/officeflow/...' or a legacy absolute URL,
    resolve to the on-disk file inside STORAGE_ROOT so the PDF can embed the
    image."""
    if not logo_url:
        return None
    marker = "/api/files/"
    rel = None
    if marker in logo_url:
        rel = logo_url.split(marker, 1)[1]
    elif not logo_url.startswith(("http://", "https://")):
        rel = logo_url.lstrip("/")
    if not rel:
        return None
    root = os.environ.get("STORAGE_ROOT", "/app/backend/uploads")
    path = os.path.join(root, rel)
    try:
        with open(path, "rb") as fh:
            return fh.read()
    except Exception:
        return None


def build_officer_payslip_pdf(
    *,
    client_name: str | None,
    client_logo_url: str | None,
    officer_name: str,
    date_from: str,
    date_to: str,
    rows: list,
    show_financial: bool,
    extras: list | None = None,
    advance_amount: float = 0.0,
    carry_forward: float = 0.0,
    net_payable: float | None = None,
) -> bytes:
    """Branded per-officer/per-client payslip in the layout the customer asked
    for (Arseas Security Service mockup).

    Columns: Date · Shift · Start · End · Duty Hours · Hourly Rate · Total ·
             Post Site · City · Post Site Pin · Remarks
    Footer:  Total Duty Hours · Total Amount
    """
    buf = io.BytesIO()
    half_inch = 0.5 * inch  # 0.5 inch margin all sides
    doc = SimpleDocTemplate(
        buf, pagesize=landscape(A4),
        leftMargin=half_inch, rightMargin=half_inch,
        topMargin=half_inch, bottomMargin=half_inch,
    )
    styles = getSampleStyleSheet()
    story = []

    # --- Header block: Logo + Client Title, both CENTERED ------------------
    logo_bytes = _resolve_logo_bytes(client_logo_url)
    center_cells = []
    if logo_bytes:
        # Pre-validate with PIL so a broken/corrupt image cannot crash
        # ReportLab's doc.build() at render time.
        try:
            from PIL import Image as PILImage
            with PILImage.open(io.BytesIO(logo_bytes)) as im:
                im.verify()
            # re-open (verify() consumes the stream)
            center_cells.append(Image(io.BytesIO(logo_bytes), width=2.4*cm, height=2.4*cm, kind='proportional'))
        except Exception:
            pass  # skip logo silently on any decode error
    center_cells.append(Paragraph(
        f"<para align='center'><b>{client_name or '&nbsp;'}</b></para>",
        ParagraphStyle('ct', parent=styles['Title'], fontSize=20, leading=24, alignment=1),
    ))
    center_stack = Table([[c] for c in center_cells], colWidths=[doc.width])
    center_stack.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
    ]))

    # Officer + Duty Periods block — LEFT aligned to page margin.
    meta_style = ParagraphStyle('meta', parent=styles['Normal'], fontSize=10, alignment=0)
    meta = [
        [Paragraph("<b>Security Officer's Name:</b>", meta_style),
         Paragraph(officer_name or "—", meta_style)],
        [Paragraph("<b>Duty Periods:</b>", meta_style),
         Paragraph(f"{_fmt_date_long(date_from)} to {_fmt_date_long(date_to)}", meta_style)],
    ]
    meta_tbl = Table(meta, colWidths=[4.5*cm, doc.width - 4.5*cm], hAlign='LEFT')
    meta_tbl.setStyle(TableStyle([
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
    ]))

    story.append(center_stack)
    story.append(Spacer(1, 0.3*cm))
    story.append(meta_tbl)
    story.append(Spacer(1, 0.4*cm))

    # --- Table --------------------------------------------------------------
    columns = [
        ("Date", "date"), ("Shift", "shift_type"),
        ("Start Time", "start_time"), ("End Time", "end_time"),
        ("Duty Hours", "duty_hours"),
        ("Hourly Rate", "hourly_rate"), ("Total", "total"),
        ("Post Site Name", "post_site_name"), ("City", "city"),
        ("Post Site Pin", "post_pin_display"), ("Remarks", "remarks"),
    ]
    if not show_financial:
        columns = [c for c in columns if c[1] not in ("hourly_rate", "total")]

    header_labels = [h for h, _ in columns]

    body = []
    total_duty = 0.0
    total_amount = 0.0
    for r in rows:
        line = []
        for _, k in columns:
            v = r.get(k)
            if v is None:
                line.append("")
            elif k in ("hourly_rate", "total"):
                line.append(f"${float(v):,.2f}" if v else "")
            elif k == "duty_hours":
                line.append(f"{float(v):g}" if isinstance(v, (int, float)) and v else str(v))
            elif k == "date":
                line.append(_fmt_date(v))
            else:
                line.append(str(v))
        body.append(line)
        total_duty += float(r.get("duty_hours") or 0)
        total_amount += float(r.get("total") or 0)

    # Footer totals row (spans hours + amount columns)
    footer = [""] * len(columns)
    def _colidx(key):
        for i, (_, k) in enumerate(columns):
            if k == key:
                return i
        return -1
    fi_duty = _colidx("duty_hours")
    fi_total = _colidx("total")
    if fi_duty >= 0: footer[fi_duty] = f"{total_duty:g}"
    if fi_total >= 0: footer[fi_total] = f"${total_amount:,.2f}"

    data = [header_labels] + body + [footer]

    # Full-width table: distribute doc.width across columns with weights so
    # data-heavy columns (Post Site Name, Remarks) get more space than
    # numeric columns.
    weights_by_key = {
        "date": 1.4, "shift_type": 0.9,
        "start_time": 0.9, "end_time": 0.9,
        "duty_hours": 0.9, "hourly_rate": 1.0, "total": 1.0,
        "post_site_name": 2.6, "city": 1.1,
        "post_pin": 1.1, "post_pin_display": 1.4, "remarks": 2.2,
    }
    weights = [weights_by_key.get(k, 1.0) for _, k in columns]
    total_w = sum(weights)
    col_widths = [doc.width * (w / total_w) for w in weights]

    tbl = Table(data, colWidths=col_widths, repeatRows=1, hAlign='LEFT')
    # Compute right-aligned columns (numeric / currency) and centre columns
    # so numbers line up cleanly under their headers.
    numeric_keys = {"duty_hours", "hourly_rate", "total"}
    numeric_col_idxs = [i for i, (_, k) in enumerate(columns) if k in numeric_keys]
    left_keys = {"post_site_name", "remarks"}
    left_col_idxs = [i for i, (_, k) in enumerate(columns) if k in left_keys]

    style = [
        # Header
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#F2C4CE')),  # rose from mockup
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#0F172A')),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        # Body defaults
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.25, colors.HexColor('#94A3B8')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (0, 1), (-1, -1), 'CENTER'),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        # Date column tinted like mockup
        ('BACKGROUND', (0, 1), (0, -2), colors.HexColor('#FBE4EA')),
        # Footer totals row
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#F8FAFC')),
        ('LINEABOVE', (0, -1), (-1, -1), 1, colors.HexColor('#0F172A')),
    ]
    # Right-align numeric columns across body + footer
    for i in numeric_col_idxs:
        style.append(('ALIGN', (i, 1), (i, -1), 'RIGHT'))
    # Left-align text-heavy columns
    for i in left_col_idxs:
        style.append(('ALIGN', (i, 1), (i, -2), 'LEFT'))
    # Post Site Pin column — red bold text (matches on-screen mockup)
    pin_idx = _colidx("post_pin_display")
    if pin_idx < 0:
        pin_idx = _colidx("post_pin")
    if pin_idx >= 0:
        style.append(('TEXTCOLOR', (pin_idx, 1), (pin_idx, -2), colors.HexColor('#DC2626')))
        style.append(('FONTNAME', (pin_idx, 1), (pin_idx, -2), 'Helvetica-Bold'))
    tbl.setStyle(TableStyle(style))
    story.append(tbl)

    # ---- Adjustments block (Extras, Advance, Net Payable) ------------------
    if show_financial and (extras or advance_amount or (net_payable is not None and net_payable != total_amount)):
        story.append(Spacer(1, 0.4 * cm))
        label_style = ParagraphStyle('adjLbl', parent=styles['Normal'], fontSize=10, alignment=2)  # right
        amount_style = ParagraphStyle('adjAmt', parent=styles['Normal'], fontSize=10, alignment=2)
        bold_style = ParagraphStyle('adjBold', parent=styles['Normal'], fontSize=11, alignment=2, fontName='Helvetica-Bold')

        adj_rows = []
        adj_rows.append([Paragraph("Subtotal", label_style),
                         Paragraph(f"${total_amount:,.2f}", amount_style)])
        for e in (extras or []):
            lbl = str(e.get("label") or "Extra").strip() or "Extra"
            amt = float(e.get("amount") or 0)
            adj_rows.append([Paragraph(f"+ {lbl}", label_style),
                             Paragraph(f"${amt:,.2f}", amount_style)])
        if advance_amount:
            adj_rows.append([Paragraph("- Advance / Adjustment", label_style),
                             Paragraph(f"-${float(advance_amount):,.2f}", amount_style)])
        computed_net = net_payable
        if computed_net is None:
            extras_total = sum(float((e.get("amount") or 0)) for e in (extras or []))
            applied = min(float(advance_amount or 0), total_amount + extras_total)
            computed_net = total_amount + extras_total - applied
        adj_rows.append([Paragraph("Net Payable", bold_style),
                         Paragraph(f"${float(computed_net):,.2f}", bold_style)])
        if carry_forward and float(carry_forward) > 0:
            note = ParagraphStyle('cf', parent=styles['Normal'], fontSize=9,
                                  alignment=2, textColor=colors.HexColor('#B45309'))
            adj_rows.append([Paragraph(
                f"Unused advance carried forward to next period",
                note),
                Paragraph(f"${float(carry_forward):,.2f}", note)])

        adj_tbl = Table(adj_rows, colWidths=[doc.width * 0.75, doc.width * 0.25], hAlign='RIGHT')
        adj_tbl.setStyle(TableStyle([
            ('LINEABOVE', (0, -2), (-1, -2), 1, colors.HexColor('#0F172A')),
            ('BACKGROUND', (0, -2), (-1, -2), colors.HexColor('#F1F5F9')),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ]))
        story.append(adj_tbl)

    story.append(Spacer(1, 0.4*cm))
    doc.build(story)
    return buf.getvalue()
# ---- Client → Vendor Invoice PDF (matches Arseas mockup) --------------------

def build_invoice_pdf(
    *, client: dict, vendor: dict,
    invoice_number: str, invoice_date: str,
    billing_period_from: str, billing_period_to: str,
    lines: list, total_hours: float, total_amount: float,
    amount_in_words: str = "",
    accent_color: str = None,
) -> bytes:
    """Portrait A4 invoice — black header/footer bars with an accent line
    (defaults to gold, overridable via ``accent_color`` for per-client brand),
    faint centered watermark logo, and centered table cells with accent borders.
    Client name renders inside the header bar on the right side.
    """
    black = colors.HexColor('#000000')
    # Fall back to gold when the client has no brand color configured.
    def _safe_hex(val, fallback):
        try:
            return colors.HexColor(val) if val else fallback
        except Exception:
            return fallback
    default_gold = colors.HexColor('#D4A017')
    golden = _safe_hex(accent_color, default_gold)
    dark = colors.HexColor('#0F172A')

    # ---- Layout constants (points, 1pt == 1px for our purposes) ----------
    PAGE_MARGIN = 0.4 * inch
    TOP_MARGIN = 0.2 * inch        # thinner top gutter per new spec
    HEADER_TOP_GAP = 30            # gap above header black bar
    HEADER_BAR_H = 40              # keeps the logo overflow visible
    LOGO_OVERFLOW = 27             # logo extends ~27pt above/below bar (+30 vs prior)
    HEADER_GOLD_H = 3              # golden line thickness in header bar
    HEADER_GOLD_FROM_BOTTOM = 1    # 1pt above bar bottom
    HEADER_GOLD_W_RATIO = 0.60     # 60% of page width
    FOOTER_BLACK_H = 24            # black bar height (fits 14pt text)
    FOOTER_GOLD_H = 3              # golden bar height in footer
    FOOTER_CONTENT_GAP = 20        # gap between content bottom and footer

    buf = io.BytesIO()
    top_margin = TOP_MARGIN + HEADER_TOP_GAP + HEADER_BAR_H + LOGO_OVERFLOW
    bottom_margin = FOOTER_BLACK_H + FOOTER_GOLD_H + FOOTER_CONTENT_GAP

    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=PAGE_MARGIN, rightMargin=PAGE_MARGIN,
        topMargin=top_margin, bottomMargin=bottom_margin,
    )
    styles = getSampleStyleSheet()
    story = []

    logo_bytes = _resolve_logo_bytes(client.get('logo_url') or client.get('logo_path'))
    if logo_bytes:
        try:
            from PIL import Image as PILImage
            with PILImage.open(io.BytesIO(logo_bytes)) as im:
                im.verify()
        except Exception:
            logo_bytes = None

    def _draw_chrome(canvas, doc_):
        page_w, page_h = A4
        canvas.saveState()

        # ---- Watermark (centered horizontally, positioned below the
        # invoice metadata so it only sits behind the table and content
        # below it) at 0.10 opacity ---------------------------------------
        if logo_bytes:
            try:
                from reportlab.lib.utils import ImageReader
                img = ImageReader(io.BytesIO(logo_bytes))
                iw, ih = img.getSize()
                target_w = 4.5 * inch
                scale = target_w / float(iw)
                target_h = ih * scale
                cx = (page_w - target_w) / 2
                # Anchor watermark center around ~35% of the page height
                # (measured from the bottom) so it sits behind the table
                # and the space beneath it, clear of the meta block.
                cy = page_h * 0.35 - target_h / 2
                canvas.saveState()
                canvas.setFillAlpha(0.10)
                canvas.drawImage(img, cx, cy, width=target_w, height=target_h,
                                 mask='auto', preserveAspectRatio=True)
                canvas.restoreState()
            except Exception:
                pass

        # ---- Header black bar -------------------------------------------
        bar_top = page_h - TOP_MARGIN - HEADER_TOP_GAP
        bar_bottom = bar_top - HEADER_BAR_H
        canvas.setFillColor(black)
        canvas.rect(PAGE_MARGIN, bar_bottom,
                    page_w - 2 * PAGE_MARGIN, HEADER_BAR_H,
                    fill=1, stroke=0)

        # ---- Golden accent line inside the bar (left-aligned) -----------
        gold_w = page_w * HEADER_GOLD_W_RATIO
        gold_x = PAGE_MARGIN
        gold_y = bar_bottom + HEADER_GOLD_FROM_BOTTOM
        canvas.setFillColor(golden)
        canvas.rect(gold_x, gold_y, gold_w, HEADER_GOLD_H, fill=1, stroke=0)

        # ---- Header logo (60% of bar width, centered vertically, overflows)
        content_w = page_w - 2 * PAGE_MARGIN
        logo_area_w = content_w * 0.60
        name_area_w = content_w * 0.40
        if logo_bytes:
            try:
                from reportlab.lib.utils import ImageReader
                img = ImageReader(io.BytesIO(logo_bytes))
                iw, ih = img.getSize()
                logo_h_target = HEADER_BAR_H + 2 * LOGO_OVERFLOW
                scale_h = logo_h_target / float(ih)
                # cap width at 60% of the bar width minus a small padding
                max_lw = logo_area_w - 16
                scale_w = max_lw / float(iw)
                scale = min(scale_h, scale_w)
                lw = iw * scale
                logo_h = ih * scale
                lx = PAGE_MARGIN + 8
                ly = bar_bottom + (HEADER_BAR_H - logo_h) / 2
                canvas.drawImage(img, lx, ly, width=lw, height=logo_h,
                                 mask='auto', preserveAspectRatio=True)
            except Exception:
                pass

        # ---- Client name inside the header bar, right-aligned (40% area)
        cname = (client.get('name') or '').upper()
        if cname:
            from reportlab.platypus import Paragraph as _P
            # try 14pt first; if it does not fit inside the bar, shrink
            for size in (14, 12, 10, 9):
                cname_style = ParagraphStyle(
                    'cname', fontName='Helvetica-Bold', fontSize=size,
                    leading=size + 3, textColor=colors.white, alignment=2,
                )
                p = _P(cname, cname_style)
                max_w = name_area_w - 8
                _w, _h = p.wrap(max_w, HEADER_BAR_H)
                if _h <= HEADER_BAR_H - 4:
                    break
            # vertically center within the bar; anchor to the right edge
            p.drawOn(canvas,
                     page_w - PAGE_MARGIN - max_w - 4,
                     bar_bottom + (HEADER_BAR_H - _h) / 2)

        # ---- Footer: 95%-wide golden line + black bar stuck to the very
        # bottom edge of the page; thank-you text centered inside the bar.
        bar_w = page_w * 0.95
        bar_x = page_w - bar_w             # right-aligned to page edge
        # black bar at y=0 (no bottom spacing)
        canvas.setFillColor(black)
        canvas.rect(bar_x, 0, bar_w, FOOTER_BLACK_H, fill=1, stroke=0)
        # golden line directly above the black bar (no gap)
        canvas.setFillColor(golden)
        canvas.rect(bar_x, FOOTER_BLACK_H, bar_w, FOOTER_GOLD_H,
                    fill=1, stroke=0)

        # ---- Footer text inside the black bar, 13pt regular, white ----
        canvas.setFillColor(colors.white)
        canvas.setFont('Helvetica', 13)
        # visual baseline that centers 13pt text inside FOOTER_BLACK_H
        text_y = (FOOTER_BLACK_H - 13) / 2 + 3
        canvas.drawCentredString(page_w / 2, text_y,
                                 'Thanks for business with us!')

        canvas.restoreState()

    # ---- INVOICE title -----------------------------------------------------
    story.append(Paragraph(
        "<para align='center'><b>INVOICE</b></para>",
        ParagraphStyle('title', parent=styles['Title'], fontSize=22, leading=26, textColor=dark),
    ))
    story.append(Spacer(1, 0.35 * cm))

    # ---- BILLING TO (left) / BILLING FROM (right) -------------------------
    label_style_left = ParagraphStyle(
        'lbl_l', parent=styles['Normal'], fontSize=9,
        textColor=colors.white, spaceAfter=0, leading=12, alignment=0,
    )
    label_style_right = ParagraphStyle(
        'lbl_r', parent=styles['Normal'], fontSize=9,
        textColor=colors.white, spaceAfter=0, leading=12, alignment=2,
    )
    name_style_l = ParagraphStyle('nm_l', parent=styles['Normal'], fontSize=10, textColor=dark, spaceAfter=1, alignment=0)
    name_style_r = ParagraphStyle('nm_r', parent=styles['Normal'], fontSize=10, textColor=dark, spaceAfter=1, alignment=2)
    body_style_l = ParagraphStyle('b_l', parent=styles['Normal'], fontSize=9, textColor=dark, leading=12, alignment=0)
    body_style_r = ParagraphStyle('b_r', parent=styles['Normal'], fontSize=9, textColor=dark, leading=12, alignment=2)

    def label_tag(text: str, right_aligned: bool) -> Table:
        p = Paragraph(f"<b>{text}</b>",
                      label_style_right if right_aligned else label_style_left)
        pill = Table([[p]], colWidths=[4.6 * cm])
        pill.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), black),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            # Force cell content to hug the correct edge, since a short
            # Paragraph shrinks to its own width and defaults to left.
            ('ALIGN', (0, 0), (-1, -1), 'RIGHT' if right_aligned else 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        # Force pill to align to the correct edge by placing it inside a
        # full-width row with a padding cell on the opposite side.
        col_w = doc.width / 2 - 2
        pad_w = col_w - 4.6 * cm
        if right_aligned:
            wrapper = Table([["", pill]], colWidths=[pad_w, 4.6 * cm])
        else:
            wrapper = Table([[pill, ""]], colWidths=[4.6 * cm, pad_w])
        wrapper.setStyle(TableStyle([
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        return wrapper

    def contact_block(label: str, party: dict, right_aligned: bool) -> Table:
        nstyle = name_style_r if right_aligned else name_style_l
        bstyle = body_style_r if right_aligned else body_style_l
        details = []
        phone = party.get('phone') or party.get('contact_number') or party.get('contact_phone')
        if party.get('address'): details.append(party['address'])
        if party.get('city'): details.append(party['city'])
        if phone: details.append(f"Phone: {phone}")
        if party.get('email'): details.append(f"Email: {party['email']}")
        if party.get('website'): details.append(f"Web: {party['website']}")
        cells = [
            [label_tag(label, right_aligned)],
            [Spacer(1, 0.15 * cm)],
            [Paragraph(f"<b>{party.get('name', '')}</b>", nstyle)],
        ]
        for d in details:
            cells.append([Paragraph(d, bstyle)])
        t = Table(cells, colWidths=[doc.width / 2 - 2],
                  hAlign='RIGHT' if right_aligned else 'LEFT')
        t.setStyle(TableStyle([
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 1),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
        ]))
        return t

    def meta_block() -> Table:
        rows = [
            [Paragraph("<b>Invoice No:</b>", body_style_r), Paragraph(invoice_number or "—", body_style_r)],
            [Paragraph("<b>Invoice Date:</b>", body_style_r), Paragraph(invoice_date or "—", body_style_r)],
            [Paragraph("<b>Billing Period:</b>", body_style_r),
             Paragraph(f"{billing_period_from} to {billing_period_to}", body_style_r)],
        ]
        t = Table(rows, colWidths=[3.4 * cm, 5.1 * cm], hAlign='RIGHT')
        t.setStyle(TableStyle([
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 1),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
            # Force both label and value cells to hug the right edge so
            # the whole meta block reads right-aligned like BILLING TO.
            ('ALIGN', (0, 0), (-1, -1), 'RIGHT'),
        ]))
        return t

    # Billing FROM on the left (left aligned), Billing TO on the right (right aligned)
    parties = Table([
        [contact_block("BILLING FROM", client, right_aligned=False),
         contact_block("BILLING TO", vendor, right_aligned=True)],
        [Spacer(1, 0.15 * cm), Spacer(1, 0.15 * cm)],
        ["", meta_block()],
    ], colWidths=[doc.width / 2, doc.width / 2])
    parties.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        # Force the meta_block cell (row 2, col 1) to right-align its
        # nested table so Invoice No/Date/Period hug the right edge.
        ('ALIGN', (1, 2), (1, 2), 'RIGHT'),
    ]))
    story.append(parties)
    story.append(Spacer(1, 0.4 * cm))

    # ---- Line-item table --------------------------------------------------
    header_row = ["Shift Date", "Location", "Work Order", "Actual Hour", "Rate", "Total Amount"]
    body_rows = []
    for ln in lines:
        rate = ln.get("rate")
        total = ln.get("total_amount")
        body_rows.append([
            ln.get("shift_date") or "—",
            ln.get("location") or "—",
            ln.get("work_order") or "—",
            f"{float(ln.get('actual_hours') or 0):.2f}",
            (f"$ {float(rate):,.2f}" if rate is not None else "—"),
            (f"$ {float(total):,.2f}" if total is not None else "—"),
        ])
    if not body_rows:
        body_rows.append(["—", "No completed shifts in this period", "—", "0.00", "—", "—"])
    footer_row = ["", "", "Total", f"{float(total_hours):.2f}", "", f"$ {float(total_amount):,.2f}"]
    data = [header_row] + body_rows + [footer_row]
    col_widths = [
        doc.width * 0.14, doc.width * 0.22, doc.width * 0.24,
        doc.width * 0.12, doc.width * 0.13, doc.width * 0.15,
    ]
    tbl = Table(data, colWidths=col_widths, repeatRows=1)
    style = [
        # Header row — black bg, bold golden text
        ('BACKGROUND', (0, 0), (-1, 0), black),
        ('TEXTCOLOR', (0, 0), (-1, 0), golden),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        # Body defaults
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('TEXTCOLOR', (0, 1), (-1, -2), dark),
        # Golden borders on all cells
        ('GRID', (0, 0), (-1, -1), 0.75, golden),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        # Totals row — same as header row
        ('BACKGROUND', (0, -1), (-1, -1), black),
        ('TEXTCOLOR', (0, -1), (-1, -1), golden),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
    ]
    tbl.setStyle(TableStyle(style))
    story.append(tbl)
    story.append(Spacer(1, 0.35 * cm))

    if amount_in_words:
        story.append(Paragraph(
            f"<b>In-Words:</b> {amount_in_words}",
            ParagraphStyle('iw', parent=styles['Normal'], fontSize=9, textColor=dark),
        ))

    doc.build(story, onFirstPage=_draw_chrome, onLaterPages=_draw_chrome)
    return buf.getvalue()
