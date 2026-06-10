/**
 * sse.js — менеджер SSE-підключень.
 * Кожен авторизований клієнт (гравець або GM) реєструє своє res-з'єднання.
 * GM-дії надсилають події конкретним гравцям через userId.
 */

// Map<userId, {role, connections: Set<reply>}>
const clients = new Map()

export function addClient(userId, role, reply) {
  if (!clients.has(userId)) clients.set(userId, { role, connections: new Set() })
  clients.get(userId).connections.add(reply)
}

export function removeClient(userId, reply) {
  const entry = clients.get(userId)
  if (!entry) return
  entry.connections.delete(reply)
  if (entry.connections.size === 0) clients.delete(userId)
}

function sendTo(userId, msg) {
  const entry = clients.get(userId)
  if (!entry || entry.connections.size === 0) return
  for (const reply of entry.connections) {
    try { reply.raw.write(msg) } catch {}
  }
}

/**
 * Надіслати SSE-подію конкретному гравцеві (за userId власника персонажа).
 */
export function emitToUser(userId, event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  sendTo(userId, msg)
}

/**
 * Надіслати подію всім підключеним GM/admin (коли гравець щось зберігає).
 */
export function emitToGMs(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const [, entry] of clients) {
    if (entry.role === 'gm' || entry.role === 'admin') {
      for (const reply of entry.connections) {
        try { reply.raw.write(msg) } catch {}
      }
    }
  }
}

// Розіслати подію набору користувачів за їх userId (напр. усім у пачці — кидки кубиків)
export function emitToUsers(userIds, event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const uid of userIds) {
    const entry = clients.get(uid)
    if (!entry) continue
    for (const reply of entry.connections) {
      try { reply.raw.write(msg) } catch {}
    }
  }
  // GM теж бачать кидки
  for (const [uid, entry] of clients) {
    if ((entry.role === 'gm' || entry.role === 'admin') && !userIds.includes(uid)) {
      for (const reply of entry.connections) {
        try { reply.raw.write(msg) } catch {}
      }
    }
  }
}

/**
 * Зручна обгортка: знайти userId власника персонажа і надіслати йому sheet_update.
 * patches — об'єкт з полями sheetData, які змінились (тільки diff, не весь лист).
 */
export function emitSheetPatch(charRow, patches, meta = {}) {
  if (!charRow) return
  emitToUser(charRow.user_id, 'sheet_update', {
    charId: charRow.id,
    patches,
    ...meta,
    ts: Date.now(),
  })
}
