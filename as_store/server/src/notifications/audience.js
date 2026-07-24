// Audience definitions -> SQL over the customers table. Pure builder (returns
// {sql, params}) so it can be unit-tested without a database.
//
// Shapes:
//   {type:'all'}                          — every customer
//   {type:'customers', ids:[1,2]}         — explicit list
//   {type:'filter', hasOrders, orderedSince, categoryIds, city}
//     hasOrders    true|false      — has (or has never) placed an order
//     orderedSince <days>          — ordered within the last N days
//     categoryIds  [id,...]        — ordered a product from one of these categories
//     city         'beirut'        — order/city or profile address contains it

export function audienceQuery(audience = {}) {
  const a = audience && typeof audience === 'object' ? audience : {}
  const params = []
  const push = (v) => {
    params.push(v)
    return `$${params.length}`
  }

  if (a.type === 'customers') {
    const ids = (Array.isArray(a.ids) ? a.ids : []).map(Number).filter(Number.isInteger)
    if (!ids.length) return { sql: `SELECT id FROM customers WHERE false`, params: [] }
    return { sql: `SELECT id FROM customers WHERE id = ANY(${push(ids)})`, params }
  }

  const where = []
  if (a.type === 'filter') {
    if (a.hasOrders === true || a.orderedSince || (Array.isArray(a.categoryIds) && a.categoryIds.length)) {
      const orderWhere = ['o.customer_id = customers.id']
      if (a.orderedSince) {
        const days = Math.max(1, Math.min(3650, Number(a.orderedSince) || 0))
        orderWhere.push(`o.created_at > now() - make_interval(days => ${push(days)})`)
      }
      const catIds = (Array.isArray(a.categoryIds) ? a.categoryIds : [])
        .map(Number)
        .filter(Number.isInteger)
      let join = ''
      if (catIds.length) {
        join = ` JOIN order_items oi ON oi.order_id = o.id
                 JOIN products p ON p.id = oi.product_id`
        orderWhere.push(`p.category_id = ANY(${push(catIds)})`)
      }
      where.push(`EXISTS (SELECT 1 FROM orders o${join} WHERE ${orderWhere.join(' AND ')})`)
    } else if (a.hasOrders === false) {
      where.push(`NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = customers.id)`)
    }
    if (a.city && String(a.city).trim()) {
      const like = `%${String(a.city).trim()}%`
      where.push(
        `(customers.address ILIKE ${push(like)} OR EXISTS (
           SELECT 1 FROM orders o2 WHERE o2.customer_id = customers.id AND o2.city ILIKE ${push(like)}))`,
      )
    }
  }

  return {
    sql: `SELECT id FROM customers${where.length ? ' WHERE ' + where.join(' AND ') : ''}`,
    params,
  }
}

// Human summary for the admin UI / audit log.
export function audienceLabel(a = {}) {
  if (a?.type === 'customers') return `${(a.ids || []).length} selected customer(s)`
  if (a?.type === 'filter') {
    const bits = []
    if (a.hasOrders === true) bits.push('has ordered')
    if (a.hasOrders === false) bits.push('never ordered')
    if (a.orderedSince) bits.push(`ordered in last ${a.orderedSince}d`)
    if (a.categoryIds?.length) bits.push(`bought from ${a.categoryIds.length} categor(ies)`)
    if (a.city) bits.push(`city ~ ${a.city}`)
    return bits.length ? bits.join(', ') : 'all customers'
  }
  return 'all customers'
}
