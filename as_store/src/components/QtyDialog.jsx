'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Icon from './Icon.jsx'
import QtyField from './QtyField.jsx'
import { money } from '@/lib/orders'
import { formatQty } from '@/store/cartSlice'

// "How many?" — asked once, at the moment of adding, for a product that sells
// in quantity.
//
// An ordinary tile adds one and opens the bag, which is right when the cap is
// 2. For a product that allows thousands, the quantity IS the decision being
// made, and leaving it to the bag means adding one thing and then editing it
// somewhere else. So the button opens this instead: type the number, see what
// it comes to, add it.
//
// The running total is the reason this is a dialog rather than a plain input.
// Where a licence costs $1 the quantity and the price are the same number, and
// showing "130 × $1.00 = $130.00" is what makes it obvious the box takes the
// amount owed rather than a count of boxes to ship.
export default function QtyDialog({ open, product, min = 1, max = 99, step = 1, onAdd, onClose }) {
  const [qty, setQty] = useState(min)

  // Reopening starts from the floor again rather than from whatever the last
  // visitor to this dialog typed.
  useEffect(() => {
    if (open) setQty(min)
  }, [open, min])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!product) return null
  const price = Number(product.price) || 0

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/40" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`Add ${product.name} to bag`}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="relative w-full max-w-sm rounded-t-[28px] bg-white p-6 shadow-2xl sm:rounded-[28px]"
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-as-ink/40 hover:bg-as-fog hover:text-as-ink"
              aria-label="Close"
            >
              <Icon name="close" className="h-4 w-4" />
            </button>

            <p className="pr-8 text-lg font-semibold tracking-apple text-as-ink">{product.name}</p>
            <p className="mt-1 text-sm text-as-ink/55">
              {money(price)} each · {min > 1 ? `${formatQty(min)}–` : 'up to '}
              {max.toLocaleString()} per order
            </p>

            <div className="mt-6 flex items-center justify-between gap-4">
              <QtyField value={qty} min={min} max={max} step={step} onChange={setQty} size="md" />
              <div className="text-right">
                <p className="text-xs text-as-ink/45">Total</p>
                <p className="text-xl font-semibold text-as-ink">{money(price * qty)}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                onAdd(qty)
                onClose()
              }}
              className="pill mt-6 w-full justify-center"
            >
              Add to Bag
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
