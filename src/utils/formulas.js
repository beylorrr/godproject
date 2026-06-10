/**
 * formulas.js — всі ігрові формули
 * Прямий порт з vanilla main.js
 */

// МОД = ⌊val/15⌋, 0 якщо val < 15
export const calcMod = val => {
  const v = parseInt(val) || 0
  return v < 15 ? 0 : Math.floor(v / 15)
}

// XP: 0→1=50xp, кожен наступний +50
export const xpForLevel      = lvl => (lvl + 1) * 50
export const totalXpForLevel = lvl => { let t=0; for(let i=0;i<lvl;i++) t+=xpForLevel(i); return t }
export const levelFromXp     = xp  => { let l=0; while(xp>=totalXpForLevel(l+1)) l++; return l }

// Авто-максимуми ресурсів від характеристик
export const AUTO_MAX_MAP  = { hp:'con', mp:'wis', mt:'will', ed:'end' }
export const AUTO_MAX_MULT = { hp:10,   mp:10,    mt:1,      ed:10    }
export const calcAutoMax   = (resId, statVal) => {
  const mult = AUTO_MAX_MULT[resId]
  if (!mult) return null
  return Math.round((parseFloat(statVal)||0) * mult)
}

// Таблиця урону (7 відсотків)
export const DMG_PCTS = [
  { key:'100', label:'100%', mult:1    },
  { key:'10',  label:'10%',  mult:.1   },
  { key:'25',  label:'25%',  mult:.25  },
  { key:'50',  label:'50%',  mult:.5   },
  { key:'75',  label:'75%',  mult:.75  },
  { key:'150', label:'150%', mult:1.5  },
  { key:'300', label:'300%', mult:3    },
]

export const calcWeaponDmg = ({ str=0, int=0, wrPhys=0, wrMag=0, wlPhys=0, wlMag=0, hasLeft=false }) => {
  // Права рука: Фіз = Сила×5 + фіз.атака
  const wr100p = Math.floor(str*5 + wrPhys)
  const wr100m = Math.floor(int*5 + wrMag)
  // Ліва рука: Фіз = фіз.атака (без Сили!)
  const wl100p = hasLeft ? Math.floor(wlPhys)      : 0
  const wl100m = hasLeft ? Math.floor(int*5+wlMag) : 0

  return DMG_PCTS.map(({key,label,mult}) => ({
    key, label,
    wr: { p:Math.floor(wr100p*mult), m:Math.floor(wr100m*mult), t:Math.floor(wr100p*mult)+Math.floor(wr100m*mult) },
    wl: { p:Math.floor(wl100p*mult), m:Math.floor(wl100m*mult), t:Math.floor(wl100p*mult)+Math.floor(wl100m*mult) },
  }))
}

// PR/MR з броні
export const calcArmorBonuses = (armor={}, shieldPhys=0) => {
  let pr=0, mr=0
  Object.values(armor).forEach(item => {
    pr += parseFloat(item?.phys)||0
    mr += parseFloat(item?.mag) ||0
  })
  pr += parseFloat(shieldPhys)||0
  return { pr, mr }
}

// Усі інвентарні списки (для підрахунку загальної ваги)
export const INV_WEIGHT_KEYS = [
  '_inv_inv-main','_inv_inv-belt','_inv_inv-quest','_inv_inv-tools',
  '_inv_inv-books','_inv_inv-ingredients','_inv_inv-potions',
]

// Загальна вага всього носимого: предмети в усіх списках (об'єкти {weight}) +
// екіпіровані броня (слоти) + зброя в руках + щит.
// Екіпірований предмет переноситься зі списку в слот, тож рахується рівно один раз —
// незалежно від того, лежить він в інвентарі чи одягнений. ЄДИНЕ значення.
export const calcTotalWeight = (data = {}) => {
  let total = 0
  for (const k of INV_WEIGHT_KEYS) {
    const rows = data[k]
    if (Array.isArray(rows)) {
      total += rows.reduce((s, it) => s + (parseFloat(it?.weight) || 0), 0)
    }
  }
  total += parseFloat(data['wr-weight']) || 0
  total += parseFloat(data['wl-weight']) || 0
  if (data._armor) {
    for (const slot of Object.values(data._armor)) total += parseFloat(slot?.w) || 0
  }
  total += parseFloat(data._shield?.w) || 0
  return Math.round(total * 1000) / 1000
}

// Максимальна дозволена вага: база 30 + 5 за кожен рівень здібності «Мул».
export const calcMaxWeight = (data = {}) => {
  let mulLvl = 0
  if (data._skillLevels) {
    for (const [key, lvl] of Object.entries(data._skillLevels)) {
      if (key.includes('Мул')) { mulLvl = parseInt(lvl) || 0; break }
    }
  }
  return 30 + mulLvl * 5
}

// ── ШУ (Шанс Ухилення) ──
// Формула з Excel: залежить від навантаження відносно дозволеної ваги.
//   дозволена_вага = max-weight / 10
//   навантаження    = сумарна вага всього носимого
//   ШУ = ≤25%→8, ≤50%→6, ≤75%→3, ≤100%→2, інакше→0
//   + рівень вміння "Ухиляння" (макс 6) додається зверху
// ── ШУ (Шанс Ухилення) ──
// База = поточна витривалість (res-cur-ed) / 10 — це 100%.
// Навантаження = сумарна вага всього носимого (інвентар + вдягнене + зброя + щит).
// Відсоток навантаження від бази визначає базовий ШУ:
//   ≤25% → 8, ≤50% → 6, ≤75% → 3, <100% → 2, ≥100% → 0.
// Зверху додається рівень навички «Ухиляння».
// Вага ЛИШЕ вдягненого: броня в слотах + зброя в руках + щит. Без інвентарю.
// Використовується для ШУ (шансу ухилення).
export const calcEquippedWeight = (data = {}) => {
  let total = 0
  total += parseFloat(data['wr-weight']) || 0
  total += parseFloat(data['wl-weight']) || 0
  if (data._armor) {
    for (const slot of Object.values(data._armor)) total += parseFloat(slot?.w) || 0
  }
  total += parseFloat(data._shield?.w) || 0
  return Math.round(total * 100) / 100
}

export const calcDodge = ({ totalWeight = 0, enduranceCurrent = 0, dodgeSkillLevel = 0 }) => {
  const base = (parseFloat(enduranceCurrent) || 0) / 10
  const load = parseFloat(totalWeight) || 0
  if (base <= 0) return parseInt(dodgeSkillLevel) || 0   // без витривалості бази нема
  let shu
  if      (load <= base * 0.25) shu = 8
  else if (load <= base * 0.50) shu = 6
  else if (load <= base * 0.75) shu = 3
  else if (load <  base * 1.00) shu = 2
  else                          shu = 0
  return shu + (parseInt(dodgeSkillLevel) || 0)
}

// Підтримка формул у полях (+5, -10, *2)
export const applyFormula = (raw, current) => {
  const s = String(raw).trim()
  if (!s) return current
  const base = parseFloat(current) || 0
  // Формула-операція: +5, -3, *2, /4 — застосовуємо до поточного значення без eval
  const m = s.match(/^([+\-*/])\s*(\d+(?:\.\d+)?)$/)
  if (m) {
    const op = m[1], n = parseFloat(m[2])
    let r = base
    if      (op === '+') r = base + n
    else if (op === '-') r = base - n
    else if (op === '*') r = base * n
    else if (op === '/') r = n !== 0 ? base / n : base
    return Math.round(r * 100) / 100
  }
  const n = parseFloat(s)
  return isNaN(n) ? current : n
}
