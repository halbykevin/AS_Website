import { createContext, useContext, useState } from 'react'

// Shares the "is the World Cup predictor open?" state between the nav football
// button (the trigger) and the modal (rendered once in Layout).
const PredictorUIContext = createContext(null)

export function PredictorUIProvider({ children }) {
  const [open, setOpen] = useState(false)
  const value = {
    open,
    openGame: () => setOpen(true),
    closeGame: () => setOpen(false),
  }
  return <PredictorUIContext.Provider value={value}>{children}</PredictorUIContext.Provider>
}

export function usePredictorUI() {
  const ctx = useContext(PredictorUIContext)
  if (!ctx) throw new Error('usePredictorUI must be used within <PredictorUIProvider>')
  return ctx
}
