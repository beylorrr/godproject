/**
 * gmSheetReducer.js
 * Локальний useReducer для GM-перегляду листа гравця.
 * Повністю ізольований від sheetSlice — гравець не втрачає свої дані.
 * Логіка повністю відповідає sheetSlice reducers.
 */
import { emptySheet } from '../store/slices/sheetSlice'
import { calcAutoMax, AUTO_MAX_MAP, calcArmorBonuses } from './formulas'
import { SKILL_COST_TABLE } from '../data/gameData'
import { applyOpLocal, ensureIds } from './collections'

function recalcArmor(data) {
  const bonuses = calcArmorBonuses(data._armor || {}, data._shield || {})
  data['res-max-pr'] = String(bonuses.pr)
  data['res-max-mr'] = String(bonuses.mr)
  data['res-cur-pr']  = String(Math.min(parseInt(data['res-cur-pr'])||0, bonuses.pr))
  data['res-cur-mr']  = String(Math.min(parseInt(data['res-cur-mr'])||0, bonuses.mr))
  return data
}

// Оновити максимум ресурсу і зсунути поточне на ту саму дельту (HP 150/200, новий макс 250 → 200/250)
function setMaxWithCur(d, resId, newMax) {
  const oldMax = parseFloat(d[`res-max-${resId}`]) || 0
  const delta  = newMax - oldMax
  d[`res-max-${resId}`] = String(newMax)
  if (delta !== 0) {
    let newCur = (parseFloat(d[`res-cur-${resId}`]) || 0) + delta
    if (newCur < 0) newCur = 0
    if (newCur > newMax) newCur = newMax
    d[`res-cur-${resId}`] = String(newCur)
  }
}

export function gmSheetReducer(state, action) {
  // Глибока копія щоб не мутувати state
  const d = JSON.parse(JSON.stringify(state))

  switch (action.type) {
    case 'init':
      return ensureIds({ ...emptySheet(), ...action.payload })

    case 'mergePlayerUpdate': {
      // Гравець зберіг скалярні поля — беремо його версію (колекції йдуть окремо через collectionOp).
      return ensureIds({ ...emptySheet(), ...action.payload })
    }

    case 'applySSEPatch':
      // Патч від SSE: гравець оновив скалярне поле — GM бачить зміни в лайві
      return { ...d, ...action.payload }

    // Операція над колекцією (інвентар): і власні GM-дії, і collection_op від гравця по SSE
    case 'invOp':
    case 'collectionOp': {
      applyOpLocal(d, action.op)
      return d
    }

    case 'setField':
      d[action.key] = action.value
      if (action.key === '_armor' || action.key === '_shield') recalcArmor(d)
      else if (action.key.startsWith('stat-')) {
        const statId = action.key.slice(5)
        Object.entries(AUTO_MAX_MAP).forEach(([res, dep]) => {
          if (dep === statId) setMaxWithCur(d, res, calcAutoMax(res, action.value))
        })
      }
      return d

    case 'setFields':
      Object.assign(d, action.payload)
      Object.entries(AUTO_MAX_MAP).forEach(([res, dep]) => {
        if (action.payload[`stat-${dep}`] !== undefined)
          setMaxWithCur(d, res, calcAutoMax(res, d[`stat-${dep}`]))
      })
      recalcArmor(d)
      return d

    case 'adjustSkill': {
      const { tableId, skillName, delta, maxLvl, cost } = action
      const key     = `${tableId}::${skillName}`
      const cur     = d._skillLevels[key] || 0
      const pts     = parseInt(d.skill_pts) || 0
      const costRow = SKILL_COST_TABLE?.[cost]
      if (delta > 0) {
        if (cur >= maxLvl) return d
        const price = costRow ? (costRow[cur] ?? cost) : cost
        if (pts < price) return d
        d._skillLevels[key] = cur + 1
        d.skill_pts = String(pts - price)
      } else {
        if (cur <= 0) return d
        const refund = costRow ? (costRow[cur - 1] ?? cost) : cost
        const newLvl = cur - 1
        if (newLvl <= 0) delete d._skillLevels[key]
        else d._skillLevels[key] = newLvl
        d.skill_pts = String(pts + refund)
      }
      return d
    }

    case 'adjustStat': {
      const { statId, delta } = action
      const cur = parseInt(d[`stat-${statId}`]) || 0
      const pts = parseInt(d.stat_pts) || 0
      if (delta > 0) {
        if (pts <= 0) return d
        const nv = cur + 1
        d[`stat-${statId}`] = String(nv)
        d.stat_pts = String(pts - 1)
        Object.entries(AUTO_MAX_MAP).forEach(([res, dep]) => {
          if (dep === statId) setMaxWithCur(d, res, calcAutoMax(res, nv))
        })
      } else {
        if (cur <= 1) return d
        const nv = cur - 1
        d[`stat-${statId}`] = String(nv)
        d.stat_pts = String(pts + 1)
        Object.entries(AUTO_MAX_MAP).forEach(([res, dep]) => {
          if (dep === statId) setMaxWithCur(d, res, calcAutoMax(res, nv))
        })
      }
      return d
    }

    case 'setArmorSlot':
      if (!d._armor[action.slot]) d._armor[action.slot] = {name:'',w:'0',phys:'0',mag:'0'}
      d._armor[action.slot][action.field] = action.value
      return recalcArmor(d)

    case 'setShieldField':
      if (!d._shield) d._shield = {name:'',w:'0',phys:'0',mag:'0'}
      d._shield[action.field] = action.value
      return recalcArmor(d)

    case 'addInvRow':
      if (!d[`_inv_${action.listId}`]) d[`_inv_${action.listId}`] = []
      d[`_inv_${action.listId}`].push(['','1','0','0','0','0',''])
      return d
    case 'reorderInvRows': {
      const rows = d[`_inv_${action.listId}`]
      if (!rows) return d
      const [moved] = rows.splice(action.from, 1)
      rows.splice(action.to, 0, moved)
      return d
    }
    case 'removeInvRow':
      d[`_inv_${action.listId}`]?.splice(action.i, 1)
      return d
    case 'setInvCell': {
      const rows = d[`_inv_${action.listId}`]
      if (!rows?.[action.i]) return d
      rows[action.i][action.col] = action.value
      if (action.col === 1 || action.col === 2)
        rows[action.i][3] = String(((parseFloat(rows[action.i][1])||0)*(parseFloat(rows[action.i][2])||0)).toFixed(2))
      return d
    }

    case 'addEffect':    d._effects.push({name:''}); return d
    case 'updateEffect': d._effects[action.i].name = action.name; return d
    case 'removeEffect': d._effects.splice(action.i, 1); return d

    case 'addTrait':    d._traits_v2.push({name:'',cost:'',desc:''}); return d
    case 'updateTrait': d._traits_v2[action.i][action.f] = action.v; return d
    case 'removeTrait': d._traits_v2.splice(action.i, 1); return d

    case 'addSpell':    d._spells.push({name:'',school:'Сила вогню',od:'',om:'0',vs:'0',cd:'',range:'',damage:'',desc:''}); return d
    case 'updateSpell': d._spells[action.i][action.f] = action.v; return d
    case 'removeSpell': d._spells.splice(action.i, 1); return d

    case 'addLanguage':    d._languages.push({name:'',level:'1'}); return d
    case 'updateLanguage': d._languages[action.i][action.f] = action.v; return d
    case 'removeLanguage': d._languages.splice(action.i, 1); return d

    case 'addRecipe':    d._recipes.push({name:'',source:'',desc:''}); return d
    case 'updateRecipe': d._recipes[action.i][action.f] = action.v; return d
    case 'removeRecipe': d._recipes.splice(action.i, 1); return d

    case 'addQuirk':    d._quirks.push({name:'',cost:'',desc:''}); return d
    case 'updateQuirk': d._quirks[action.i][action.f] = action.v; return d
    case 'removeQuirk': d._quirks.splice(action.i, 1); return d

    default: return state
  }
}
