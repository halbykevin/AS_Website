// Helpers for the 2-level category hierarchy (categories carry a `parentId`).
// Top-level categories (departments) have parentId = null; subcategories point
// at their parent's id.

// Direct subcategories of a given parent id.
export function childrenOf(categories, parentId) {
  return (categories || []).filter((c) => c.parentId === parentId)
}

// The parent category record for a category, or null if it's top-level.
export function parentOf(categories, category) {
  if (!category?.parentId) return null
  return (categories || []).find((c) => c.id === category.parentId) || null
}

// Find a category by slug.
export function findBySlug(categories, slug) {
  return (categories || []).find((c) => c.slug === slug) || null
}

// Top-level departments, each with a `children` array. Categories whose parent
// is missing from the list are treated as top-level so nothing disappears.
export function buildCategoryTree(categories) {
  const cats = Array.isArray(categories) ? categories : []
  const byId = new Map(cats.map((c) => [c.id, c]))
  const kids = new Map()
  const roots = []
  for (const c of cats) {
    if (c.parentId && byId.has(c.parentId)) {
      if (!kids.has(c.parentId)) kids.set(c.parentId, [])
      kids.get(c.parentId).push(c)
    } else {
      roots.push(c)
    }
  }
  return roots.map((r) => ({ ...r, children: kids.get(r.id) || [] }))
}

// Flat, tree-ordered list for <select> menus: each department, immediately
// followed by its subcategories. `depth` is 0 for a department, 1 for a
// subcategory (use it to indent the label).
export function orderedCategoryOptions(categories) {
  const byOrder = (a, b) =>
    (Number(a.sort) || 0) - (Number(b.sort) || 0) || String(a.name).localeCompare(String(b.name))
  const tree = buildCategoryTree(categories)
  const out = []
  for (const dept of [...tree].sort(byOrder)) {
    out.push({ id: dept.id, name: dept.name, depth: 0 })
    for (const sub of [...dept.children].sort(byOrder)) {
      out.push({ id: sub.id, name: sub.name, depth: 1, parentId: dept.id })
    }
  }
  return out
}

// The breadcrumb trail for a category page: Home → [parent] → category.
export function categoryTrail(categories, category) {
  const trail = [{ name: 'Home', href: '/' }]
  const parent = parentOf(categories, category)
  if (parent) trail.push({ name: parent.name, href: `/category/${parent.slug}` })
  if (category) trail.push({ name: category.name, href: `/category/${category.slug}` })
  return trail
}
