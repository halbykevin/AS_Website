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
