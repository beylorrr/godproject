/**
 * sheetSlice.js
 * Весь стан листа персонажа.
 * Структура ідентична тому що зберігалось у localStorage ванільної версії —
 * це дозволяє безшовно мігрувати дані і зберігати той самий формат у БД.
 */
import { SOCIAL_SKILLS, NEUTRAL_SKILLS, COMBAT_SKILLS, SCIENCE_SKILLS, MAGIC_SKILLS, CRIME_SKILLS,
         SKILL_COST_TABLE } from '../../data/gameData'
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { calcAutoMax, AUTO_MAX_MAP, calcArmorBonuses } from '../../utils/formulas'
import { ensureIds, applyOpLocal } from '../../utils/collections'

const API = import.meta.env.VITE_API_URL ?? ''   // порожньо => відносні /api шляхи (через vite proxy у dev і той самий хост у prod)

// ─── API helper ──────────────────────────────────────
const apiFetch = async (path, token, opts={}) => {
  const hasBody = opts.body !== undefined
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { ...(hasBody?{'Content-Type':'application/json'}:{}), 'Authorization':`Bearer ${token}` },
  })
  const d = await res.json().catch(()=>({}))
  if (res.status === 401) {
    // протухлий/відсутній токен — чистимо локальний стан і на логін
    try { localStorage.removeItem('persist:charsheet_v2') } catch {}
    if (typeof location !== 'undefined') location.assign('/')
    throw new Error('Сесія завершилась, увійдіть знову')
  }
  if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`)
  return d
}

// ─── Thunks ───────────────────────────────────────────
export const fetchCharacters  = createAsyncThunk('sheet/fetchCharacters',  async (_,{getState,rejectWithValue}) => { try{return await apiFetch('/api/characters',getState().auth.token)}catch(e){return rejectWithValue(e.message)} })
export const loadCharacter    = createAsyncThunk('sheet/loadCharacter',    async (id,{getState,rejectWithValue}) => { try{return await apiFetch(`/api/characters/${id}`,getState().auth.token)}catch(e){return rejectWithValue(e.message)} })
export const createCharacter  = createAsyncThunk('sheet/createCharacter',  async (slotName,{getState,rejectWithValue}) => { try{return await apiFetch('/api/characters',getState().auth.token,{method:'POST',body:JSON.stringify({slotName})})}catch(e){return rejectWithValue(e.message)} })
export const importCharacter  = createAsyncThunk('sheet/importCharacter',  async ({slotName,sheetData},{getState,rejectWithValue}) => { try{return await apiFetch('/api/characters',getState().auth.token,{method:'POST',body:JSON.stringify({slotName,sheetData})})}catch(e){return rejectWithValue(e.message)} })
export const saveCharacter    = createAsyncThunk('sheet/saveCharacter',    async ({id,patch},{getState,rejectWithValue}) => { try{await apiFetch(`/api/characters/${id}`,getState().auth.token,{method:'PUT',body:JSON.stringify({patch})});return {id,patch}}catch(e){return rejectWithValue(e.message)} })

// Операція над колекцією (інвентар/закляття) за стабільним _id.
// Гравець → /api/characters/:id/op, GM (редагує чужий лист) → /api/gm/char/:id/op.
// Локально операція вже застосована reducer-ом; сюди шлемо її на сервер.
export const collectionOp = createAsyncThunk('sheet/collectionOp', async (op, {getState,rejectWithValue}) => {
  const st = getState().sheet
  const token = getState().auth.token
  const gmEdit = st.gmEditCharId
  const id = gmEdit || st.activeCharId
  if (!id) return rejectWithValue('Немає активного персонажа')
  const path = gmEdit ? `/api/gm/char/${id}/op` : `/api/characters/${id}/op`
  try { return await apiFetch(path, token, {method:'POST',body:JSON.stringify(op)}) }
  catch(e){ return rejectWithValue(e.message) }
})

// GM-режим: завантаження/збереження чужого листа майстром
export const gmLoadCharacter  = createAsyncThunk('sheet/gmLoadCharacter',  async (id,{getState,rejectWithValue}) => { try{return await apiFetch(`/api/gm/char/${id}`,getState().auth.token)}catch(e){return rejectWithValue(e.message)} })
export const gmSaveCharacter  = createAsyncThunk('sheet/gmSaveCharacter',  async ({id,sheetData},{getState,rejectWithValue}) => { try{await apiFetch(`/api/gm/char/${id}`,getState().auth.token,{method:'PUT',body:JSON.stringify({sheetData})});return id}catch(e){return rejectWithValue(e.message)} })
export const activateCharacter= createAsyncThunk('sheet/activateCharacter',async (id,{getState,rejectWithValue}) => { try{await apiFetch(`/api/characters/${id}/activate`,getState().auth.token,{method:'PATCH',body:'{}'}); return Number(id)}catch(e){return rejectWithValue(e.message)} })
export const deleteCharacter  = createAsyncThunk('sheet/deleteCharacter',  async (id,{getState,rejectWithValue}) => { try{await apiFetch(`/api/characters/${id}`,getState().auth.token,{method:'DELETE'});return id}catch(e){return rejectWithValue(e.message)} })

// ─── Empty sheet ──────────────────────────────────────
export const emptySheet = () => ({
  name_known:'', name_full:'', race:'', age:'', appearance:'', motivation:'', backstory:'',
  level:'1', xp_current:'0', skill_pts:'0', stat_pts:'0',
  fame:'0', karma:'0', infame:'0', status_val:'', crits:'0', luck:'1',
  sp:'0', dc:'0', initiative:'0',
  'stat-str':'10','stat-con':'10','stat-end':'10','stat-int':'10','stat-wis':'10','stat-will':'10',
  'res-cur-hp':'100','res-max-hp':'100',
  'res-cur-mp':'100','res-max-mp':'100',
  'res-cur-pr':'0',  'res-max-pr':'0',
  'res-cur-mr':'0',  'res-max-mr':'0',
  'res-cur-mt':'10', 'res-max-mt':'10',
  'res-cur-ed':'100','res-max-ed':'100',
  'wr-name':'','wr-weight':'0','wr-phys':'0','wr-mag':'0',
  'wl-name':'','wl-weight':'0','wl-phys':'0','wl-mag':'0',
  'max-weight':'30',
  _armor:{}, _shield:{name:'',w:'0',phys:'0',mag:'0'},
  _skillLevels:{},
  _statFloor:{}, _skillFloor:{},   // збережені рівні: нижче них не можна повертати очки
  '_inv_inv-main':[], '_inv_inv-belt':[], '_inv_inv-quest':[],
  '_inv_inv-tools':[], '_inv_inv-books':[], '_inv_inv-ingredients':[],
  '_inv_inv-potions':[], '_inv_inv-horse':[],
  _effects:[], _traits_v2:[], _quirks:[], _spells:[], _recipes:[], _languages:[],
  _notes:'',
  gold:'0', silver:'0', copper:'0',
})

// ─── Slice ────────────────────────────────────────────
const sheetSlice = createSlice({
  name: 'sheet',
  initialState: {
    characters:[], activeCharId:null,
    gmEditCharId:null,   // != null → GM редагує чужий лист (автозбереження йде на gm-маршрут)
    data: emptySheet(),
    _synced: {},          // знімок листа на момент останнього синку (load/save/SSE) для обчислення дельти
    activeTab:'general',
    loadingList:false, loadingChar:false, saving:false, error:null,
    _serverPatch: false,   // true → зміна прийшла від сервера, автозбереження пропускаємо
  },
  reducers: {
    setActiveTab: (st,{payload}) => {
      // Перехід на іншу вкладку скидає незбережений розподіл очок
      if (st.activeTab !== payload) _revertUncommitted(st)
      st.activeTab = payload
    },

    // Вихід із GM-режиму редагування чужого листа
    exitGmEdit: st => { st.gmEditCharId = null; st.activeCharId = null; st.data = emptySheet() },

    /**
     * Патч від сервера (SSE / GM-дія).
     * Встановлює _serverPatch=true щоб useAutoSave його ігнорував.
     */
    applyServerPatch(st, { payload }) {
      st._serverPatch = true
      Object.assign(st.data, payload)
      // Поля прийшли з сервера → синхронізуємо знімок, щоб вони не пішли назад як дельта гравця
      Object.assign(st._synced, payload)
    },

    // Застосувати операцію над колекцією локально (від SSE або власну).
    // Не чіпає _synced скалярних полів — колекції більше не йдуть через дельту.
    applyCollectionOp(st, { payload: op }) {
      st._serverPatch = true
      applyOpLocal(st.data, op)
    },

    // Оновити одне поле
    setField(st, {payload:{key,value}}) {
      st._serverPatch = false
      st.data[key] = value
      // Авто-перерахунок максимумів при зміні характеристик
      if (key.startsWith('stat-')) {
        const statId = key.slice(5)
        Object.entries(AUTO_MAX_MAP).forEach(([resId,dep]) => {
          if (dep===statId) _setMaxWithCur(st, resId, calcAutoMax(resId,value))
        })
      }
      // Перерахунок PR/MR при зміні броні
      if (key==='_armor'||key==='_shield') _recalcArmor(st)
    },

    // Оновити кілька полів одразу (напр. після регулювання стату)
    setFields(st, {payload}) {
      st._serverPatch = false
      Object.assign(st.data, payload)
      Object.entries(AUTO_MAX_MAP).forEach(([resId,dep]) => {
        if (payload[`stat-${dep}`]!==undefined)
          _setMaxWithCur(st, resId, calcAutoMax(resId, st.data[`stat-${dep}`]))
      })
      _recalcArmor(st)
    },

    // Витратити/повернути очко вміння
    adjustSkill(st, {payload:{tableId,skillName,delta,maxLvl,cost,SKILL_COST_TABLE}}) {
      const key     = `${tableId}::${skillName}`
      const cur     = st.data._skillLevels[key] || 0
      const pts     = parseInt(st.data.skill_pts)||0
      const costRow = SKILL_COST_TABLE?.[cost]
      if (delta>0) {
        if (cur>=maxLvl) return
        const price = costRow ? (costRow[cur]??cost) : cost
        if (pts<price) return
        st.data._skillLevels[key] = cur+1
        st.data.skill_pts = String(pts-price)
      } else {
        if (cur<=0) return
        // Не можна опускатись нижче збереженого рівня (floor)
        const floor = (st.data._skillFloor||{})[key] || 0
        if (cur<=floor) return
        const refund = costRow ? (costRow[cur-1]??cost) : cost
        const newLvl = cur-1
        if (newLvl<=0) delete st.data._skillLevels[key]
        else st.data._skillLevels[key] = newLvl
        st.data.skill_pts = String(pts+refund)
      }
    },

    // Витратити/повернути очко характеристики
    adjustStat(st, {payload:{statId,delta}}) {
      const cur = parseInt(st.data[`stat-${statId}`])||0
      const pts = parseInt(st.data.stat_pts)||0
      if (delta>0) {
        if (pts<=0) return
        const nv = cur+1
        st.data[`stat-${statId}`] = String(nv)
        st.data.stat_pts = String(pts-1)
        Object.entries(AUTO_MAX_MAP).forEach(([res,dep]) => { if(dep===statId) _setMaxWithCur(st, res, calcAutoMax(res,nv)) })
      } else {
        if (cur<=1) return
        // Не можна опускатись нижче збереженого рівня (floor)
        const floor = (st.data._statFloor||{})[statId] || 1
        if (cur<=floor) return
        const nv = cur-1
        st.data[`stat-${statId}`] = String(nv)
        st.data.stat_pts = String(pts+1)
        Object.entries(AUTO_MAX_MAP).forEach(([res,dep]) => { if(dep===statId) _setMaxWithCur(st, res, calcAutoMax(res,nv)) })
      }
    },

    // Зберегти розподіл: поточні рівні стають "floor" — нижче них повертати очки не можна
    // ГМ: пряме встановлення рівня навички. Значення = floor, тож гравцю
    // НЕ пропонується "Зберегти розподіл" — зміна майстра застосована одразу.
    gmSetSkill(st, {payload:{key, lvl}}) {
      const v = Math.max(0, parseInt(lvl) || 0)
      if (!st.data._skillLevels) st.data._skillLevels = {}
      if (!st.data._skillFloor)  st.data._skillFloor  = {}
      if (v <= 0) { delete st.data._skillLevels[key]; delete st.data._skillFloor[key] }
      else { st.data._skillLevels[key] = v; st.data._skillFloor[key] = v }
    },

    // ГМ: пряме встановлення характеристики (+floor, +перерахунок авто-максимумів)
    gmSetStat(st, {payload:{statId, value}}) {
      const v = Math.max(1, parseInt(value) || 1)
      st.data[`stat-${statId}`] = String(v)
      if (!st.data._statFloor) st.data._statFloor = {}
      st.data._statFloor[statId] = v
      Object.entries(AUTO_MAX_MAP).forEach(([res, dep]) => { if (dep === statId) _setMaxWithCur(st, res, calcAutoMax(res, v)) })
    },

    commitBuild(st) {
      const statFloor = {}
      for (const id of ['str','con','end','int','wis','will']) {
        statFloor[id] = parseInt(st.data[`stat-${id}`]) || 1
      }
      const skillFloor = {}
      for (const [key, lvl] of Object.entries(st.data._skillLevels || {})) {
        skillFloor[key] = lvl
      }
      st.data._statFloor = statFloor
      st.data._skillFloor = skillFloor
    },

    // XP — автоматичне підвищення рівня
    addXP(st, {payload:amount}) {
      let xp=parseInt(st.data.xp_current)||0, lvl=parseInt(st.data.level)||0, gained=0
      xp+=amount
      while (xp>=(lvl+1)*50) { xp-=(lvl+1)*50; lvl++; gained++ }
      st.data.xp_current=String(xp); st.data.level=String(lvl)
      if (gained>0) {
        st.data.skill_pts=String((parseInt(st.data.skill_pts)||0)+gained*8)
        st.data.stat_pts =String((parseInt(st.data.stat_pts) ||0)+gained*6)
      }
    },

    // Броня
    setArmorSlot(st, {payload:{slot,field,value}}) {
      if (!st.data._armor[slot]) st.data._armor[slot]={name:'',w:'0',phys:'0',mag:'0'}
      st.data._armor[slot][field]=value; _recalcArmor(st)
    },
    setShieldField(st, {payload:{field,value}}) {
      if (!st.data._shield) st.data._shield={name:'',w:'0',phys:'0',mag:'0'}
      st.data._shield[field]=value; _recalcArmor(st)
    },

    // Інвентар
    addInvRow(st, {payload:listId})   { (st.data[`_inv_${listId}`]||=[]).push(['','1','0','0','0','0','']) },
    removeInvRow(st, {payload:{listId,i}}) { st.data[`_inv_${listId}`]?.splice(i,1) },
    reorderInvRows(st, {payload:{listId, from, to}}) {
      const rows = st.data[`_inv_${listId}`]
      if (!rows) return
      const [moved] = rows.splice(from, 1)
      rows.splice(to, 0, moved)
    },
    setInvCell(st, {payload:{listId,i,col,value}}) {
      const rows = st.data[`_inv_${listId}`]
      if (!rows?.[i]) return
      rows[i][col] = value
      // Авто-підрахунок ваги рядка
      if (col===1||col===2) rows[i][3] = String(((parseFloat(rows[i][1])||0)*(parseFloat(rows[i][2])||0)).toFixed(2))
    },

    // Ефекти
    addEffect:    st => { st.data._effects.push({name:''}) },
    updateEffect: (st,{payload:{i,name}})  => { st.data._effects[i].name=name },
    removeEffect: (st,{payload:i}) => { st.data._effects.splice(i,1) },

    // Риси/недоліки
    addTrait:    st => { st.data._traits_v2.push({name:'',cost:'',desc:''}) },
    updateTrait: (st,{payload:{i,f,v}}) => { st.data._traits_v2[i][f]=v },
    removeTrait: (st,{payload:i}) => { st.data._traits_v2.splice(i,1) },

    // Закляття
    addSpell: st => { st.data._spells.push({name:'',school:'Сила вогню',od:'',om:'0',vs:'0',cd:'',range:'',damage:'',desc:''}) },
    updateSpell:(st,{payload:{i,f,v}}) => { st.data._spells[i][f]=v },
    removeSpell:(st,{payload:i}) => { st.data._spells.splice(i,1) },

    // Мови
    addLanguage:    st => { st.data._languages.push({name:'',level:'1'}) },
    updateLanguage: (st,{payload:{i,f,v}}) => { st.data._languages[i][f]=v },
    removeLanguage: (st,{payload:i}) => { st.data._languages.splice(i,1) },

    // Рецепти
    addRecipe:    st => { st.data._recipes.push({name:'',source:'',desc:''}) },
    updateRecipe: (st,{payload:{i,f,v}}) => { st.data._recipes[i][f]=v },
    removeRecipe: (st,{payload:i}) => { st.data._recipes.splice(i,1) },

    // Квірки
    addQuirk:    st => { st.data._quirks.push({name:'',cost:'',desc:''}) },
    updateQuirk: (st,{payload:{i,f,v}}) => { st.data._quirks[i][f]=v },
    removeQuirk: (st,{payload:i}) => { st.data._quirks.splice(i,1) },

    setNotes: (st,{payload}) => { st.data._notes=payload },

    // Завантажити з об'єкта (після імпорту Excel)
    loadFromObject(st, {payload}) {
      st.data = {...emptySheet(), ...payload}
      _recalcArmor(st)
    },

    clearError: st => { st.error=null },
  },

  extraReducers: b => {
    b
      .addCase(fetchCharacters.pending,   st => { st.loadingList=true })
      .addCase(fetchCharacters.fulfilled, (st,{payload}) => { st.loadingList=false; st.characters=payload; const a=payload.find(c=>c.isActive); if(a) st.activeCharId=Number(a._id) })
      .addCase(fetchCharacters.rejected,  (st,{payload}) => { st.loadingList=false; st.error=payload })
      .addCase(loadCharacter.pending,     st => { st.loadingChar=true })
      .addCase(loadCharacter.fulfilled,   (st,{payload}) => { st.loadingChar=false; st.activeCharId=Number(payload._id); st.gmEditCharId=null; st.data=ensureIds({...emptySheet(),...(payload.sheetData||{})}); _migrateSkillKeys(st.data); _initFloor(st.data); st._synced={...st.data}; _recalcArmor(st) })
      .addCase(loadCharacter.rejected,    (st,{payload}) => { st.loadingChar=false; st.error=payload })

      .addCase(gmLoadCharacter.pending,   st => { st.loadingChar=true })
      .addCase(gmLoadCharacter.fulfilled, (st,{payload}) => { st.loadingChar=false; st.gmEditCharId=payload.charId; st.activeCharId=payload.charId; st.data={...emptySheet(),...(payload.sheetData||{})}; _recalcArmor(st) })
      .addCase(gmLoadCharacter.rejected,  (st,{payload}) => { st.loadingChar=false; st.error=payload })
      .addCase(createCharacter.fulfilled, (st,{payload}) => { st.characters.push(payload) })
      .addCase(importCharacter.fulfilled, (st,{payload}) => { st.characters.push(payload) })
      .addCase(activateCharacter.fulfilled,(st,{payload:id}) => { st.activeCharId=id; st.characters=st.characters.map(c=>({...c,isActive:c._id===id})) })
      .addCase(deleteCharacter.fulfilled, (st,{payload:id}) => { st.characters=st.characters.filter(c=>c._id!==id); if(st.activeCharId===id) st.activeCharId=null })
      .addCase(saveCharacter.pending,     st => { st.saving=true })
      .addCase(saveCharacter.fulfilled,   (st,{payload}) => { st.saving=false; if(payload?.patch) Object.assign(st._synced, payload.patch) })
      .addCase(saveCharacter.rejected,    (st,{payload}) => { st.saving=false; st.error=payload })
  },
})

function _recalcArmor(st) {
  const {pr,mr} = calcArmorBonuses(st.data._armor, st.data._shield?.phys)
  st.data['res-max-pr']=String(pr); st.data['res-max-mr']=String(mr)
}

// Ініціалізувати floor рівнів, якщо його ще нема (старі/імпортовані персонажі).
// Floor = поточні значення, щоб уже нажиті стати/вміння не можна було "повернути".
// Вартість навички за повним ключем — для повернення очок при скиданні розподілу
const SKILL_COST_BY_KEY = {}
;[['social-skills-table',SOCIAL_SKILLS],['combat-skills-table',COMBAT_SKILLS],['neutral-skills-table',NEUTRAL_SKILLS],
  ['science-skills-table',SCIENCE_SKILLS],['magic-skills-table',MAGIC_SKILLS],['crime-skills-table',CRIME_SKILLS]]
  .forEach(([catId,list]) => list.forEach(sk => { SKILL_COST_BY_KEY[`${catId}::${sk.name}`] = sk.cost }))

// Скинути НЕзбережений розподіл: рівні повертаються до floor, очки — гравцю.
// Викликається при зміні вкладки: розподіл діє лише після натискання "Зберегти розподіл".
function _revertUncommitted(st) {
  const d = st.data
  if (!d) return
  // навички: повернути очки за все, що вище floor
  const fl = d._skillFloor || {}
  const lv = d._skillLevels || {}
  let pts = parseInt(d.skill_pts) || 0
  let touched = false
  for (const [key, l] of Object.entries({ ...lv })) {
    const f = fl[key] || 0
    if (l > f) {
      const cost = SKILL_COST_BY_KEY[key]
      const row = SKILL_COST_TABLE?.[cost]
      for (let x = f; x < l; x++) pts += row ? (row[x] ?? cost ?? 0) : (cost || 0)
      if (f <= 0) delete lv[key]; else lv[key] = f
      touched = true
    }
  }
  if (touched) d.skill_pts = String(pts)
  // характеристики: 1 очко за крок, скидання з перерахунком авто-максимумів
  const sfl = d._statFloor || {}
  let sp = parseInt(d.stat_pts) || 0
  let sTouched = false
  for (const id of ['str','con','end','int','wis','will']) {
    const cur = parseInt(d[`stat-${id}`]) || 1
    const f = sfl[id] || 1
    if (cur > f) {
      sp += (cur - f)
      d[`stat-${id}`] = String(f)
      Object.entries(AUTO_MAX_MAP).forEach(([res, dep]) => { if (dep === id) _setMaxWithCur(st, res, calcAutoMax(res, f)) })
      sTouched = true
    }
  }
  if (sTouched) d.stat_pts = String(sp)
}

// Міграція ключів навичок до канонічних назв з листа Грюмбля.
// Старі персонажі могли мати перейменовані навички та об'єднану категорію Магія/Наука.
const SKILL_KEY_RENAMES = {
  'combat-skills-table::Легка зброя': 'combat-skills-table::Легка',
  'combat-skills-table::Прицільність (легка/одноручна)': 'combat-skills-table::Прицільність легка та одноручна',
  'combat-skills-table::Прицільність (тяжка/двуручна)': 'combat-skills-table::Прицільність тяжка та двуручна',
  'combat-skills-table::Прицільність (луки/метальна)': 'combat-skills-table::Прицільність луки та метальна',
  'combat-skills-table::Прицільність (кулаки/боротьба)': 'combat-skills-table::Прицільність кулачний бій та боротьба',
  'neutral-skills-table::Грамота (рідна)': 'neutral-skills-table::Грамота (рідна мова)',
}
const SCIENCE_NAMES = new Set(['Розуміння','Аналіз','Грамота (друга мова)','Історія','Картографія',
  'Медицина','Натуралізм','Окультизм','Реанімація','Теологія','Травництво','Хірургія','Мова жестів','Зіллєварство'])
function _migrateSkillKeys(data) {
  for (const field of ['_skillLevels', '_skillFloor']) {
    const src = data[field]
    if (!src || typeof src !== 'object') continue
    const next = {}
    for (const [key, lvl] of Object.entries(src)) {
      let nk = SKILL_KEY_RENAMES[key] || key
      const [cat, name] = nk.split('::')
      if (cat === 'magic-skills-table' && SCIENCE_NAMES.has(name)) nk = `science-skills-table::${name}`
      next[nk] = lvl
    }
    data[field] = next
  }
}

function _initFloor(data) {
  if (!data._statFloor || Object.keys(data._statFloor).length === 0) {
    const sf = {}
    for (const id of ['str','con','end','int','wis','will']) sf[id] = parseInt(data[`stat-${id}`]) || 1
    data._statFloor = sf
  }
  if (!data._skillFloor || Object.keys(data._skillFloor).length === 0) {
    const kf = {}
    for (const [k,l] of Object.entries(data._skillLevels || {})) kf[k] = l
    data._skillFloor = kf
  }
}

// Оновити максимум ресурсу і зсунути поточне на ту саму дельту.
// Напр. HP 150/200, новий макс 250 → поточне теж +50 → 200/250.
// Поточне не опускаємо нижче 0 і не піднімаємо вище нового максимуму.
function _setMaxWithCur(st, resId, newMax) {
  const oldMax = parseFloat(st.data[`res-max-${resId}`]) || 0
  const delta  = newMax - oldMax
  st.data[`res-max-${resId}`] = String(newMax)
  if (delta !== 0) {
    const oldCur = parseFloat(st.data[`res-cur-${resId}`]) || 0
    let newCur = oldCur + delta
    if (newCur < 0) newCur = 0
    if (newCur > newMax) newCur = newMax
    st.data[`res-cur-${resId}`] = String(newCur)
  }
}

export const {
  setActiveTab, setField, setFields,
  applyServerPatch, applyCollectionOp, exitGmEdit,
  adjustSkill, adjustStat, addXP, commitBuild, gmSetSkill, gmSetStat,
  setArmorSlot, setShieldField,
  addInvRow, removeInvRow, setInvCell, reorderInvRows,
  addEffect, updateEffect, removeEffect,
  addTrait, updateTrait, removeTrait,
  addSpell, updateSpell, removeSpell,
  addLanguage, updateLanguage, removeLanguage,
  addRecipe, updateRecipe, removeRecipe,
  addQuirk, updateQuirk, removeQuirk,
  setNotes, loadFromObject, clearError,
} = sheetSlice.actions

export default sheetSlice.reducer

export const selSheet = {
  data:          st => st.sheet.data,
  f:             key => st => st.sheet.data[key],
  activeTab:     st => st.sheet.activeTab,
  characters:    st => st.sheet.characters,
  activeCharId:  st => st.sheet.activeCharId,
  gmEditCharId:  st => st.sheet.gmEditCharId,
  loadingList:   st => st.sheet.loadingList,
  loadingChar:   st => st.sheet.loadingChar,
  saving:        st => st.sheet.saving,
  error:         st => st.sheet.error,
  serverPatch:   st => st.sheet._serverPatch,
  synced:        st => st.sheet._synced,
  skill:         (tId,name) => st => st.sheet.data._skillLevels?.[`${tId}::${name}`]||0,
  armor:         slot => st => st.sheet.data._armor?.[slot]||{},
  inv:           lid  => st => st.sheet.data[`_inv_${lid}`]||[],
}
