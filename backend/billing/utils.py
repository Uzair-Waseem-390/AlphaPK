from decimal import Decimal, ROUND_HALF_UP


PRECISION = Decimal("0.0001")


def quantize(value: Decimal) -> Decimal:
    return value.quantize(PRECISION, rounding=ROUND_HALF_UP)


def calculate_line_item(
    *,
    quantity: int,
    selling_price: Decimal,
    discount: Decimal,
    gst: Decimal,
    wht: Decimal,
) -> dict:
    """
    Single source of truth for invoice line item calculation.

    Formula:
        effective_price = selling_price - discount
        line_gross      = quantity x effective_price
        line_gst        = line_gross x (gst / 100)
        line_wht        = line_gross x (wht / 100)
        line_total      = line_gross + line_gst - line_wht   (tax-inclusive, shown on bill)

    Notes:
        - discount > 0  => price reduction
        - discount < 0  => surcharge (price increase)
        - discount/gst/wht default to 0 (no effect)
        - COGS is unaffected by discount/gst/wht (purely from FIFO purchase cost)

    Returns dict of all computed Decimal values.
    """
    qty             = Decimal(str(quantity))
    sp              = Decimal(str(selling_price))
    disc            = Decimal(str(discount))
    gst_pct         = Decimal(str(gst))
    wht_pct         = Decimal(str(wht))

    effective_price = sp - disc
    line_gross      = qty * effective_price
    line_gst        = line_gross * (gst_pct / Decimal("100"))
    line_wht        = line_gross * (wht_pct / Decimal("100"))
    line_total      = line_gross + line_gst - line_wht

    return {
        "effective_price" : quantize(effective_price),
        "line_gross"      : quantize(line_gross),
        "line_gst_amount" : quantize(line_gst),
        "line_wht_amount" : quantize(line_wht),
        "line_total"      : quantize(line_total),
    }


def calculate_invoice_totals(line_items: list[dict]) -> dict:
    """
    Aggregates line-level results into invoice-level totals.
    line_items: list of dicts returned by calculate_line_item() + line_cogs.

    Returns:
        subtotal    = sum of line_gross  (before tax)
        gst_total   = sum of line_gst
        wht_total   = sum of line_wht
        grand_total = sum of line_total  (tax-inclusive, what customer pays)
        total_cogs  = sum of line_cogs
        gross_profit = grand_total - total_cogs
    """
    subtotal     = Decimal("0")
    gst_total    = Decimal("0")
    wht_total    = Decimal("0")
    grand_total  = Decimal("0")
    total_cogs   = Decimal("0")

    for item in line_items:
        subtotal    += item["line_gross"]
        gst_total   += item["line_gst_amount"]
        wht_total   += item["line_wht_amount"]
        grand_total += item["line_total"]
        total_cogs  += item["line_cogs"]

    gross_profit = grand_total - total_cogs

    return {
        "subtotal"    : quantize(subtotal),
        "gst_total"   : quantize(gst_total),
        "wht_total"   : quantize(wht_total),
        "grand_total" : quantize(grand_total),
        "total_cogs"  : quantize(total_cogs),
        "gross_profit": quantize(gross_profit),
    }