// routes/characters.js
import { dbGet, dbAll, dbRun, saveToDB, logAction } from '../db.js'
import { emitToGMs } from '../sse.js'
import { applyOp, isCollection } from '../collections.js'

const MAX_CHARS = 10

function parseSheet(row) {
  try { return JSON.parse(row.sheet_data || '{}') } catch { return {} }
}

function toListItem(row) {
  const sd = parseSheet(row)
  return {
    _id:       row.id,
    slotName:  row.slot_name,
    isActive:  row.is_active === 1 || row.is_active === '1',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    preview: {
      name_known: sd.name_known || '',
      race:       sd.race       || '',
      level:      sd.level      || '0',
    },
  }
}

export default async function characterRoutes(fastify) {
  fastify.addHook('preHandler', fastify.authenticate)

  fastify.get('/', async (req, reply) => {
    const rows = dbAll(
      'SELECT * FROM characters WHERE user_id = ? ORDER BY created_at ASC',
      [req.user.userId]
    )
    return reply.send(rows.map(toListItem))
  })

  fastify.get('/:id', async (req, reply) => {
    const row = dbGet(
      'SELECT * FROM characters WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.userId]
    )
    if (!row) return reply.code(404).send({ error: 'Персонажа не знайдено' })
    return reply.send({ ...toListItem(row), sheetData: parseSheet(row) })
  })

  fastify.post('/', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          slotName:  { type: 'string', maxLength: 60 },
          sheetData: { type: 'object', additionalProperties: true },
        },
      },
    },
  }, async (req, reply) => {
    const count = dbGet(
      'SELECT COUNT(*) as n FROM characters WHERE user_id = ?',
      [req.user.userId]
    ).n

    if (count >= MAX_CHARS) {
      return reply.code(400).send({ error: `Максимум ${MAX_CHARS} персонажів` })
    }

    const slotName  = req.body?.slotName?.trim() || ''
    const sheetData = JSON.stringify(req.body?.sheetData || {})
    const isActive  = count === 0 ? 1 : 0

    dbRun(
      'INSERT INTO characters (user_id, slot_name, is_active, sheet_data) VALUES (?, ?, ?, ?)',
      [req.user.userId, slotName, isActive, sheetData]
    )
    saveToDB()

    const row = dbGet(
      'SELECT * FROM characters WHERE user_id = ? ORDER BY id DESC LIMIT 1',
      [req.user.userId]
    )
    return reply.code(201).send(toListItem(row))
  })

  // Журнал: порівнюємо ключові поля до/після збереження гравцем
  const DIFF_FIELDS = [
    ['res-cur-hp','ХП'], ['res-cur-mp','Одхі'], ['res-cur-mt','Ментальність'], ['res-cur-ed','Витривалість'],
    ['gold','золото'], ['silver','срібло'], ['copper','мідь'], ['platinum','платина'],
    ['crits','крити'], ['luck','удача'],
  ]
  function logSheetDiff(userId, charId, oldS, newS) {
    const actor = newS.name_known || newS.name_full || oldS.name_known || 'Герой'
    const bits = []
    for (const [key, label] of DIFF_FIELDS) {
      const a = oldS[key], b = newS[key]
      if (a !== undefined || b !== undefined) {
        const av = parseFloat(a) || 0, bv = parseFloat(b) || 0
        if (av !== bv) bits.push(`${label} ${av}→${bv}`)
      }
    }
    if (bits.length) {
      const type = bits.some(b => /^(ХП|Одхі|Ментальність|Витривалість)/.test(b)) ? 'hp'
                 : bits.some(b => /^(крити|удача)/.test(b)) ? 'gm'
                 : 'money'
      logAction({ userId, charId, actor, type, message: bits.join(', ') })
    }
  }

  fastify.put('/:id', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          slotName:  { type: 'string', maxLength: 60 },
          sheetData: { type: 'object', additionalProperties: true },
          patch:     { type: 'object', additionalProperties: true },
        },
      },
    },
  }, async (req, reply) => {
    const row = dbGet(
      'SELECT id, sheet_data FROM characters WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.userId]
    )
    if (!row) return reply.code(404).send({ error: 'Персонажа не знайдено' })

    const parts = ["updated_at = datetime('now')"]
    const vals  = []
    if (req.body.slotName !== undefined) { parts.push('slot_name = ?'); vals.push(req.body.slotName.trim()) }

    // Поля, якими керує ТІЛЬКИ GM — гравець не може їх змінювати через автозбереження.
    const GM_FIELDS = ['level', 'xp_current']
    const dbSheet = (() => { try { return JSON.parse(row.sheet_data || '{}') } catch { return {} } })()

    let touchedSheet = false
    let mergedOut = null
    if (req.body.patch && typeof req.body.patch === 'object') {
      // Дельта: накладаємо лише змінені гравцем поля на свіжий лист із БД.
      // Так зміни GM (в інших полях) не затираються застарілим повним знімком гравця.
      const merged = { ...dbSheet, ...req.body.patch }
      for (const k of GM_FIELDS) { if (k in dbSheet) merged[k] = dbSheet[k] }
      parts.push('sheet_data = ?'); vals.push(JSON.stringify(merged))
      touchedSheet = true; mergedOut = merged
    } else if (req.body.sheetData !== undefined) {
      // Legacy: повна заміна (з захистом GM-полів)
      const merged = { ...req.body.sheetData }
      for (const k of GM_FIELDS) { if (k in dbSheet) merged[k] = dbSheet[k] }
      parts.push('sheet_data = ?'); vals.push(JSON.stringify(merged))
      touchedSheet = true; mergedOut = merged
    }

    vals.push(req.params.id, req.user.userId)
    dbRun(`UPDATE characters SET ${parts.join(', ')} WHERE id = ? AND user_id = ?`, vals)
    if (touchedSheet && mergedOut) {
      logSheetDiff(req.user.userId, parseInt(req.params.id), dbSheet, mergedOut)
    }
    saveToDB()

    // 🔴 Сповіщаємо всіх GM про зміни гравця → оновлення міні-панелі в лайві
    const freshChar = dbGet('SELECT id, user_id, sheet_data, slot_name FROM characters WHERE id = ?', [req.params.id])
    if (freshChar && touchedSheet) {
      emitToGMs('player_sheet_update', {
        charId:    freshChar.id,
        userId:    req.user.userId,
        sheetData: JSON.parse(freshChar.sheet_data || '{}'),
        slotName:  freshChar.slot_name,
      })
    }

    const updated = dbGet('SELECT updated_at FROM characters WHERE id = ?', [req.params.id])
    return reply.send({ ok: true, updatedAt: updated?.updated_at })
  })

  // ── POST /api/characters/:id/op ──────────────────────
  // Поопераційна зміна колекції (інвентар/закляття) за стабільним _id.
  // Не перезаписує весь масив → паралельні зміни гравця і GM не перетирають рядки.
  // body: { collection, action, rowId?, row?, patch?, cells?, toIndex? }
  fastify.post('/:id/op', async (req, reply) => {
    const row = dbGet('SELECT id, sheet_data FROM characters WHERE id = ? AND user_id = ?',
                      [req.params.id, req.user.userId])
    if (!row) return reply.code(404).send({ error: 'Персонажа не знайдено' })
    if (!isCollection(req.body?.collection)) return reply.code(400).send({ error: 'Невідома колекція' })

    const sheet = (() => { try { return JSON.parse(row.sheet_data || '{}') } catch { return {} } })()
    // Назву для журналу беремо ДО застосування — remove-операція не несе row
    const preRow = req.body.action === 'remove' && Array.isArray(sheet[req.body.collection])
      ? sheet[req.body.collection].find(r => r?._id === req.body.rowId)
      : null
    const res = applyOp(sheet, req.body)
    if (!res.ok) return reply.code(400).send({ error: res.error || 'Помилка операції' })

    dbRun(`UPDATE characters SET sheet_data = ?, updated_at = datetime('now') WHERE id = ?`,
          [JSON.stringify(sheet), row.id])
    saveToDB()

    // Розсилаємо саму операцію (не весь лист) усім GM — вони застосують її локально
    emitToGMs('collection_op', { charId: row.id, userId: req.user.userId, op: res.op })

    // Журнал: створення/видалення у колекціях — з місцем дії та причиною
    if (res.op?.action === 'add' || res.op?.action === 'remove') {
      const actor = sheet.name_known || sheet.name_full || 'Герой'
      const coll = String(req.body.collection)
      const INV_LABELS = {
        '_inv_inv-main':'Загальне', '_inv_inv-quest':'Квест', '_inv_inv-tools':'Дрібниці',
        '_inv_inv-books':'Книги', '_inv_inv-ingredients':'Інгредієнти', '_inv_inv-potions':'Зілля',
        '_inv_inv-horse':'Кінь/Візок',
      }
      const COLL_INFO = {
        '_spells':       { what:'закляття',  type:'spell', place:'Закляття' },
        '_effects':      { what:'ефект',     type:'note',  place:'Загальне' },
        '_traits_v2':    { what:'рису',      type:'note',  place:'Загальне' },
        '_quirks':       { what:'квірк',     type:'note',  place:'Загальне' },
        '_languages':    { what:'мову',      type:'note',  place:'Загальне' },
        '_recipes':      { what:'рецепт',    type:'note',  place:'Знання' },
        '_technologies': { what:'технологію',type:'note',  place:'Знання' },
      }
      const info = COLL_INFO[coll] || (coll.startsWith('_inv_')
        ? { what:'предмет', type:'item', place: INV_LABELS[coll] || 'Інвентар' }
        : { what:'запис', type:'note', place:'' })
      const name = res.op.row?.name || req.body.row?.name || preRow?.name || ''
      const reason = req.body.reason   // 'equip' | 'unequip' від екіпірування
      const verb = reason === 'equip' ? 'одягнув' : reason === 'unequip' ? 'зняв'
                 : res.op.action === 'add' ? (info.type==='note' ? 'додав' : 'створив') : 'видалив'
      logAction({ userId: req.user.userId, charId: row.id, actor,
        type: reason ? 'item' : info.type,
        message: `${verb} ${info.what}${name ? ` «${name}»` : ''}${info.place ? ` · ${info.place}` : ''}` })
    }

    return reply.send({ ok: true, op: res.op })
  })

  fastify.patch('/:id/activate', {
    schema: { body: { type: 'object', additionalProperties: true } },
  }, async (req, reply) => {
    const row = dbGet(
      'SELECT id FROM characters WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.userId]
    )
    if (!row) return reply.code(404).send({ error: 'Персонажа не знайдено' })

    dbRun('UPDATE characters SET is_active = 0 WHERE user_id = ?', [req.user.userId])
    dbRun('UPDATE characters SET is_active = 1 WHERE id = ?', [req.params.id])
    // Синхронізуємо активного персонажа у пачках: якщо гравець перемкнувся на іншого
    // персонажа, пачка має показувати саме його (інакше GM бачить попереднього).
    dbRun('UPDATE party_members SET char_id = ? WHERE user_id = ?', [req.params.id, req.user.userId])
    saveToDB()

    return reply.send({ ok: true })
  })

  fastify.delete('/:id', async (req, reply) => {
    const count = dbGet(
      'SELECT COUNT(*) as n FROM characters WHERE user_id = ?',
      [req.user.userId]
    ).n
    if (count <= 1) return reply.code(400).send({ error: 'Не можна видалити останнього персонажа' })

    const row = dbGet(
      'SELECT id, is_active FROM characters WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.userId]
    )
    if (!row) return reply.code(404).send({ error: 'Персонажа не знайдено' })

    dbRun('DELETE FROM characters WHERE id = ?', [req.params.id])

    if (row.is_active === 1 || row.is_active === '1') {
      const first = dbGet(
        'SELECT id FROM characters WHERE user_id = ? ORDER BY created_at ASC LIMIT 1',
        [req.user.userId]
      )
      if (first) dbRun('UPDATE characters SET is_active = 1 WHERE id = ?', [first.id])
    }
    saveToDB()

    return reply.send({ ok: true })
  })
}
