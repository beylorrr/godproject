/**
 * SheetDataContext.jsx
 *
 * Контекст, що розв'язує табки листа від конкретного джерела даних.
 * Гравець  → дані з sheetSlice (Redux), зміни → dispatch sheetSlice
 * GM-режим → дані з локального useReducer, зміни не торкають sheetSlice гравця
 *
 * Всі табки читають useSheetData() замість useSelector(selSheet.data).
 */
import { createContext, useContext } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { genId, getRowId, emptyItem, splitOne } from '../utils/collections'
import { calcAutoMax, AUTO_MAX_MAP } from '../utils/formulas'
import {
  selSheet,
  setField, setFields,
  adjustSkill, adjustStat, commitBuild, gmSetSkill, gmSetStat,
  setArmorSlot, setShieldField,
  addEffect, updateEffect, removeEffect,
  addTrait, updateTrait, removeTrait,
  addLanguage, updateLanguage, removeLanguage,
  addRecipe, updateRecipe, removeRecipe,
  addQuirk, updateQuirk, removeQuirk,
  applyCollectionOp, collectionOp,
} from '../store/slices/sheetSlice'

// ── Контекст ──────────────────────────────────────────
const SheetDataContext = createContext(null)

export const useSheetData = () => {
  const ctx = useContext(SheetDataContext)
  if (!ctx) {
    // Safety fallback — не кидаємо помилку, повертаємо порожній контекст
    // Це трапляється якщо табка рендерилась поза провайдером (має не бути, але страхуємось)
    console.warn('useSheetData: called outside SheetDataContext — returning empty fallback')
    return { data: {}, readOnly: true,
      setField:()=>{}, setFields:()=>{}, adjustSkill:()=>{}, adjustStat:()=>{}, gmSetSkill:()=>{}, gmSetStat:()=>{},
      setArmorSlot:()=>{}, setShieldField:()=>{},
      invAdd:()=>{}, invUpdate:()=>{}, invRemove:()=>{}, invMove:()=>{},
      equipArmor:()=>{}, unequipArmor:()=>{}, equipWeapon:()=>{}, unequipWeapon:()=>{},
      addEffect:()=>{}, updateEffect:()=>{}, removeEffect:()=>{},
      addTrait:()=>{}, updateTrait:()=>{}, removeTrait:()=>{},
      addSpell:()=>{}, updateSpell:()=>{}, removeSpell:()=>{},
      addLanguage:()=>{}, updateLanguage:()=>{}, removeLanguage:()=>{},
      addRecipe:()=>{}, updateRecipe:()=>{}, removeRecipe:()=>{},
      addTech:()=>{}, updateTech:()=>{}, removeTech:()=>{},
      addQuirk:()=>{}, updateQuirk:()=>{}, removeQuirk:()=>{},
    }
  }
  return ctx
}

// ── Провайдер для ГРАВЦЯ (читає з Redux sheetSlice) ──
// Зняти 1 шт зі стека для екіпірування: повертає предмет (amount=1),
// а в інвентарі або зменшує кількість, або прибирає, якщо лишився 0.
function takeOneFromStack(listId, item, invRemove, invUpdate, extra = null) {
  const { one, remaining } = splitOne(item)
  if (remaining > 0) {
    invUpdate(listId, item._id, {
      amount: remaining,
      weight: +((one.weightPerOne || 0) * remaining).toFixed(2),
    })
  } else {
    invRemove(listId, item._id, extra)
  }
  return one
}

// Дебаунс серверних op-update за ключем (collection+rowId).
// Текстові поля (ефекти/риси) друкуються посимвольно — без дебаунсу це слало б
// окремий op на кожну літеру, спричиняючи гонки і розсинхрон. Локально зміна
// застосовується одразу, а на сервер летить накопичений patch через 500мс тиші.
const _opDebounce = {}
function debouncedSendOp(dispatchFn, op) {
  const key = `${op.collection}:${op.rowId}`
  const entry = _opDebounce[key] || { patch: {} }
  // Накопичуємо всі змінені поля (щоб не загубити попередні при швидкому редагуванні)
  entry.patch = { ...entry.patch, ...(op.patch || {}) }
  clearTimeout(entry.t)
  entry.t = setTimeout(() => {
    dispatchFn({ ...op, patch: entry.patch })
    delete _opDebounce[key]
  }, 500)
  _opDebounce[key] = entry
}

export function PlayerSheetProvider({ children }) {
  const dispatch = useDispatch()
  const data     = useSelector(selSheet.data)

  // Інвентар: предмети — об'єкти у форматі бази майстра. Операції за стабільним _id.
  const invAdd = (listId, item, extra = null) => {
    const collection = `_inv_${listId}`
    const row = item ? { ...item, _id: item._id || genId() } : emptyItem()
    const op = { collection, action: 'add', row, rowId: row._id, ...(extra || {}) }
    dispatch(applyCollectionOp(op)); dispatch(collectionOp(op))
    return row._id
  }
  const invUpdate = (listId, rowId, patch) => {
    if (!rowId) return
    const op = { collection: `_inv_${listId}`, action: 'update', rowId, patch }
    dispatch(applyCollectionOp(op)); dispatch(collectionOp(op))
  }
  const invRemove = (listId, rowId, extra = null) => {
    if (!rowId) return
    const op = { collection: `_inv_${listId}`, action: 'remove', rowId, ...(extra || {}) }
    dispatch(applyCollectionOp(op)); dispatch(collectionOp(op))
  }
  const invMove = (listId, rowId, toIndex) => {
    if (!rowId) return
    const op = { collection: `_inv_${listId}`, action: 'move', rowId, toIndex }
    dispatch(applyCollectionOp(op)); dispatch(collectionOp(op))
  }

  // Закляття (_spells) — об'єктна колекція, операції за _id
  const spellAdd = () => {
    const row = { name:'', school:'Сила вогню', od:'', om:'0', vs:'0', cd:'', range:'', damage:'', desc:'', _id: genId() }
    const op = { collection:'_spells', action:'add', row, rowId: row._id }
    dispatch(applyCollectionOp(op)); dispatch(collectionOp(op))
  }
  const spellUpdate = ({ i, f, v }) => {
    const rowId = getRowId('_spells', (data._spells || [])[i])
    if (!rowId) return
    const op = { collection:'_spells', action:'update', rowId, patch:{ [f]: v } }
    dispatch(applyCollectionOp(op)); dispatch(collectionOp(op))
  }
  const spellRemove = (i) => {
    const rowId = getRowId('_spells', (data._spells || [])[i])
    if (!rowId) return
    const op = { collection:'_spells', action:'remove', rowId }
    dispatch(applyCollectionOp(op)); dispatch(collectionOp(op))
  }

  // Спільні op-фабрики для об'єктних колекцій (_effects, _traits_v2, _quirks, _languages, _recipes).
  // Раніше ці колекції мінялись локальними reducer-ами без op → не зберігались і не синхронізувались.
  const collAdd = (collection, empty) => () => {
    const row = { ...empty, _id: genId() }
    const op = { collection, action:'add', row, rowId: row._id }
    dispatch(applyCollectionOp(op)); dispatch(collectionOp(op))
  }
  const collUpdate = (collection) => ({ i, ...patch }) => {
    const rowId = getRowId(collection, (data[collection] || [])[i])
    if (!rowId) return
    const op = { collection, action:'update', rowId, patch }
    dispatch(applyCollectionOp(op))                          // локально миттєво
    debouncedSendOp((o) => dispatch(collectionOp(o)), op)    // на сервер з дебаунсом
  }
  const collRemove = (collection) => (i) => {
    const rowId = getRowId(collection, (data[collection] || [])[i])
    if (!rowId) return
    const op = { collection, action:'remove', rowId }
    dispatch(applyCollectionOp(op)); dispatch(collectionOp(op))
  }

  // ── Екіпірування: одягнути предмет з інвентарю / зняти назад ──
  // Броня: _armor[slot] = { name, w, phys, mag, equipped }; phys/mag = опір предмета.
  // Зброя: поля wr-*/wl-* + wr-equipped/wl-equipped; фіз/маг = шкода предмета.
  const equipArmor = (slot, item) => {
    const one = takeOneFromStack('inv-main', item, invRemove, invUpdate, { reason: 'equip' })
    const armor = { ...(data._armor || {}) }
    armor[slot] = {
      name: one.name || '',
      w:    String(one.weightPerOne ?? one.weight ?? 0),
      phys: String(one.physicalResistance ?? 0),
      mag:  String(one.magicalResistance ?? 0),
      equipped: one,
    }
    dispatch(setField({ key: '_armor', value: armor }))
  }
  const unequipArmor = (slot) => {
    const cell = (data._armor || {})[slot]
    // Формуємо предмет із поточних полів слота. Якщо була основа (equipped) — беремо її
    // ефекти/тип; якщо гравець заповнив слот вручну — створюємо новий предмет з даних слота.
    if (cell && (cell.name || parseFloat(cell.w) || parseFloat(cell.phys) || parseFloat(cell.mag) || cell.equipped)) {
      const base = cell.equipped || { type:'armor', effects:[], isMagic:false, isCursed:false, isBlessed:false, amount:1 }
      invAdd('inv-main', {
        ...base, _id: genId(),
        type: 'armor',   // зняте з екіпірування — завжди броня
        name: cell.name ?? base.name ?? '',
        weight: parseFloat(cell.w) || 0,
        weightPerOne: parseFloat(cell.w) || 0,
        physicalResistance: parseFloat(cell.phys) || 0,
        magicalResistance: parseFloat(cell.mag) || 0,
      }, { reason: 'unequip' })
    }
    const armor = { ...(data._armor || {}) }
    armor[slot] = { name: '', w: '', phys: '', mag: '' }
    dispatch(setField({ key: '_armor', value: armor }))
  }
  const equipWeapon = (hand, item) => {
    const one = takeOneFromStack('inv-main', item, invRemove, invUpdate, { reason: 'equip' })
    const p = hand === 'wr' ? 'wr' : 'wl'
    dispatch(setFields({
      [`${p}-name`]:   one.name || '',
      [`${p}-weight`]: String(one.weightPerOne ?? one.weight ?? 0),
      [`${p}-phys`]:   String(one.physicalDamage ?? 0),
      [`${p}-mag`]:    String(one.magicalDamage ?? 0),
      [`${p}-equipped`]: one,
    }))
  }
  const unequipWeapon = (hand) => {
    const p = hand === 'wr' ? 'wr' : 'wl'
    const eq = data[`${p}-equipped`]
    // Формуємо зброю з поточних полів руки — і коли одягали з інвентарю (eq),
    // і коли гравець заповнив руку вручну (eq немає, створюємо новий предмет).
    const nm = data[`${p}-name`], w = data[`${p}-weight`], ph = data[`${p}-phys`], mg = data[`${p}-mag`]
    if (eq || nm || parseFloat(w) || parseFloat(ph) || parseFloat(mg)) {
      const base = eq || { type:'weapon', effects:[], isMagic:false, isCursed:false, isBlessed:false, amount:1 }
      invAdd('inv-main', {
        ...base, _id: genId(),
        type: 'weapon',   // зняте з руки — завжди зброя
        name: nm ?? base.name ?? '',
        weight: parseFloat(w) || 0,
        weightPerOne: parseFloat(w) || 0,
        physicalDamage: parseFloat(ph) || 0,
        magicalDamage: parseFloat(mg) || 0,
      }, { reason: 'unequip' })
    }
    dispatch(setFields({
      [`${p}-name`]: '', [`${p}-weight`]: '', [`${p}-phys`]: '', [`${p}-mag`]: '', [`${p}-equipped`]: null,
    }))
  }

  const ctx = {
    data,
    readOnly: false,
    gmMode:   false,   // гравець НЕ є GM — блокуємо GM-поля
    setField:       (k,v)  => dispatch(setField({key:k, value:v})),
    gmSetSkill:     (key,lvl)      => dispatch(gmSetSkill({key, lvl})),
    gmSetStat:      (statId,value) => dispatch(gmSetStat({statId, value})),
    setFields:      (obj)  => dispatch(setFields(obj)),
    adjustSkill:    (args) => dispatch(adjustSkill(args)),
    adjustStat:     (args) => dispatch(adjustStat(args)),
    commitBuild:    ()     => dispatch(commitBuild()),
    setArmorSlot:   (args) => dispatch(setArmorSlot(args)),
    setShieldField: (args) => dispatch(setShieldField(args)),
    invAdd:         invAdd,
    invUpdate:      invUpdate,
    invRemove:      invRemove,
    invMove:        invMove,
    equipArmor:     equipArmor,
    unequipArmor:   unequipArmor,
    equipWeapon:    equipWeapon,
    unequipWeapon:  unequipWeapon,
    addEffect:      collAdd('_effects', { name:'' }),
    updateEffect:   ({i,name}) => collUpdate('_effects')({ i, name }),
    removeEffect:   collRemove('_effects'),
    addTrait:       collAdd('_traits_v2', { name:'', cost:'', desc:'' }),
    updateTrait:    ({i,f,v}) => collUpdate('_traits_v2')({ i, [f]: v }),
    removeTrait:    collRemove('_traits_v2'),
    addSpell:       spellAdd,
    updateSpell:    spellUpdate,
    removeSpell:    spellRemove,
    addLanguage:    collAdd('_languages', { name:'', level:'' }),
    updateLanguage: ({i,f,v}) => collUpdate('_languages')({ i, [f]: v }),
    removeLanguage: collRemove('_languages'),
    addRecipe:      collAdd('_recipes', { name:'', desc:'' }),
    updateRecipe:   ({i,f,v}) => collUpdate('_recipes')({ i, [f]: v }),
    removeRecipe:   collRemove('_recipes'),
    addTech:        collAdd('_technologies', { name:'', source:'', desc:'' }),
    updateTech:     ({i,f,v}) => collUpdate('_technologies')({ i, [f]: v }),
    removeTech:     collRemove('_technologies'),
    addQuirk:       collAdd('_quirks', { name:'', cost:'', desc:'' }),
    updateQuirk:    ({i,f,v}) => collUpdate('_quirks')({ i, [f]: v }),
    removeQuirk:    collRemove('_quirks'),
  }

  return <SheetDataContext.Provider value={ctx}>{children}</SheetDataContext.Provider>
}

// ── Провайдер для GM (отримує data і onChange ззовні) ──
// data і onChange передає GMSheetView через локальний useReducer
export function GmSheetProvider({ data, dispatch: localDispatch, children }) {
  const reduxDispatch = useDispatch()

  // GM-інвентар: миттєва локальна мутація (localDispatch) + op на сервер гравця.
  // Сервер розішле collection_op гравцю — той застосує без перезапису.
  const sendGmOp = (op) => reduxDispatch(collectionOp(op))

  const invAdd = (listId, item) => {
    const collection = `_inv_${listId}`
    const row = item ? { ...item, _id: item._id || genId() } : emptyItem()
    localDispatch({ type:'collectionOp', op:{ collection, action:'add', row } })
    sendGmOp({ collection, action:'add', row, rowId: row._id })
    return row._id
  }
  const invUpdate = (listId, rowId, patch) => {
    if (!rowId) return
    const collection = `_inv_${listId}`
    localDispatch({ type:'collectionOp', op:{ collection, action:'update', rowId, patch } })
    sendGmOp({ collection, action:'update', rowId, patch })
  }
  const invRemove = (listId, rowId) => {
    if (!rowId) return
    const collection = `_inv_${listId}`
    localDispatch({ type:'collectionOp', op:{ collection, action:'remove', rowId } })
    sendGmOp({ collection, action:'remove', rowId })
  }
  const invMove = (listId, rowId, toIndex) => {
    if (!rowId) return
    const collection = `_inv_${listId}`
    localDispatch({ type:'collectionOp', op:{ collection, action:'move', rowId, toIndex } })
    sendGmOp({ collection, action:'move', rowId, toIndex })
  }

  const spellAdd = () => {
    const row = { name:'', school:'Сила вогню', od:'', om:'0', vs:'0', cd:'', range:'', damage:'', desc:'', _id: genId() }
    localDispatch({ type:'collectionOp', op:{ collection:'_spells', action:'add', row } })
    sendGmOp({ collection:'_spells', action:'add', row, rowId: row._id })
  }
  const spellUpdate = ({ i, f, v }) => {
    const rowId = getRowId('_spells', (data._spells || [])[i])
    if (!rowId) return
    localDispatch({ type:'collectionOp', op:{ collection:'_spells', action:'update', rowId, patch:{[f]:v} } })
    sendGmOp({ collection:'_spells', action:'update', rowId, patch:{[f]:v} })
  }
  const spellRemove = (i) => {
    const rowId = getRowId('_spells', (data._spells || [])[i])
    if (!rowId) return
    localDispatch({ type:'collectionOp', op:{ collection:'_spells', action:'remove', rowId } })
    sendGmOp({ collection:'_spells', action:'remove', rowId })
  }

  // Спільні op-фабрики для об'єктних колекцій (GM редагує лист гравця)
  const gmCollAdd = (collection, empty) => () => {
    const row = { ...empty, _id: genId() }
    localDispatch({ type:'collectionOp', op:{ collection, action:'add', row } })
    sendGmOp({ collection, action:'add', row, rowId: row._id })
  }
  const gmCollUpdate = (collection) => ({ i, ...patch }) => {
    const rowId = getRowId(collection, (data[collection] || [])[i])
    if (!rowId) return
    localDispatch({ type:'collectionOp', op:{ collection, action:'update', rowId, patch } })
    debouncedSendOp(sendGmOp, { collection, action:'update', rowId, patch })
  }
  const gmCollRemove = (collection) => (i) => {
    const rowId = getRowId(collection, (data[collection] || [])[i])
    if (!rowId) return
    localDispatch({ type:'collectionOp', op:{ collection, action:'remove', rowId } })
    sendGmOp({ collection, action:'remove', rowId })
  }

  // ── Екіпірування (GM редагує лист гравця) ──
  const equipArmor = (slot, item) => {
    const one = takeOneFromStack('inv-main', item, invRemove, invUpdate, { reason: 'equip' })
    const armor = { ...(data._armor || {}) }
    armor[slot] = {
      name: one.name || '', w: String(one.weightPerOne ?? one.weight ?? 0),
      phys: String(one.physicalResistance ?? 0), mag: String(one.magicalResistance ?? 0),
      equipped: one,
    }
    localDispatch({ type:'setField', key:'_armor', value: armor })
  }
  const unequipArmor = (slot) => {
    const cell = (data._armor || {})[slot]
    if (cell && (cell.name || parseFloat(cell.w) || parseFloat(cell.phys) || parseFloat(cell.mag) || cell.equipped)) {
      const base = cell.equipped || { type:'armor', effects:[], isMagic:false, isCursed:false, isBlessed:false, amount:1 }
      invAdd('inv-main', {
        ...base, _id: genId(),
        type: 'armor',   // зняте з екіпірування — завжди броня
        name: cell.name ?? base.name ?? '',
        weight: parseFloat(cell.w) || 0,
        weightPerOne: parseFloat(cell.w) || 0,
        physicalResistance: parseFloat(cell.phys) || 0,
        magicalResistance: parseFloat(cell.mag) || 0,
      }, { reason: 'unequip' })
    }
    const armor = { ...(data._armor || {}) }
    armor[slot] = { name: '', w: '', phys: '', mag: '' }
    localDispatch({ type:'setField', key:'_armor', value: armor })
  }
  const equipWeapon = (hand, item) => {
    const one = takeOneFromStack('inv-main', item, invRemove, invUpdate, { reason: 'equip' })
    const p = hand === 'wr' ? 'wr' : 'wl'
    localDispatch({ type:'setFields', payload: {
      [`${p}-name`]: one.name || '', [`${p}-weight`]: String(one.weightPerOne ?? one.weight ?? 0),
      [`${p}-phys`]: String(one.physicalDamage ?? 0), [`${p}-mag`]: String(one.magicalDamage ?? 0),
      [`${p}-equipped`]: one,
    }})
  }
  const unequipWeapon = (hand) => {
    const p = hand === 'wr' ? 'wr' : 'wl'
    const eq = data[`${p}-equipped`]
    const nm = data[`${p}-name`], w = data[`${p}-weight`], ph = data[`${p}-phys`], mg = data[`${p}-mag`]
    if (eq || nm || parseFloat(w) || parseFloat(ph) || parseFloat(mg)) {
      const base = eq || { type:'weapon', effects:[], isMagic:false, isCursed:false, isBlessed:false, amount:1 }
      invAdd('inv-main', {
        ...base, _id: genId(),
        type: 'weapon',   // зняте з руки — завжди зброя
        name: nm ?? base.name ?? '',
        weight: parseFloat(w) || 0,
        weightPerOne: parseFloat(w) || 0,
        physicalDamage: parseFloat(ph) || 0,
        magicalDamage: parseFloat(mg) || 0,
      }, { reason: 'unequip' })
    }
    localDispatch({ type:'setFields', payload: {
      [`${p}-name`]: '', [`${p}-weight`]: '', [`${p}-phys`]: '', [`${p}-mag`]: '', [`${p}-equipped`]: null,
    }})
  }

  const ctx = {
    data,
    readOnly: false,
    gmMode:   true,    // GM бачить і може редагувати всі поля
    setField:       (k,v)  => localDispatch({type:'setField', key:k, value:v}),
    setFields:      (obj)  => localDispatch({type:'setFields', payload:obj}),
    adjustSkill:    (args) => localDispatch({type:'adjustSkill', ...args}),
    adjustStat:     (args) => localDispatch({type:'adjustStat', ...args}),
    // ГМ: пряме встановлення рівня навички — значення одразу стає floor,
    // тож гравцю не висітиме "Зберегти розподіл"
    gmSetSkill:     (key, lvl) => {
      const v = Math.max(0, parseInt(lvl) || 0)
      const levels = { ...(data._skillLevels || {}) }
      const floor  = { ...(data._skillFloor  || {}) }
      if (v <= 0) { delete levels[key]; delete floor[key] }
      else { levels[key] = v; floor[key] = v }
      localDispatch({ type:'setFields', payload: { _skillLevels: levels, _skillFloor: floor } })
    },
    // ГМ: пряме встановлення характеристики (+floor, +перерахунок авто-максимумів)
    gmSetStat:      (statId, value) => {
      const v = Math.max(1, parseInt(value) || 1)
      const payload = {
        [`stat-${statId}`]: String(v),
        _statFloor: { ...(data._statFloor || {}), [statId]: v },
      }
      Object.entries(AUTO_MAX_MAP).forEach(([res, dep]) => {
        if (dep === statId) {
          const nm = calcAutoMax(res, v)
          payload[`res-max-${res}`] = String(nm)
          const cur = parseFloat(data[`res-cur-${res}`])
          if (!isNaN(cur) && cur > nm) payload[`res-cur-${res}`] = String(nm)
        }
      })
      localDispatch({ type:'setFields', payload })
    },
    setArmorSlot:   (args) => localDispatch({type:'setArmorSlot', ...args}),
    setShieldField: (args) => localDispatch({type:'setShieldField', ...args}),
    invAdd:         invAdd,
    invUpdate:      invUpdate,
    invRemove:      invRemove,
    invMove:        invMove,
    equipArmor:     equipArmor,
    unequipArmor:   unequipArmor,
    equipWeapon:    equipWeapon,
    unequipWeapon:  unequipWeapon,
    addEffect:      gmCollAdd('_effects', { name:'' }),
    updateEffect:   ({i,name}) => gmCollUpdate('_effects')({ i, name }),
    removeEffect:   gmCollRemove('_effects'),
    addTrait:       gmCollAdd('_traits_v2', { name:'', cost:'', desc:'' }),
    updateTrait:    ({i,f,v}) => gmCollUpdate('_traits_v2')({ i, [f]: v }),
    removeTrait:    gmCollRemove('_traits_v2'),
    addSpell:       spellAdd,
    updateSpell:    spellUpdate,
    removeSpell:    spellRemove,
    addLanguage:    gmCollAdd('_languages', { name:'', level:'' }),
    updateLanguage: ({i,f,v}) => gmCollUpdate('_languages')({ i, [f]: v }),
    removeLanguage: gmCollRemove('_languages'),
    addRecipe:      gmCollAdd('_recipes', { name:'', desc:'' }),
    addTech:        gmCollAdd('_technologies', { name:'', source:'', desc:'' }),
    updateRecipe:   ({i,f,v}) => gmCollUpdate('_recipes')({ i, [f]: v }),
    removeRecipe:   gmCollRemove('_recipes'),
    updateTech:     ({i,f,v}) => gmCollUpdate('_technologies')({ i, [f]: v }),
    removeTech:     gmCollRemove('_technologies'),
    addQuirk:       gmCollAdd('_quirks', { name:'', cost:'', desc:'' }),
    updateQuirk:    ({i,f,v}) => gmCollUpdate('_quirks')({ i, [f]: v }),
    removeQuirk:    gmCollRemove('_quirks'),
  }

  return <SheetDataContext.Provider value={ctx}>{children}</SheetDataContext.Provider>
}
