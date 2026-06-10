/**
 * collections.js — операції над колекціями листа (інвентар, закляття, ефекти тощо).
 *
 * Проблема, яку це вирішує: інвентар/закляття зберігались як цілі масиви.
 * Будь-яка зміна слала весь масив → паралельні зміни гравця і GM перетирали
 * рядки одне одного (предмети зникали/дублювались).
 *
 * Рішення: кожен елемент — об'єкт зі стабільним _id. Зміни застосовуються
 * ПООПЕРАЦІЙНО за _id (add/update/remove/move), а не перезаписом масиву.
 * Дві сторони можуть міняти різні елементи одночасно — вони не конфліктують.
 *
 * Усі колекції — масиви об'єктів із полем _id. Інвентар має ту саму структуру,
 * що й база майстра (GMItems): { name, isMagic, effects:[], physicalDamage, ... }.
 */

// Інвентарні списки
const INV_COLLECTIONS = new Set([
  '_inv_inv-main', '_inv_inv-belt', '_inv_inv-quest', '_inv_inv-tools',
  '_inv_inv-books', '_inv_inv-ingredients', '_inv_inv-potions', '_inv_inv-horse',
])

// Інші об'єктні колекції
const OTHER_COLLECTIONS = new Set([
  '_spells', '_effects', '_traits_v2', '_quirks', '_recipes', '_technologies', '_languages',
])

// Усі колекції тепер однотипні: масиви об'єктів із _id
const OBJECT_COLLECTIONS = new Set([...INV_COLLECTIONS, ...OTHER_COLLECTIONS])

export function isCollection(key) {
  return OBJECT_COLLECTIONS.has(key)
}

function genId() {
  return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function getRowId(collection, row) {
  return row?._id
}

function setRowId(collection, row, id) {
  return { ...row, _id: id }
}

/**
 * Застосувати одну операцію до листа (мутує sheet). Повертає { ok, op } з нормалізованою
 * операцією (із згенерованим _id для add), щоб переслати її іншим через SSE.
 *
 * op = {
 *   collection: '_inv_inv-main' | '_spells' | ...,
 *   action: 'add' | 'update' | 'remove' | 'move',
 *   rowId?: string,     // для update/remove/move
 *   row?: object,       // для add (повний об'єкт) — _id буде проставлено/збережено
 *   patch?: object,     // для update — часткові поля
 *   toIndex?: number,   // для move
 * }
 */
export function applyOp(sheet, op) {
  const { collection, action } = op
  if (!isCollection(collection)) return { ok: false, error: 'unknown collection' }

  if (!Array.isArray(sheet[collection])) sheet[collection] = []
  const arr = sheet[collection]

  if (action === 'add') {
    let row = { ...(op.row || {}) }
    let id = getRowId(collection, row)
    if (!id) { id = genId(); row = setRowId(collection, row, id) }
    // ідемпотентність: не дублюємо, якщо такий _id вже є (повторний SSE)
    if (arr.some(r => getRowId(collection, r) === id)) return { ok: true, op: { ...op, row, rowId: id } }
    arr.push(row)
    return { ok: true, op: { ...op, row, rowId: id } }
  }

  if (action === 'remove') {
    const idx = arr.findIndex(r => getRowId(collection, r) === op.rowId)
    if (idx !== -1) arr.splice(idx, 1)
    return { ok: true, op }
  }

  if (action === 'update') {
    const idx = arr.findIndex(r => getRowId(collection, r) === op.rowId)
    if (idx === -1) return { ok: true, op }  // елемент міг бути видалений — тихо ігноруємо
    arr[idx] = { ...arr[idx], ...(op.patch || {}) }
    return { ok: true, op }
  }

  if (action === 'move') {
    const idx = arr.findIndex(r => getRowId(collection, r) === op.rowId)
    if (idx === -1) return { ok: true, op }
    const [moved] = arr.splice(idx, 1)
    const to = Math.max(0, Math.min(op.toIndex ?? arr.length, arr.length))
    arr.splice(to, 0, moved)
    return { ok: true, op }
  }

  return { ok: false, error: 'unknown action' }
}

export { genId, getRowId, INV_COLLECTIONS, OBJECT_COLLECTIONS }
