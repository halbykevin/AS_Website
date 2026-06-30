'use client'

import { useCallback, useState } from 'react'

// Tracks a set of selected row ids for bulk actions (delete, etc.). Pass the
// currently visible list so "select all" / the all-checked state follow whatever
// is filtered on screen.
export function useSelection(items) {
  const [ids, setIds] = useState(() => new Set())

  const visibleIds = items.map((i) => i.id)
  const all = visibleIds.length > 0 && visibleIds.every((id) => ids.has(id))
  const some = ids.size > 0

  const toggle = useCallback((id) => {
    setIds((s) => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    setIds(() => (all ? new Set() : new Set(visibleIds)))
  }, [all, visibleIds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  const clear = useCallback(() => setIds(new Set()), [])

  return {
    selectedIds: [...ids],
    has: (id) => ids.has(id),
    count: ids.size,
    all,
    indeterminate: some && !all,
    toggle,
    toggleAll,
    clear,
  }
}
