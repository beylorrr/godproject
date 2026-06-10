import * as XLSX from 'xlsx'
import {
  SOCIAL_SKILLS, COMBAT_SKILLS, NEUTRAL_SKILLS, MAGIC_SKILLS, SCIENCE_SKILLS, CRIME_SKILLS,
} from '../data/gameData'

/**
 * Імпорт персонажа з Excel-таблиці (формат "Троль.xlsx").
 *
 * Аркуш MAIN — розкидана сітка з фіксованими блоками. Щоб імпорт переживав
 * невеликі зсуви рядків, значення шукаються за ЯКОРЯМИ-мітками (текст у клітинці),
 * а не за жорсткими координатами. Для кожної мітки беремо значення з сусідньої
 * клітинки (праворуч/знизу) залежно від блоку.
 *
 * Повертає об'єкт sheetData, сумісний зі схемою застосунку.
 */

// Координатна сітка з масиву рядків (matrix[r][c]), r,c — 0-based
function buildMatrix(ws) {
  const range = XLSX.utils.decode_range(ws['!ref'])
  const m = []
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row = []
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })]
      row.push(cell ? cell.v : null)
    }
    m.push(row)
  }
  return m
}

const txt = (v) => (v == null ? '' : String(v).trim())
// Округлення ваги — прибирає float-хвости типу 0.6000000000000001
const roundW = (n) => Math.round((Number(n) || 0) * 1000) / 1000
const num = (v) => {
  if (v == null || v === '') return 0
  const n = parseFloat(String(v).replace(',', '.'))
  return isNaN(n) ? 0 : n
}
// чи значення є текстом (не числом) — для розрізнення назв і числових клітинок
const isTextual = (v) => {
  const s = txt(v)
  if (!s) return false
  return isNaN(parseFloat(s.replace(',', '.'))) || !/^[\d.,\s]+$/.test(s)
}

// Знайти клітинку з точним текстом, повернути [r,c] або null
function find(m, label) {
  for (let r = 0; r < m.length; r++)
    for (let c = 0; c < m[r].length; c++)
      if (txt(m[r][c]) === label) return [r, c]
  return null
}

// Значення праворуч від мітки (через offset колонок)
function rightOf(m, label, off = 1) {
  const p = find(m, label)
  if (!p) return null
  const [r, c] = p
  return m[r]?.[c + off] ?? null
}

let _id = 0
const genId = () => `imp_${Date.now()}_${_id++}`

export function parseCharacterXlsx(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array' })
  const ws = wb.Sheets['MAIN'] || wb.Sheets[wb.SheetNames[0]]
  if (!ws) throw new Error('Аркуш MAIN не знайдено')
  const m = buildMatrix(ws)

  const data = {}

  // ── Ідентичність ──
  data.name_known  = txt(rightOf(m, "Відоме ім'я"))
  data.name_full   = txt(rightOf(m, 'Повне ім\'я'))
  data.race        = txt(rightOf(m, 'Раса'))
  const ageRaw     = rightOf(m, 'Вік')
  data.age         = ageRaw == null ? '' : String(num(ageRaw) || txt(ageRaw))
  data.appearance  = txt(rightOf(m, 'Зовнішність'))
  data.motivation  = txt(rightOf(m, 'Мотивація/ціль'))
  // Передісторія — великий текст у клітинці нижче мітки "Передісторія"
  const bp = find(m, 'Передісторія')
  if (bp) {
    const [r, c] = bp
    // значення праворуч або в наступному рядку тієї ж колонки
    data.backstory = txt(m[r]?.[c + 1]) || txt(m[r + 1]?.[c]) || ''
  }

  // ── XP / рівень ──
  // EXPERIENCE — мітка, значення "180/350" у клітинці нижче.
  const xpCell = belowOf(m, 'EXPERIENCE')   // напр. "180/350"
  if (xpCell && String(xpCell).includes('/')) {
    const [cur, need] = String(xpCell).split('/')
    data.xp_current = String(num(cur))
    data.xp_needed  = String(num(need))
  } else {
    const cur = belowOf(m, 'Поточна ХР')
    if (cur != null) data.xp_current = String(num(cur))
  }
  // LVL — мітка, значення в наступному рядку (D8→D9)
  const lvl = belowOf(m, 'LVL')
  if (lvl != null && num(lvl)) data.level = String(num(lvl))

  // ── Очки ──
  data.stat_pts  = String(num(rightOf(m, 'Очки характеристик')) || num(belowOf(m, 'Очки характеристик')))
  data.skill_pts = String(num(rightOf(m, 'Очки умінь')) || num(belowOf(m, 'Очки умінь')))

  // ── Характеристики ── (мітки назв у колонці, "Бали" ліворуч, "Загальне Значення" праворуч)
  const STAT_MAP = {
    'Сила': 'str', 'Тілобудова': 'con', 'Витривалість': 'end',
    'Інтелект': 'int', 'Мудрість': 'wis', 'Воля': 'will',
  }
  for (const [label, id] of Object.entries(STAT_MAP)) {
    const p = find(m, label)
    if (p) {
      const [r, c] = p
      // "Бали" — клітинка ліворуч від назви
      const bal = num(m[r]?.[c - 1])
      data[`stat-${id}`] = String(bal)
    }
  }

  // ── Ресурси (HP/OM/MT/ED) ──
  // Блок: рядок з мітками HP OM MT ED, нижче — поточні, ще нижче — макс
  setResource(m, data, 'HP', 'hp')
  setResource(m, data, 'OM', 'mp')
  setResource(m, data, 'MT', 'mt')
  setResource(m, data, 'ED', 'ed')

  // PR/MR (захист) — з блоку ARMOR
  const pr = rightOf(m, 'PR', 0) // мітка PR, значення нижче
  setResourceBelow(m, data, 'PR', 'pr')
  setResourceBelow(m, data, 'MR', 'mr')

  // ── FAME/KARMA/INFAME/STATUS/CRITS/LUCK ──
  setBelow(m, data, 'FAME', 'fame')
  setBelow(m, data, 'KARMA', 'karma')
  setBelow(m, data, 'INFAME', 'infame')
  setBelow(m, data, 'STATUS', 'status_val')
  setBelow(m, data, 'CRITS', 'crits')
  setBelow(m, data, 'LUCK', 'luck')

  // ── Активні ефекти ── (під міткою "Активні ефекти", стовпець назв)
  data._effects = parseEffects(m)

  // ── Уміння (рівні прокачки) ──
  data._skillLevels = parseSkills(m)

  // ── Гроші ──
  parseMoney(m, data)

  // ── Інвентар ──
  data['_inv_inv-main'] = parseInventory(m)

  // ── Недоліки → "Риси та недоліки" (_traits_v2) ──
  const importedTraits = parseTraits(m)
  if (importedTraits.length) data._traits_v2 = importedTraits

  // ── Інвентар коня/візка ──
  data['_inv_inv-horse'] = parseNamedInventory(m, 'Інвентар коня/візка')

  // ── Екіпірування (слоти броні) ──
  data._armor = parseArmor(m)

  // ── Зброя в руках ──
  parseWeapons(m, data)

  return data
}

// значення під міткою (наступний рядок, та сама колонка)
function belowOf(m, label, off = 1) {
  const p = find(m, label)
  if (!p) return null
  const [r, c] = p
  return m[r + off]?.[c] ?? null
}

function setBelow(m, data, label, key) {
  const v = belowOf(m, label)
  if (v != null) data[key] = String(num(v))
}

// Ресурс: мітка в рядку, поточне нижче, макс ще нижче (з MAIN: HP 550 / 350)
function setResource(m, data, label, id) {
  const p = find(m, label)
  if (!p) return
  const [r, c] = p
  const cur = m[r + 1]?.[c]
  const max = m[r + 3]?.[c]   // у MAIN макс на 2 рядки нижче поточного
  if (cur != null) data[`res-cur-${id}`] = String(num(cur))
  if (max != null && num(max)) data[`res-max-${id}`] = String(num(max))
}

function setResourceBelow(m, data, label, id) {
  const v = belowOf(m, label)
  if (v != null) data[`res-cur-${id}`] = String(num(v))
}

function parseEffects(m) {
  const p = find(m, 'Активні ефекти')
  if (!p) return []
  const [r, c] = p
  const out = []
  for (let i = 1; i <= 12; i++) {
    const row = r + i
    const numCell = m[row]?.[c]       // номер ефекту (1,2,3…)
    const name = txt(m[row]?.[c + 1]) // назва праворуч від номера
    // зупиняємось коли немає ні номера, ні назви (кінець списку ефектів)
    if (numCell == null && !name) break
    // назва має бути текстом (не число) і не службовим
    if (name && name !== 'ххх' && isTextual(name)) {
      out.push({ name, _id: genId() })
    }
  }
  return out
}

// Деякі навички в Excel названі трохи інакше, ніж у грі — зводимо до канонічних.
const SKILL_ALIASES = {
  // Назви в грі тепер точно збігаються з листом Грюмбля — аліаси не потрібні.
}

// Зіставлення назви навички з її категорією (тим самим ключем, що використовує вкладка вмінь).
const SKILL_CATEGORY = {}
function buildSkillCategoryMap() {
  if (Object.keys(SKILL_CATEGORY).length) return
  const groups = [
    ['social-skills-table',  SOCIAL_SKILLS],
    ['combat-skills-table',  COMBAT_SKILLS],
    ['neutral-skills-table', NEUTRAL_SKILLS],
    ['science-skills-table', SCIENCE_SKILLS],
    ['magic-skills-table',   MAGIC_SKILLS],
    ['crime-skills-table',   CRIME_SKILLS],
  ]
  for (const [catId, list] of groups) {
    for (const sk of list) SKILL_CATEGORY[sk.name.trim()] = catId
  }
}

function parseSkills(m) {
  // Колонки умінь шукаємо за заголовками "Володіння" (рівень) + "назва" поряд —
  // переживає зсув листа вправо. Рівень беремо суворо зі стовпця "Володіння".
  buildSkillCategoryMap()
  const levels = {}
  const colPairs = []
  for (let r = 0; r < m.length; r++) {
    for (let c = 0; c < (m[r]?.length || 0); c++) {
      if (txt(m[r][c]) === 'Володіння' && txt(m[r]?.[c + 1]) === 'назва') colPairs.push([c, c + 1])
    }
  }
  if (colPairs.length === 0) return levels
  for (let r = 0; r < m.length; r++) {
    for (const [lvlCol, nameCol] of colPairs) {
      const name = txt(m[r]?.[nameCol])
      const lvlRaw = m[r]?.[lvlCol]
      if (!name || lvlRaw == null || lvlRaw === '') continue
      const lvl = num(lvlRaw)
      if (isTextual(name) && lvl >= 1 && lvl <= 10 && Number.isInteger(lvl) && !isHeaderWord(name)) {
        const canonical = SKILL_ALIASES[name] || name
        const catId = SKILL_CATEGORY[canonical]
        if (catId) levels[`${catId}::${canonical}`] = lvl
      }
    }
  }
  return levels
}

function isHeaderWord(s) {
  return ['назва', 'Володіння', 'Соціальні', 'Бойові', 'Нейтральні',
          'Поза законом', 'Наука', 'Магічні', 'Уміння', 'Бали', 'Навички'].includes(s)
}

function parseMoney(m, data) {
  // Кожна монета за власною міткою; значення знизу або праворуч (якщо число).
  // Ключі gold/silver/copper/platinum — саме їх читає головний екран.
  const coins = [['мідь', 'copper'], ['срібло', 'silver'], ['золото', 'gold'], ['платина', 'platinum']]
  for (const [label, key] of coins) {
    const p = find(m, label)
    if (!p) continue
    const [r, c] = p
    const below = m[r + 1]?.[c]
    const right = m[r]?.[c + 1]
    let val = null
    if (below != null && below !== '' && !isTextual(below)) val = num(below)
    else if (right != null && right !== '' && !isTextual(right)) val = num(right)
    if (val != null) data[key] = String(val)
  }
}

function parseInventory(m) {
  // Блок "Інвентар": заголовок з "Кількість/Назва/Вага за од./Фізичний.../Магічний..."
  // Рядки нижче — предмети. Шукаємо мітку "Назва" в зоні інвентарю (праворуч від ефектів).
  const out = []
  // Знаходимо заголовок "Кількість" + "Назва" поруч
  let start = null
  for (let r = 0; r < m.length; r++) {
    for (let c = 0; c < m[r].length; c++) {
      if (txt(m[r][c]) === 'Кількість' && txt(m[r]?.[c + 1]) === 'Назва') {
        start = [r, c]; break
      }
    }
    if (start) break
  }
  if (!start) return out
  const [hr, hc] = start
  for (let i = 1; i <= 30; i++) {
    const row = hr + i
    const amount = m[row]?.[hc]
    const name   = txt(m[row]?.[hc + 1])
    if (!name || name === 'ххх' || name === 'Назва') continue
    if (!isTextual(name)) continue
    out.push({
      type: 'other',
      name,
      amount: num(amount) || 1,
      weightPerOne: num(m[row]?.[hc + 2]),
      weight: num(amount) * num(m[row]?.[hc + 2]) || num(m[row]?.[hc + 2]),
      physicalResistance: num(m[row]?.[hc + 3]),
      magicalResistance: num(m[row]?.[hc + 4]),
      description: txt(m[row]?.[hc + 7]) || '',
      effects: [], isMagic: false, isCursed: false, isBlessed: false,
      _id: genId(),
    })
  }
  return out
}

// Недоліки → "Риси та недоліки" (_traits_v2: name/cost/desc). Лише з активного аркуша.
function parseTraits(m) {
  const p = find(m, 'Недоліки')
  if (!p) return []
  const [r, c] = p
  const out = []
  for (let i = 2; i <= 14; i++) {
    const row = r + i
    const name = txt(m[row]?.[c])
    if (!name) continue
    if (['Переваги', 'Активні ефекти', 'Інвентар', 'Закляття', 'Здібності', 'Здатність'].includes(name)) break
    if (name === 'ххх' || name === 'Назва') continue
    if (!isTextual(name)) continue
    out.push({ name, cost: String(num(m[row]?.[c + 1]) || ''), desc: txt(m[row]?.[c + 2]) || '', _id: genId() })
  }
  return out
}

// Узагальнений парсер інвентарного під-списку за міткою (кінь/візок тощо).
function parseNamedInventory(m, label) {
  const p = find(m, label)
  if (!p) return []
  const [hr, hc] = p
  const out = []
  let headRow = -1, nameOff = 1
  for (let d = 1; d <= 3; d++) {
    const row = hr + d
    for (let off = 0; off <= 3; off++) {
      if (txt(m[row]?.[hc + off]) === 'Назва') { headRow = row; nameOff = off; break }
    }
    if (headRow >= 0) break
  }
  if (headRow < 0) return out
  const amtCol = hc + nameOff - 1
  const nameCol = hc + nameOff
  for (let i = 1; i <= 20; i++) {
    const row = headRow + i
    const name = txt(m[row]?.[nameCol])
    if (!name || name === 'ххх' || name === 'Назва') continue
    if (!isTextual(name)) continue
    const amount = num(m[row]?.[amtCol]) || 1
    const wpo = num(m[row]?.[nameCol + 1])
    out.push({
      type: 'other', name, amount, weightPerOne: wpo, weight: roundW(amount * wpo),
      physicalResistance: num(m[row]?.[nameCol + 2]), magicalResistance: num(m[row]?.[nameCol + 3]),
      description: txt(m[row]?.[nameCol + 6]) || '',
      effects: [], isMagic: false, isCursed: false, isBlessed: false, _id: genId(),
    })
  }
  return out
}


const ARMOR_LABEL_MAP = {
  'Кираса': 'Кираса', 'Поножі': 'Поножі', 'Шолом': 'Шолом', 'Чоботи': 'Чоботи',
  'Рукавиці': 'Рукавиці', 'Одяг': 'Одяг', 'Плащ/накидка': 'Плащ_накидка',
  'Шия': 'Шия', 'Рюкзак': 'Рюкзак', 'Пояс': 'Пояс',
}

function parseArmor(m) {
  // Блок "Екіпірування": колонка "Комірка" (назви слотів) + ліворуч Назва/Вага/Фіз/Маг
  const armor = {}
  const p = find(m, 'Комірка')
  if (!p) return armor
  const [hr, hc] = p
  // Дублі слотів Палець (л/п) і Кисть (л/п) — розрізняємо за порядком
  let fingerN = 0, handN = 0
  for (let i = 1; i <= 18; i++) {
    const row = hr + i
    const slotLabel = txt(m[row]?.[hc])
    if (!slotLabel) continue
    let mapped = ARMOR_LABEL_MAP[slotLabel]
    if (slotLabel === 'Палець') { mapped = fingerN === 0 ? 'Палець_л' : 'Палець_п'; fingerN++ }
    if (slotLabel === 'Кисть')  { mapped = handN   === 0 ? 'Кисть_л'  : 'Кисть_п';  handN++ }
    if (!mapped) continue
    const name = txt(m[row]?.[hc - 6])
    const w    = num(m[row]?.[hc - 5])
    const phys = num(m[row]?.[hc - 4])
    const mag  = num(m[row]?.[hc - 3])
    if (name && name !== 'ххх') {
      armor[mapped] = { name, w: String(w), phys: String(phys), mag: String(mag) }
    }
  }
  return armor
}

function parseWeapons(m, data) {
  // П.Рука / Л.Рука у блоці екіпірування (колонка "Комірка")
  // Дані зброї — ліворуч від мітки
  for (const [label, prefix] of [['П.Рука', 'wr'], ['Л.Рука', 'wl']]) {
    const p = find(m, label)
    if (!p) continue
    const [r, c] = p
    const name = txt(m[r]?.[c - 6])
    const w    = num(m[r]?.[c - 5])
    const phys = num(m[r]?.[c - 4])
    const mag  = num(m[r]?.[c - 3])
    if (name && name !== 'ххх') {
      data[`${prefix}-name`]   = name
      data[`${prefix}-weight`] = String(w)
      data[`${prefix}-phys`]   = String(phys)
      data[`${prefix}-mag`]    = String(mag)
    }
  }
}
