"use client";

import Icon from "./Icon.jsx";
import { MAX_QTY } from "@/store/cartSlice";

// Shown when a shopper tries to exceed the per-product quantity cap: a small
// red note pointing them to WhatsApp for larger orders. `whatsapp` comes from
// settings.contact.whatsapp; without it the note still shows, just unlinked.
export default function MaxQtyNote({ whatsapp, product, className = "" }) {
  const digits = String(whatsapp || "").replace(/\D/g, "");
  const message = `Hi AS Store! I'd like to order more than ${MAX_QTY} of: ${product || "a product"}`;
  const href = digits
    ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
    : "";

  return (
    <p
      className={`flex flex-wrap items-center gap-x-1 text-xs font-medium text-as-red ${className}`}
    >
      <span>Max {MAX_QTY} per order — for more quantity,</span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 underline underline-offset-2 hover:opacity-80"
        >
          WhatsApp us
          <Icon name="whatsapp" className="h-3.5 w-3.5" strokeWidth={2} />
        </a>
      ) : (
        <span className="inline-flex items-center gap-1">
          WhatsApp us
          <Icon name="whatsapp" className="h-3.5 w-3.5" strokeWidth={2} />
        </span>
      )}
    </p>
  );
}
