'use client'

// The VAT rate, shared with everything on the storefront that shows a price.
//
// It reaches those components through a context for the same reason the "call
// for price" copy does: product tiles render from a dozen places — the shop,
// the categories, search, the rails, the homepage, the assistant's answers —
// and threading a prop through all of them would mean every future grid has to
// remember to. One that forgot would quietly print a price with nothing saying
// VAT is still to come, which is the exact thing this is here to prevent. The
// provider is mounted once, in the storefront layout.
//
// The wording itself is deliberately NOT here: vatNote() and vatTag() live in
// lib/orders.js, a plain module, so the server and the app-side mirror can use
// the same rules without importing a client component.

import { createContext, useContext } from 'react'

const VatContext = createContext({ percent: 0 })

export function VatProvider({ vat, children }) {
  return <VatContext.Provider value={vat || { percent: 0 }}>{children}</VatContext.Provider>
}

// 0% where there is no provider — the admin's live tile preview renders outside
// the storefront tree. No marker at all is the right answer there: better than
// one built on a rate this side of the app never loaded.
export const useVat = () => useContext(VatContext)
