// Mirrors of deliveryFeeFor() and vatAmountFor() in the API (and the web's
// src/lib/orders.js). The server is always the authority on what gets charged —
// these only let the checkout summary show the charges before the order exists.

export function deliveryFeeFor(subtotal, delivery) {
  const fee = Number(delivery?.fee ?? 0);
  const freeOver = Number(delivery?.freeOver ?? 0);
  if (!Number.isFinite(fee) || fee <= 0) return 0;
  if (freeOver > 0 && Number(subtotal) >= freeOver) return 0;
  return Math.round(fee * 100) / 100;
}

// `base` is items + delivery: the delivery charge is taxable too.
export function vatAmountFor(base, vat) {
  const percent = Number(vat?.percent ?? 0);
  if (!Number.isFinite(percent) || percent <= 0) return 0;
  return Math.round((Number(base) || 0) * (Math.min(percent, 100) / 100) * 100) / 100;
}

// Mirror of vatNote() in as_store/src/lib/orders.js — the line shown under a
// price outside the checkout, saying the figure is the goods alone. Empty at
// 0%, so switching VAT off in Settings retires the wording with it. Keep the
// two in step: someone who priced a product in the app checks out on the web.
export const VAT_NOTE = 'VAT added at checkout';

export const vatNote = vat => (Number(vat?.percent ?? 0) > 0 ? VAT_NOTE : '');
