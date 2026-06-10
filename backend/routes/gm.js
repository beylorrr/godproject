// routes/gm.js — GM дії: XP, урон, очки + база предметів
import { dbGet, dbAll, dbRun, saveToDB, logAction } from '../db.js'
import { emitSheetPatch, emitToUser, emitToUsers, emitToGMs } from '../sse.js'
import { randomInt, randomUUID } from 'node:crypto'
import { applyOp, isCollection } from '../collections.js'

// XP → рівень: кожен рівень коштує (lvl+1)*50 xp
// При підвищенні рівня: +8 очок вмінь, +6 очок характеристик
function applyXP(sheetData, amount) {
  let xp      = parseInt(sheetData.xp_current) || 0
  let level   = parseInt(sheetData.level) || 0
  let skillPts= parseInt(sheetData.skill_pts) || 0
  let statPts = parseInt(sheetData.stat_pts)  || 0

  xp += amount
  const leveled = []

  while (xp >= (level + 1) * 50) {
    xp     -= (level + 1) * 50
    level++
    skillPts += 8
    statPts  += 6
    leveled.push(level)
  }

  return {
    ...sheetData,
    xp_current: String(xp),
    level:      String(level),
    skill_pts:  String(skillPts),
    stat_pts:   String(statPts),
  }
}

// ── Спільні операції (повертають { patch, meta } для SSE) ──
function opXP(sheet, amount) {
  const newSheet  = applyXP(sheet, parseInt(amount))
  const leveledUp = parseInt(newSheet.level) > parseInt(sheet.level || '0')
  return {
    sheet: newSheet,
    patch: { xp_current: newSheet.xp_current, level: newSheet.level, skill_pts: newSheet.skill_pts, stat_pts: newSheet.stat_pts },
    meta:  { action: 'xp', amount: parseInt(amount), leveledUp, newLevel: parseInt(newSheet.level) },
  }
}
function opResource(sheet, resource, amount, dir) {
  const curKey = `res-cur-${resource}`
  const maxKey = `res-max-${resource}`
  const cur    = parseFloat(sheet[curKey]) || 0
  const max    = parseFloat(sheet[maxKey]) || 999
  const newVal = dir === 'heal' ? Math.min(max, cur + parseInt(amount)) : Math.max(0, cur - parseInt(amount))
  const newSheet = { ...sheet, [curKey]: String(newVal) }
  return { sheet: newSheet, patch: { [curKey]: String(newVal) }, meta: { action: dir, resource, amount: parseInt(amount) } }
}
function opPts(sheet, { skillPts = 0, statPts = 0, crits = 0, luck = 0, gold = 0, silver = 0, copper = 0 }) {
  const ns = { ...sheet }
  if (skillPts) ns.skill_pts = String((parseInt(ns.skill_pts) || 0) + parseInt(skillPts))
  if (statPts)  ns.stat_pts  = String((parseInt(ns.stat_pts)  || 0) + parseInt(statPts))
  if (crits)    ns.crits     = String((parseInt(ns.crits)     || 0) + parseInt(crits))
  if (luck)     ns.luck      = String((parseInt(ns.luck)      || 0) + parseInt(luck))
  if (gold)     ns.gold      = String((parseInt(ns.gold)      || 0) + parseInt(gold))
  if (silver)   ns.silver    = String((parseInt(ns.silver)    || 0) + parseInt(silver))
  if (copper)   ns.copper    = String((parseInt(ns.copper)    || 0) + parseInt(copper))
  return {
    sheet: ns,
    patch: { skill_pts: ns.skill_pts, stat_pts: ns.stat_pts, crits: ns.crits, luck: ns.luck, gold: ns.gold, silver: ns.silver, copper: ns.copper },
    meta:  { action: 'award_pts' },
  }
}

export default async function gmRoutes(fastify) {

  fastify.addHook('preHandler', fastify.authenticate)

  function gmOnly(req, reply, done) {
    if (req.user.role !== 'gm' && req.user.role !== 'admin') {
      return reply.code(403).send({ error: 'Тільки для GM' })
    }
    done()
  }

  // ── POST /api/gm/award-xp ──────────────────────────
  // { charId, amount, note }
  fastify.post('/award-xp', { preHandler: gmOnly }, async (req, reply) => {
    const { charId, amount, note } = req.body
    if (!charId || !amount) return reply.code(400).send({ error: 'charId і amount обов\'язкові' })

    const char = dbGet('SELECT * FROM characters WHERE id = ?', [charId])
    if (!char) return reply.code(404).send({ error: 'Персонажа не знайдено' })

    const oldSheet  = JSON.parse(char.sheet_data || '{}')
    const newSheet  = applyXP(oldSheet, parseInt(amount))
    const leveledUp = parseInt(newSheet.level) > parseInt(oldSheet.level || '0')

    dbRun(`UPDATE characters SET sheet_data = ?, updated_at = datetime('now') WHERE id = ?`,
          [JSON.stringify(newSheet), charId])

    // Логуємо дію
    dbRun(`INSERT INTO gm_actions (gm_id, target_char, action, value, note) VALUES (?, ?, 'xp', ?, ?)`,
          [req.user.userId, charId, amount, note || ''])
    saveToDB()

    // 🔴 Live-оновлення: гравець побачить зміни без перезавантаження
    emitSheetPatch(char, {
      xp_current: newSheet.xp_current,
      level:      newSheet.level,
      skill_pts:  newSheet.skill_pts,
      stat_pts:   newSheet.stat_pts,
    }, { action: 'xp', amount, leveledUp, newLevel: parseInt(newSheet.level), note: note || '' })
    // Оновлюємо список гравців у GM-панелі
    emitToUser(req.user.userId, 'gm_action_done', { charId })
    logAction({ userId: req.user.userId, charId, actor: 'Майстер', type: 'gm',
      message: `нарахував ${amount} XP «${newSheet.name_known || char.slot_name}»${leveledUp ? ` — рівень ${newSheet.level}!` : ''}` })

    return reply.send({
      ok:       true,
      charId,
      leveledUp,
      oldLevel: parseInt(oldSheet.level || '0'),
      newLevel: parseInt(newSheet.level),
      xp:       newSheet.xp_current,
      skill_pts: newSheet.skill_pts,
      stat_pts:  newSheet.stat_pts,
    })
  })

  // ── POST /api/gm/damage ─────────────────────────────
  // { charId, resource, amount, note }  resource: hp|mp|mt|ed
  fastify.post('/damage', { preHandler: gmOnly }, async (req, reply) => {
    const { charId, resource = 'hp', amount, note } = req.body
    if (!charId || amount === undefined) return reply.code(400).send({ error: 'charId і amount обов\'язкові' })

    const char = dbGet('SELECT * FROM characters WHERE id = ?', [charId])
    if (!char) return reply.code(404).send({ error: 'Персонажа не знайдено' })

    const sheet  = JSON.parse(char.sheet_data || '{}')
    const curKey = `res-cur-${resource}`
    const cur    = parseFloat(sheet[curKey]) || 0
    const newVal = Math.max(0, cur - parseInt(amount))
    sheet[curKey] = String(newVal)

    dbRun(`UPDATE characters SET sheet_data = ?, updated_at = datetime('now') WHERE id = ?`,
          [JSON.stringify(sheet), charId])
    dbRun(`INSERT INTO gm_actions (gm_id, target_char, action, value, note) VALUES (?, ?, 'damage', ?, ?)`,
          [req.user.userId, charId, amount, note || ''])
    saveToDB()

    emitSheetPatch(char, { [`res-cur-${resource}`]: String(newVal) },
      { action: 'damage', resource, amount, note: note || '' })
    emitToUser(req.user.userId, 'gm_action_done', { charId })
    logAction({ userId: req.user.userId, charId, actor: 'Майстер', type: 'gm',
      message: `завдав ${amount} урону (${resource}) «${sheet.name_known || char.slot_name}»: ${cur}→${newVal}${note ? ` (${note})` : ''}` })

    return reply.send({ ok: true, charId, resource, old: cur, new: newVal })
  })

  // ── POST /api/gm/heal ───────────────────────────────
  fastify.post('/heal', { preHandler: gmOnly }, async (req, reply) => {
    const { charId, resource = 'hp', amount, note } = req.body
    if (!charId || amount === undefined) return reply.code(400).send({ error: 'charId і amount обов\'язкові' })

    const char = dbGet('SELECT * FROM characters WHERE id = ?', [charId])
    if (!char) return reply.code(404).send({ error: 'Персонажа не знайдено' })

    const sheet  = JSON.parse(char.sheet_data || '{}')
    const curKey = `res-cur-${resource}`
    const maxKey = `res-max-${resource}`
    const cur    = parseFloat(sheet[curKey]) || 0
    const max    = parseFloat(sheet[maxKey]) || 999
    const newVal = Math.min(max, cur + parseInt(amount))
    sheet[curKey] = String(newVal)

    dbRun(`UPDATE characters SET sheet_data = ?, updated_at = datetime('now') WHERE id = ?`,
          [JSON.stringify(sheet), charId])
    dbRun(`INSERT INTO gm_actions (gm_id, target_char, action, value, note) VALUES (?, ?, 'heal', ?, ?)`,
          [req.user.userId, charId, amount, note || ''])
    saveToDB()

    emitSheetPatch(char, { [`res-cur-${resource}`]: String(newVal) },
      { action: 'heal', resource, amount, note: note || '' })
    emitToUser(req.user.userId, 'gm_action_done', { charId })
    logAction({ userId: req.user.userId, charId, actor: 'Майстер', type: 'gm',
      message: `відновив ${amount} (${resource}) «${sheet.name_known || char.slot_name}»: ${cur}→${newVal}` })

    return reply.send({ ok: true, charId, resource, old: cur, new: newVal })
  })

  // ── POST /api/gm/award-pts ──────────────────────────
  // { charId, skillPts, statPts, crits, luck, gold, silver, copper, note }
  fastify.post('/award-pts', { preHandler: gmOnly }, async (req, reply) => {
    const { charId, skillPts = 0, statPts = 0, crits = 0, luck = 0, gold = 0, silver = 0, copper = 0, note } = req.body
    if (!charId) return reply.code(400).send({ error: 'charId обов\'язковий' })

    const char  = dbGet('SELECT * FROM characters WHERE id = ?', [charId])
    if (!char)  return reply.code(404).send({ error: 'Персонажа не знайдено' })

    const sheet = JSON.parse(char.sheet_data || '{}')
    if (skillPts) sheet.skill_pts = String((parseInt(sheet.skill_pts) || 0) + parseInt(skillPts))
    if (statPts)  sheet.stat_pts  = String((parseInt(sheet.stat_pts)  || 0) + parseInt(statPts))
    if (crits)    sheet.crits     = String((parseInt(sheet.crits)     || 0) + parseInt(crits))
    if (luck)     sheet.luck      = String((parseInt(sheet.luck)      || 0) + parseInt(luck))
    if (gold)     sheet.gold      = String((parseInt(sheet.gold)      || 0) + parseInt(gold))
    if (silver)   sheet.silver    = String((parseInt(sheet.silver)    || 0) + parseInt(silver))
    if (copper)   sheet.copper    = String((parseInt(sheet.copper)    || 0) + parseInt(copper))

    dbRun(`UPDATE characters SET sheet_data = ?, updated_at = datetime('now') WHERE id = ?`,
          [JSON.stringify(sheet), charId])
    dbRun(`INSERT INTO gm_actions (gm_id, target_char, action, value, note) VALUES (?, ?, 'award_pts', ?, ?)`,
          [req.user.userId, charId, skillPts + statPts, note || ''])
    saveToDB()

    const patch = {
      skill_pts: sheet.skill_pts, stat_pts: sheet.stat_pts,
      crits: sheet.crits, luck: sheet.luck,
      gold: sheet.gold, silver: sheet.silver, copper: sheet.copper,
    }
    emitSheetPatch(char, patch, { action: 'award_pts', note: note || '' })
    emitToUser(req.user.userId, 'gm_action_done', { charId })
    logAction({ userId: req.user.userId, charId, actor: 'Майстер', type: 'gm',
      message: `видав очки/ресурси «${sheet.name_known || char.slot_name}»${note ? ` (${note})` : ''}` })

    return reply.send({ ok: true, charId, patch })
  })

  // ── GET /api/gm/items ───────────────────────────────
  fastify.get('/items', { preHandler: gmOnly }, async (req, reply) => {
    const { type } = req.query
    const items = type
      ? dbAll('SELECT * FROM gm_items WHERE gm_id = ? AND type = ? ORDER BY name ASC', [req.user.userId, type])
      : dbAll('SELECT * FROM gm_items WHERE gm_id = ? ORDER BY type, name ASC', [req.user.userId])
    return reply.send(items.map(i => ({ ...i, data: JSON.parse(i.data || '{}') })))
  })

  // ── POST /api/gm/items ──────────────────────────────
  fastify.post('/items', { preHandler: gmOnly }, async (req, reply) => {
    const { type = 'item', name, description = '', data = {} } = req.body
    if (!name?.trim()) return reply.code(400).send({ error: 'Назва обов\'язкова' })

    dbRun(
      'INSERT INTO gm_items (gm_id, type, name, description, data) VALUES (?, ?, ?, ?, ?)',
      [req.user.userId, type, name.trim(), description, JSON.stringify(data)]
    )
    const item = dbGet('SELECT * FROM gm_items WHERE gm_id = ? ORDER BY id DESC LIMIT 1', [req.user.userId])
    saveToDB()
    return reply.code(201).send({ ...item, data: JSON.parse(item.data) })
  })

  // ── PUT /api/gm/items/:id ───────────────────────────
  fastify.put('/items/:id', { preHandler: gmOnly }, async (req, reply) => {
    const item = dbGet('SELECT id FROM gm_items WHERE id = ? AND gm_id = ?', [req.params.id, req.user.userId])
    if (!item) return reply.code(404).send({ error: 'Предмет не знайдено' })

    const { type, name, description, data } = req.body
    const updates = ["updated_at = datetime('now')"]
    const vals    = []
    if (type        !== undefined) { updates.push('type = ?');        vals.push(type) }
    if (name        !== undefined) { updates.push('name = ?');        vals.push(name.trim()) }
    if (description !== undefined) { updates.push('description = ?'); vals.push(description) }
    if (data        !== undefined) { updates.push('data = ?');        vals.push(JSON.stringify(data)) }

    vals.push(req.params.id)
    dbRun(`UPDATE gm_items SET ${updates.join(', ')} WHERE id = ?`, vals)
    saveToDB()

    const updated = dbGet('SELECT * FROM gm_items WHERE id = ?', [req.params.id])
    return reply.send({ ...updated, data: JSON.parse(updated.data) })
  })

  // ── DELETE /api/gm/items/:id ────────────────────────
  fastify.delete('/items/:id', { preHandler: gmOnly }, async (req, reply) => {
    dbRun('DELETE FROM gm_items WHERE id = ? AND gm_id = ?', [req.params.id, req.user.userId])
    saveToDB()
    return reply.send({ ok: true })
  })

  // ── GET /api/gm/actions ─────────────────────────────
  fastify.get('/actions', { preHandler: gmOnly }, async (req, reply) => {
    const actions = dbAll(
      `SELECT ga.*, u.username, c.slot_name
       FROM gm_actions ga
       JOIN characters c ON c.id = ga.target_char
       JOIN users u ON u.id = c.user_id
       WHERE ga.gm_id = ?
       ORDER BY ga.created_at DESC LIMIT 100`,
      [req.user.userId]
    )
    return reply.send(actions)
  })

  // ── GET /api/gm/char/:id ────────────────────────────
  // Повний лист персонажа для перегляду GM
  fastify.get('/char/:id', { preHandler: gmOnly }, async (req, reply) => {
    const char = dbGet('SELECT c.*, u.username FROM characters c JOIN users u ON u.id = c.user_id WHERE c.id = ?', [req.params.id])
    if (!char) return reply.code(404).send({ error: 'Персонажа не знайдено' })
    return reply.send({
      charId:    char.id,
      username:  char.username,
      slotName:  char.slot_name,
      sheetData: JSON.parse(char.sheet_data || '{}'),
    })
  })

  // ── PUT /api/gm/char/:id ────────────────────────────
  // GM редагує лист гравця. Підтримує два режими:
  //   { patch: {...} }      — дельта: мержимо ТІЛЬКИ ці поля в актуальний лист із БД
  //                           (гравець може паралельно міняти інші поля — вони не затруться)
  //   { sheetData: {...} }  — повна заміна (legacy, лишаємо для сумісності)
  // Шле SSE гравцеві лише зі зміненими полями.
  fastify.put('/char/:id', {
    preHandler: gmOnly,
    schema: {
      body: {
        type: 'object',
        properties: {
          sheetData: { type: 'object', additionalProperties: true },
          patch:     { type: 'object', additionalProperties: true },
        },
      },
    },
  }, async (req, reply) => {
    const char = dbGet('SELECT * FROM characters WHERE id = ?', [req.params.id])
    if (!char) return reply.code(404).send({ error: 'Персонажа не знайдено' })

    const dbSheet = (() => { try { return JSON.parse(char.sheet_data || '{}') } catch { return {} } })()

    let newSheet, emitted
    if (req.body.patch && typeof req.body.patch === 'object') {
      // Дельта: беремо свіжий лист із БД і накладаємо лише змінені поля GM.
      // Так зміни гравця в інших полях (зроблені між читанням і збереженням) не зникають.
      newSheet = { ...dbSheet, ...req.body.patch }
      emitted  = req.body.patch
    } else if (req.body.sheetData && typeof req.body.sheetData === 'object') {
      newSheet = req.body.sheetData
      emitted  = req.body.sheetData
    } else {
      return reply.code(400).send({ error: 'Потрібен patch або sheetData' })
    }

    dbRun(`UPDATE characters SET sheet_data = ?, updated_at = datetime('now') WHERE id = ?`,
          [JSON.stringify(newSheet), req.params.id])
    saveToDB()

    // Живе оновлення гравцю — лише змінені поля
    emitSheetPatch(char, emitted, { action: 'gm_edit' })

    return reply.send({ ok: true, charId: char.id })
  })

  // ── POST /api/gm/char/:id/op ────────────────────────
  // GM поопераційно змінює колекцію гравця за стабільним _id.
  // SSE 'collection_op' → гравцю (і всім іншим GM). Жодного перезапису масивів.
  fastify.post('/char/:id/op', { preHandler: gmOnly }, async (req, reply) => {
    const char = dbGet('SELECT * FROM characters WHERE id = ?', [req.params.id])
    if (!char) return reply.code(404).send({ error: 'Персонажа не знайдено' })
    if (!isCollection(req.body?.collection)) return reply.code(400).send({ error: 'Невідома колекція' })

    const sheet = (() => { try { return JSON.parse(char.sheet_data || '{}') } catch { return {} } })()
    const res = applyOp(sheet, req.body)
    if (!res.ok) return reply.code(400).send({ error: res.error || 'Помилка операції' })

    dbRun(`UPDATE characters SET sheet_data = ?, updated_at = datetime('now') WHERE id = ?`,
          [JSON.stringify(sheet), char.id])
    saveToDB()

    // Гравцю — операція як подія collection_op
    emitToUser(char.user_id, 'collection_op', { charId: char.id, op: res.op, fromGM: true })

    return reply.send({ ok: true, op: res.op })
  })

  // ── GET /api/gm/players ─────────────────────────────
  // Всі гравці з УСІМА їхніми персонажами (для видачі та призначення в пачку).
  fastify.get('/players', { preHandler: gmOnly }, async (req, reply) => {
    const users = dbAll(
      `SELECT u.id, u.username, pm.party_id, pm.char_id as member_char_id, p.name as party_name
       FROM users u
       LEFT JOIN party_members pm ON pm.user_id = u.id
       LEFT JOIN parties p ON p.id = pm.party_id
       WHERE u.role = 'player'
       ORDER BY u.username`, [])
    const out = users.map(u => {
      const chars = dbAll(
        `SELECT id, slot_name, is_active, sheet_data FROM characters
         WHERE user_id = ? ORDER BY is_active DESC, created_at ASC`, [u.id]
      ).map(ch => {
        let name = ch.slot_name
        try { const s = JSON.parse(ch.sheet_data || '{}'); name = s.name_known || s.name_full || ch.slot_name } catch {}
        return { id: ch.id, name }
      })
      const active = chars[0] || null
      return {
        userId:    u.id,
        username:  u.username,
        partyId:   u.party_id || null,
        partyName: u.party_name || null,
        memberCharId: u.member_char_id || null,
        chars,                                   // усі персонажі гравця
        // легасі-поля (видача предметів тощо)
        charId:    u.member_char_id || active?.id || null,
        charName:  (chars.find(c => c.id === u.member_char_id) || active)?.name || null,
        slotName:  active?.name || null,
      }
    })
    return reply.send(out)
  })

  // Кидок майстра: летить у вибрану пачку (або лише майстрам, якщо прихований)
  fastify.post('/roll', { preHandler: gmOnly }, async (req, reply) => {
    const { partyId, sides, count = 1, modifier = 0, mode = null, hidden = false } = req.body || {}
    const allowed = [2, 4, 6, 8, 10, 12, 20, 100]
    const d = parseInt(sides)
    if (!allowed.includes(d)) return reply.code(400).send({ error: 'Невідома кістка' })
    const advMode = (mode === 'adv' || mode === 'dis') && d === 20 ? mode : null
    const n = advMode ? 2 : Math.min(Math.max(parseInt(count) || 1, 1), 20)
    const mod = parseInt(modifier) || 0
    const rolls = []
    for (let i = 0; i < n; i++) rolls.push(randomInt(1, d + 1))
    const sum = rolls.reduce((a, b) => a + b, 0)
    const picked = advMode ? (advMode === 'adv' ? Math.max(...rolls) : Math.min(...rolls)) : null
    const total = (advMode ? picked : sum) + mod

    const payload = {
      id: randomUUID(),
      userId: req.user.userId, charName: 'Майстер', gm: true, hidden: !!hidden,
      partyId: hidden ? null : (parseInt(partyId) || null),
      sides: d, count: n, modifier: mod,
      rolls, sum, total, mode: advMode, picked,
      ts: Date.now(),
    }
    logAction({ userId: req.user.userId, actor: 'Майстер', type: 'roll', partyId: hidden ? null : (parseInt(partyId) || null),
      message: `кинув ${advMode ? 'd20 ' + (advMode==='adv'?'ПЕР':'НЕД') : n + 'd' + d}${mod ? (mod>0?'+':'')+mod : ''} = ${total}${hidden ? ' (прихований)' : ''}` })
    if (hidden) {
      // прихований кидок бачать лише майстри
      emitToGMs('dice_roll', payload)
    } else {
      const pid = parseInt(partyId)
      if (!pid) return reply.code(400).send({ error: 'Не вибрано пачку' })
      const mates = dbAll('SELECT user_id FROM party_members WHERE party_id = ?', [pid])
      emitToUsers(mates.map(m => m.user_id), 'dice_roll', payload)  // майстри отримають автоматично
    }
    return reply.send(payload)
  })

  // ── Журнал дій гравців для майстра ──
  fastify.get('/logs', { preHandler: gmOnly }, async (req, reply) => {
    const limit = Math.min(parseInt(req.query.limit) || 200, 500)
    const rows = dbAll(
      `SELECT l.*, p.name as party_name FROM action_logs l
       LEFT JOIN parties p ON p.id = l.party_id
       ORDER BY l.id DESC LIMIT ?`, [limit])
    return reply.send(rows)
  })

  // ── ГМ призначає персонажа гравця до пачки (або прибирає: partyId = null) ──
  fastify.post('/assign-party', { preHandler: gmOnly }, async (req, reply) => {
    const { userId, charId = null, partyId = null } = req.body || {}
    const uid = parseInt(userId)
    if (!uid) return reply.code(400).send({ error: 'Не вказано гравця' })
    const pid = partyId ? parseInt(partyId) : null
    if (pid) {
      const party = dbGet('SELECT id, name FROM parties WHERE id = ?', [pid])
      if (!party) return reply.code(404).send({ error: 'Пачку не знайдено' })
      // одна активна пачка на гравця — як і при самостійному приєднанні
      dbRun('DELETE FROM party_members WHERE user_id = ? AND party_id != ?', [uid, pid])
      const existing = dbGet('SELECT * FROM party_members WHERE party_id = ? AND user_id = ?', [pid, uid])
      if (existing) dbRun('UPDATE party_members SET char_id = ? WHERE party_id = ? AND user_id = ?', [charId || null, pid, uid])
      else dbRun('INSERT INTO party_members (party_id, user_id, char_id) VALUES (?, ?, ?)', [pid, uid, charId || null])
      logAction({ userId: req.user.userId, charId: charId || null, actor: 'Майстер', type: 'party',
        message: `призначив гравця #${uid} до пачки «${party.name}»` })
    } else {
      dbRun('DELETE FROM party_members WHERE user_id = ?', [uid])
      logAction({ userId: req.user.userId, actor: 'Майстер', type: 'party',
        message: `прибрав гравця #${uid} з пачки` })
    }
    saveToDB()
    return reply.send({ ok: true })
  })

  fastify.post('/batch', { preHandler: gmOnly }, async (req, reply) => {
    const { charIds = [], type, amount, resource = 'hp', skillPts = 0, statPts = 0, crits = 0, luck = 0, gold = 0, silver = 0, copper = 0, note = '' } = req.body
    if (!Array.isArray(charIds) || charIds.length === 0) return reply.code(400).send({ error: 'charIds обов\'язкові' })
    if (!['xp','damage','heal','pts'].includes(type)) return reply.code(400).send({ error: 'Невідомий type' })

    const results = []
    for (const charId of charIds) {
      const char = dbGet('SELECT * FROM characters WHERE id = ?', [charId])
      if (!char) { results.push({ charId, ok: false, error: 'not found' }); continue }
      const sheet = JSON.parse(char.sheet_data || '{}')

      let out
      if (type === 'xp')     out = opXP(sheet, amount)
      if (type === 'damage') out = opResource(sheet, resource, amount, 'damage')
      if (type === 'heal')   out = opResource(sheet, resource, amount, 'heal')
      if (type === 'pts')    out = opPts(sheet, { skillPts, statPts, crits, luck, gold, silver, copper })

      dbRun(`UPDATE characters SET sheet_data = ?, updated_at = datetime('now') WHERE id = ?`,
            [JSON.stringify(out.sheet), charId])
      dbRun(`INSERT INTO gm_actions (gm_id, target_char, action, value, note) VALUES (?, ?, ?, ?, ?)`,
            [req.user.userId, charId, out.meta.action, String(amount ?? (skillPts + statPts)), note])

      // Live-подія гравцеві
      emitSheetPatch(char, out.patch, { ...out.meta, note })
      results.push({ charId, ok: true, ...out.meta })
    }
    saveToDB()
    emitToUser(req.user.userId, 'gm_action_done', { batch: true })

    return reply.send({ ok: true, count: results.filter(r => r.ok).length, results })
  })
}
