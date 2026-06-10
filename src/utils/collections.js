/**
 * collections.js (фронт) — дзеркало backend/collections.js.
 * Усі колекції — масиви об'єктів зі стабільним _id.
 * Інвентар має ту саму структуру, що й база майстра (GMItems).
 */

export const INV_COLLECTIONS = new Set([
  '_inv_inv-main', '_inv_inv-belt', '_inv_inv-quest', '_inv_inv-tools',
  '_inv_inv-books', '_inv_inv-ingredients', '_inv_inv-potions', '_inv_inv-horse',
])

export const OTHER_COLLECTIONS = new Set([
  '_spells', '_effects', '_traits_v2', '_quirks', '_recipes', '_languages',
])

export const OBJECT_COLLECTIONS = new Set([...INV_COLLECTIONS, ...OTHER_COLLECTIONS])

export const isCollection = key => OBJECT_COLLECTIONS.has(key)

export function genId() {
  return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function getRowId(collection, row) {
  return row?._id
}

// Порожній предмет — структура збігається з базою майстра (GMItems)
export function emptyItem() {
  return {
    type: 'other', name: '', isMagic: false, isCursed: false, isBlessed: false,
    weightPerOne: 0, weight: 0, amount: 1,
    physicalDamage: 0, magicalDamage: 0, physicalResistance: 0, magicalResistance: 0,
    description: '', effects: [],
    _id: genId(),
  }
}

// Типи предметів. Визначають, у які слоти спорядження предмет можна одягнути.
export const ITEM_TYPES = [
  { id: 'armor',  label: 'Броня',  icon: 'Бр.' },
  { id: 'weapon', label: 'Зброя',  icon: 'Зб.' },
  { id: 'other',  label: 'Інше',   icon: '·' },
]
export const itemTypeIcon = (t) => (ITEM_TYPES.find(x => x.id === t) || ITEM_TYPES[2]).icon
export const itemTypeLabel = (t) => (ITEM_TYPES.find(x => x.id === t) || ITEM_TYPES[2]).label

// Гарантує _id для кожного елемента колекції (міграція на льоту при завантаженні)
export function ensureIds(sheet) {
  if (!sheet || typeof sheet !== 'object') return sheet
  for (const key of OBJECT_COLLECTIONS) {
    const arr = sheet[key]
    if (!Array.isArray(arr)) continue
    for (let i = 0; i < arr.length; i++) {
      const row = arr[i]
      if (row && typeof row === 'object' && !Array.isArray(row)) {
        if (!row._id) arr[i] = { ...row, _id: genId() }
      }
    }
  }
  return sheet
}

// Розщепити стек: повертає { one, remaining } — предмет у 1 екземплярі та скільки лишилось.
// Для екіпірування: одягаємо 1 шт, решта лишається в інвентарі.
export function splitOne(item) {
  const amount = parseFloat(item.amount) || 1
  const perWeight = item.weightPerOne ?? (amount ? (parseFloat(item.weight) || 0) / amount : 0)
  const one = { ...item, amount: 1, weightPerOne: perWeight, weight: perWeight }
  return { one, remaining: amount - 1 }
}
export function applyOpLocal(sheet, op) {
  const { collection, action } = op
  if (!isCollection(collection)) return
  if (!Array.isArray(sheet[collection])) sheet[collection] = []
  const arr = sheet[collection]

  if (action === 'add') {
    const id = getRowId(collection, op.row)
    if (id && arr.some(r => getRowId(collection, r) === id)) return
    arr.push({ ...op.row })
    return
  }
  if (action === 'remove') {
    const idx = arr.findIndex(r => getRowId(collection, r) === op.rowId)
    if (idx !== -1) arr.splice(idx, 1)
    return
  }
  if (action === 'update') {
    const idx = arr.findIndex(r => getRowId(collection, r) === op.rowId)
    if (idx === -1) return
    arr[idx] = { ...arr[idx], ...(op.patch || {}) }
    return
  }
  if (action === 'move') {
    const idx = arr.findIndex(r => getRowId(collection, r) === op.rowId)
    if (idx === -1) return
    const [moved] = arr.splice(idx, 1)
    const to = Math.max(0, Math.min(op.toIndex ?? arr.length, arr.length))
    arr.splice(to, 0, moved)
  }
}
