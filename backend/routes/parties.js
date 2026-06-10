// routes/parties.js — пачки
import { dbGet, dbAll, dbRun, saveToDB, logAction } from '../db.js'
import { emitToUser, emitToGMs, emitToUsers } from '../sse.js'
import { applyOp, getRowId, genId } from '../collections.js'
import { randomInt, randomUUID } from 'node:crypto'

export default async function partyRoutes(fastify) {

  // Всі маршрути потребують авторизації
  fastify.addHook('preHandler', fastify.authenticate)

  // Middleware: тільки GM
  function gmOnly(req, reply, done) {
    if (req.user.role !== 'gm' && req.user.role !== 'admin') {
      return reply.code(403).send({ error: 'Тільки для GM' })
    }
    done()
  }

  // ── GET /api/parties ────────────────────────────────
  // GM: всі свої пачки. Гравець: пачки де він є членом
  fastify.get('/', async (req, reply) => {
    const { userId, role } = req.user

    if (role === 'gm' || role === 'admin') {
      const parties = dbAll(
        `SELECT p.*, COUNT(pm.user_id) as member_count
         FROM parties p
         LEFT JOIN party_members pm ON pm.party_id = p.id
         WHERE p.gm_id = ?
         GROUP BY p.id
         ORDER BY p.created_at DESC`,
        [userId]
      )
      return reply.send(parties)
    } else {
      // Гравець бачить всі активні пачки (для вибору)
      const parties = dbAll(
        `SELECT p.*, u.username as gm_name,
                COUNT(pm2.user_id) as member_count,
                (SELECT pm3.party_id FROM party_members pm3 WHERE pm3.party_id=p.id AND pm3.user_id=?) as joined
         FROM parties p
         JOIN users u ON u.id = p.gm_id
         LEFT JOIN party_members pm2 ON pm2.party_id = p.id
         WHERE p.is_active = 1
         GROUP BY p.id
         ORDER BY p.created_at DESC`,
        [userId]
      )
      return reply.send(parties)
    }
  })

  // ── POST /api/parties ────────────────────────────────
  fastify.post('/', { preHandler: gmOnly }, async (req, reply) => {
    const { name, description } = req.body
    if (!name?.trim()) return reply.code(400).send({ error: 'Назва обов\'язкова' })

    dbRun(
      'INSERT INTO parties (name, description, gm_id) VALUES (?, ?, ?)',
      [name.trim(), description || '', req.user.userId]
    )
    const party = dbGet('SELECT * FROM parties WHERE gm_id = ? ORDER BY id DESC LIMIT 1', [req.user.userId])
    saveToDB()
    return reply.code(201).send(party)
  })

  // ── GET /api/parties/:id ─────────────────────────────
  fastify.get('/:id', async (req, reply) => {
    const party = dbGet('SELECT * FROM parties WHERE id = ?', [req.params.id])
    if (!party) return reply.code(404).send({ error: 'Пачку не знайдено' })

    // Члени з персонажами
    const members = dbAll(
      `SELECT u.id as user_id, u.username, u.role,
              c.id as char_id, c.slot_name, c.sheet_data
       FROM party_members pm
       JOIN users u ON u.id = pm.user_id
       LEFT JOIN characters c ON c.id = pm.char_id
       WHERE pm.party_id = ?`,
      [req.params.id]
    )

    return reply.send({
      ...party,
      members: members.map(m => ({
        userId:    m.user_id,
        username:  m.username,
        charId:    m.char_id,
        slotName:  m.slot_name,
        sheetData: m.sheet_data ? JSON.parse(m.sheet_data) : {},
      })),
    })
  })

  // ── POST /api/parties/:id/join ───────────────────────
  // Гравець приєднується до пачки, вибираючи персонажа
  fastify.post('/:id/join', async (req, reply) => {
    const { userId } = req.user
    const { charId }  = req.body
    const partyId     = req.params.id

    const party = dbGet('SELECT id, is_active FROM parties WHERE id = ?', [partyId])
    if (!party || !party.is_active) return reply.code(404).send({ error: 'Пачку не знайдено' })

    // Перевіряємо що персонаж належить юзеру
    const charIdInt = charId ? parseInt(charId) : null
    if (charIdInt) {
      const char = dbGet('SELECT id FROM characters WHERE id = ? AND user_id = ?', [charIdInt, userId])
      if (!char) return reply.code(403).send({ error: 'Персонаж не ваш' })
    }

    // Upsert. Одна активна пачка на гравця: спершу прибираємо з усіх інших пачок,
    // щоб joined-галочка стояла РІВНО на одній — тій, де гравець зараз.
    dbRun('DELETE FROM party_members WHERE user_id = ? AND party_id != ?', [userId, partyId])
    const existing = dbGet('SELECT * FROM party_members WHERE party_id = ? AND user_id = ?', [partyId, userId])
    if (existing) {
      dbRun('UPDATE party_members SET char_id = ? WHERE party_id = ? AND user_id = ?', [charIdInt || null, partyId, userId])
    } else {
      dbRun('INSERT INTO party_members (party_id, user_id, char_id) VALUES (?, ?, ?)', [partyId, userId, charIdInt || null])
    }
    saveToDB()

    logAction({ userId, charId: charIdInt, actor: req.user.username || 'Гравець', type: 'party',
      message: `приєднався до пачки #${partyId}` })
    return reply.send({ ok: true, partyId, userId, charId })
  })

  // ── DELETE /api/parties/:id/leave ───────────────────
  fastify.delete('/:id/leave', async (req, reply) => {
    dbRun('DELETE FROM party_members WHERE party_id = ? AND user_id = ?', [req.params.id, req.user.userId])
    saveToDB()
    return reply.send({ ok: true })
  })

  // ── DELETE /api/parties/:id/members/:userId ─────────
  // GM видаляє конкретного гравця з пачки
  fastify.delete('/:id/members/:userId', { preHandler: gmOnly }, async (req, reply) => {
    const party = dbGet('SELECT id FROM parties WHERE id = ? AND gm_id = ?', [req.params.id, req.user.userId])
    if (!party) return reply.code(404).send({ error: 'Пачку не знайдено' })
    dbRun('DELETE FROM party_members WHERE party_id = ? AND user_id = ?', [req.params.id, req.params.userId])
    saveToDB()
    return reply.send({ ok: true, removed: Number(req.params.userId) })
  })

  // ── DELETE /api/parties/:id ──────────────────────────
  fastify.delete('/:id', { preHandler: gmOnly }, async (req, reply) => {
    const party = dbGet('SELECT id FROM parties WHERE id = ? AND gm_id = ?', [req.params.id, req.user.userId])
    if (!party) return reply.code(404).send({ error: 'Пачку не знайдено' })
    dbRun('DELETE FROM party_members WHERE party_id = ?', [req.params.id])
    dbRun('DELETE FROM parties WHERE id = ?', [req.params.id])
    saveToDB()
    return reply.send({ ok: true })
  })

  // ── PATCH /api/parties/:id ───────────────────────────
  fastify.patch('/:id', { preHandler: gmOnly }, async (req, reply) => {
    const { name, description, is_active } = req.body
    const party = dbGet('SELECT id FROM parties WHERE id = ? AND gm_id = ?', [req.params.id, req.user.userId])
    if (!party) return reply.code(404).send({ error: 'Пачку не знайдено' })

    const updates = []
    const vals    = []
    if (name        !== undefined) { updates.push('name = ?');        vals.push(name.trim()) }
    if (description !== undefined) { updates.push('description = ?'); vals.push(description) }
    if (is_active   !== undefined) { updates.push('is_active = ?');   vals.push(is_active ? 1 : 0) }

    if (updates.length) {
      vals.push(req.params.id)
      dbRun(`UPDATE parties SET ${updates.join(', ')} WHERE id = ?`, vals)
      saveToDB()
    }
    return reply.send(dbGet('SELECT * FROM parties WHERE id = ?', [req.params.id]))
  })

  // ── POST /api/parties/:id/transfer ───────────────────
  // Передача грошей або предметів між гравцями пачки
  // { toUserId, type: 'money'|'item', gold?, silver?, copper?, item?, listId? }
  fastify.post('/:id/transfer', { preHandler: fastify.authenticate }, async (req, reply) => {
    const fromUserId = req.user.userId
    const partyId    = req.params.id
    const { toUserId, type, gold=0, silver=0, copper=0, rowIndex, rowId, listId } = req.body

    // Перевіряємо що обидва в цій пачці
    const fromMember = dbGet('SELECT char_id FROM party_members WHERE party_id=? AND user_id=?', [partyId, fromUserId])
    const toMember   = dbGet('SELECT char_id FROM party_members WHERE party_id=? AND user_id=?', [partyId, toUserId])
    if (!fromMember || !toMember) return reply.code(403).send({ error: 'Обидва гравці мають бути в пачці' })

    // Беремо АКТИВНОГО персонажа (is_active=1), а не зафіксованого при join.
    // char_id у party_members фіксується при вступі і може не збігатись з поточним персонажем.
    const fromChar = dbGet('SELECT * FROM characters WHERE user_id=? AND is_active=1', [fromUserId])
                  || dbGet('SELECT * FROM characters WHERE id=? AND user_id=?', [fromMember.char_id, fromUserId])
    const toChar   = dbGet('SELECT * FROM characters WHERE user_id=? AND is_active=1', [toUserId])
                  || dbGet('SELECT * FROM characters WHERE id=?', [toMember.char_id])
    if (!fromChar || !toChar) return reply.code(404).send({ error: 'Персонажа не знайдено' })

    const fromSheet = JSON.parse(fromChar.sheet_data || '{}')
    const toSheet   = JSON.parse(toChar.sheet_data   || '{}')

    if (type === 'money') {
      // Перевіряємо чи вистачає грошей
      const g = parseInt(fromSheet.gold)||0
      const s = parseInt(fromSheet.silver)||0
      const c = parseInt(fromSheet.copper)||0
      if (gold>g || silver>s || copper>c) {
        return reply.code(400).send({ error: 'Недостатньо коштів' })
      }
      fromSheet.gold   = String(g - parseInt(gold)||0)
      fromSheet.silver = String(s - parseInt(silver)||0)
      fromSheet.copper = String(c - parseInt(copper)||0)
      toSheet.gold   = String((parseInt(toSheet.gold)||0)   + (parseInt(gold)||0))
      toSheet.silver = String((parseInt(toSheet.silver)||0) + (parseInt(silver)||0))
      toSheet.copper = String((parseInt(toSheet.copper)||0) + (parseInt(copper)||0))
    } else if (type === 'item') {
      const srcKey  = `_inv_${listId}`
      const destKey = '_inv_inv-main'
      if (!listId || !Array.isArray(fromSheet[srcKey])) {
        return reply.code(400).send({ error: 'Список не знайдено' })
      }
      // Шукаємо предмет за стабільним _id (надійніше за позицію).
      let idx = -1
      if (rowId) idx = fromSheet[srcKey].findIndex(r => getRowId(srcKey, r) === rowId)
      if (idx === -1 && rowIndex !== undefined && rowIndex !== null) {
        const i = parseInt(rowIndex, 10)
        if (i >= 0 && i < fromSheet[srcKey].length) idx = i
      }
      if (idx === -1) return reply.code(400).send({ error: 'Предмет не знайдено' })

      // Знімаємо у відправника, додаємо отримувачу як НОВИЙ рядок (новий _id)
      const movedItem = { ...fromSheet[srcKey][idx] }
      fromSheet[srcKey].splice(idx, 1)
      req._removedRowId = getRowId(srcKey, movedItem)

      if (!Array.isArray(toSheet[destKey])) toSheet[destKey] = []
      const newRow = { ...movedItem, _id: genId() }
      toSheet[destKey].push(newRow)
      req._addedRow = newRow
      req._movedItemName = movedItem.name || 'предмет'
    }

    // Зберігаємо обидва листи
    dbRun(`UPDATE characters SET sheet_data=?, updated_at=datetime('now') WHERE id=?`, [JSON.stringify(fromSheet), fromChar.id])
    dbRun(`UPDATE characters SET sheet_data=?, updated_at=datetime('now') WHERE id=?`, [JSON.stringify(toSheet),   toChar.id])
    saveToDB()

    const toUsername = dbGet('SELECT username FROM users WHERE id=?', [toUserId])?.username || '?'
    const fromUsername = dbGet('SELECT username FROM users WHERE id=?', [fromUserId])?.username || '?'

    // SSE. Для предметів шлемо ОПЕРАЦІЇ (remove/add) за _id — без перезапису масивів.
    // Для грошей — патч скалярних полів (безпечно, конфліктів нема).
    if (type === 'item') {
      const srcKey = `_inv_${listId}`
      // Відправнику: прибрати рядок за _id
      emitToUser(fromUserId, 'collection_op', {
        charId: fromChar.id,
        op: { collection: srcKey, action: 'remove', rowId: req._removedRowId },
      })
      // Отримувачу: додати новий рядок
      emitToUser(toUserId, 'collection_op', {
        charId: toChar.id,
        op: { collection: '_inv_inv-main', action: 'add', row: req._addedRow, rowId: req._addedRow._id },
      })
      // GM-панель — ті самі операції
      emitToGMs('collection_op', { charId: fromChar.id, userId: fromUserId, op: { collection: srcKey, action: 'remove', rowId: req._removedRowId } })
      emitToGMs('collection_op', { charId: toChar.id, userId: toUserId, op: { collection: '_inv_inv-main', action: 'add', row: req._addedRow, rowId: req._addedRow._id } })
    } else {
      // Гроші — патч полів
      const fromMoney = { gold: fromSheet.gold, silver: fromSheet.silver, copper: fromSheet.copper }
      const toMoney   = { gold: toSheet.gold,   silver: toSheet.silver,   copper: toSheet.copper }
      emitToUser(fromUserId, 'sheet_update', { charId: fromChar.id, patches: fromMoney, action: 'transfer' })
      emitToUser(toUserId,   'sheet_update', { charId: toChar.id,   patches: toMoney,   action: 'transfer' })
      emitToGMs('player_sheet_update', { charId: fromChar.id, userId: fromUserId, sheetData: fromSheet })
      emitToGMs('player_sheet_update', { charId: toChar.id,   userId: toUserId,   sheetData: toSheet   })
    }

    // Тост-нотифікації про передачу (окрема легка подія, без даних листа)
    emitToUser(fromUserId, 'transfer_done', { direction: 'sent', toUsername, type, gold, silver, copper, itemName: req._movedItemName || '' })
    emitToUser(toUserId,   'transfer_done', { direction: 'received', fromUsername, type, gold, silver, copper, itemName: req._movedItemName || '' })

    return reply.send({ ok: true, sheetData: fromSheet })
  })

  // ── Кидок кубиків ──
  // Справжній рандом через crypto.randomInt (CSPRNG), не Math.random.
  // Результат розсилається всім у пачці гравця (і GM) через SSE 'dice_roll'.
  fastify.post('/roll', async (req, reply) => {
    const userId = req.user.userId
    const { sides, count = 1, modifier = 0, charName = '', mode = null } = req.body || {}
    const allowed = [2, 4, 6, 8, 10, 12, 20, 100]
    const d = parseInt(sides)
    if (!allowed.includes(d)) return reply.code(400).send({ error: 'Невідома кістка' })
    // Перевага/недолік: лише для d20 — кидаються 2 кістки, береться більша/менша
    const advMode = (mode === 'adv' || mode === 'dis') && d === 20 ? mode : null
    const n = advMode ? 2 : Math.min(Math.max(parseInt(count) || 1, 1), 20)
    const mod = parseInt(modifier) || 0

    // Кидки справжнім CSPRNG
    const rolls = []
    for (let i = 0; i < n; i++) rolls.push(randomInt(1, d + 1)) // [1, d]
    const sum = rolls.reduce((a, b) => a + b, 0)
    const picked = advMode ? (advMode === 'adv' ? Math.max(...rolls) : Math.min(...rolls)) : null
    const total = (advMode ? picked : sum) + mod

    // Знайти пачку гравця → розіслати всім її членам
    const member = dbGet('SELECT party_id FROM party_members WHERE user_id = ?', [userId])
    const payload = {
      id: randomUUID(),
      userId, charName: charName || 'Герой',
      partyId: member?.party_id || null,
      sides: d, count: n, modifier: mod,
      rolls, sum, total,
      mode: advMode, picked,
      ts: Date.now(),
    }
    if (member?.party_id) {
      const mates = dbAll('SELECT user_id FROM party_members WHERE party_id = ?', [member.party_id])
      const ids = mates.map(m => m.user_id)
      emitToUsers(ids, 'dice_roll', payload)
    } else {
      // поза пачкою — лише собі та GM
      emitToUsers([userId], 'dice_roll', payload)
    }
    logAction({ userId, charId: null, actor: payload.charName, type: 'roll', partyId: member?.party_id || null,
      message: `кинув ${advMode ? 'd20 ' + (advMode==='adv'?'ПЕР':'НЕД') : n + 'd' + d}${mod ? (mod>0?'+':'')+mod : ''} = ${total} [${rolls.join(', ')}]` })
    return reply.send(payload)
  })
}
