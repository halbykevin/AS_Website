import { createContext, useContext } from 'react'

// Holds a ref to the page's scroll container. The public site scrolls inside a
// box that starts below the header (so the scrollbar sits under the header,
// not beside it), instead of scrolling the window. Components that used to read
// window scroll (navbar hide/show, back-to-top, popup scroll trigger) read this
// element instead.
export const ScrollContext = createContext(null)

export const useScrollEl = () => useContext(ScrollContext)
