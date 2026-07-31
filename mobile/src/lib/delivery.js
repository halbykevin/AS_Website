// Mirror of deliveryFeeFor() in the API (and the web's src/lib/orders.js). The
// server is always the authority on what gets charged — this only lets the
// checkout summary show the fee before the order exists.

export function deliveryFeeFor(subtotal, delivery) {
  const fee = Number(delivery?.fee ?? 0);
  const freeOver = Number(delivery?.freeOver ?? 0);
  if (!Number.isFinite(fee) || fee <= 0) return 0;
  if (freeOver > 0 && Number(subtotal) >= freeOver) return 0;
  return Math.round(fee * 100) / 100;
}
