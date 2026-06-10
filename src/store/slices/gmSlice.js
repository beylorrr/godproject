/**
 * gmSlice.js — стан GM інтерфейсу
 */
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { emptySheet } from './sheetSlice'

const API = import.meta.env.VITE_API_URL ?? ''   // порожньо => відносні /api шляхи (через vite proxy у dev і той самий хост у prod)

const apiFetch = async (path, token, opts = {}) => {
  const hasBody = opts.body !== undefined
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      'Authorization': `Bearer ${token}`,
    },
  })
  const d = await res.json().catch(() => ({}))
  if (res.status === 401) {
    // протухлий/відсутній токен — чистимо локальний стан і на логін
    try { localStorage.removeItem('persist:charsheet_v2') } catch {}
    if (typeof location !== 'undefined') location.assign('/')
    throw new Error('Сесія завершилась, увійдіть знову')
  }
  if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`)
  return d
}

// ── Thunks ─────────────────────────────────────────────
export const fetchParties    = createAsyncThunk('gm/fetchParties',  async (_, {getState,rejectWithValue}) => { try{return await apiFetch('/api/parties',getState().auth.token)}catch(e){return rejectWithValue(e.message)} })
export const fetchParty      = createAsyncThunk('gm/fetchParty',    async (id,{getState,rejectWithValue}) => { try{return await apiFetch(`/api/parties/${id}`,getState().auth.token)}catch(e){return rejectWithValue(e.message)} })
export const createParty     = createAsyncThunk('gm/createParty',   async (data,{getState,rejectWithValue}) => { try{return await apiFetch('/api/parties',getState().auth.token,{method:'POST',body:JSON.stringify(data)})}catch(e){return rejectWithValue(e.message)} })
export const deleteParty     = createAsyncThunk('gm/deleteParty',   async (id,{getState,rejectWithValue}) => { try{await apiFetch(`/api/parties/${id}`,getState().auth.token,{method:'DELETE'});return id}catch(e){return rejectWithValue(e.message)} })

export const fetchPlayers    = createAsyncThunk('gm/fetchPlayers',  async (_,{getState,rejectWithValue}) => { try{return await apiFetch('/api/gm/players',getState().auth.token)}catch(e){return rejectWithValue(e.message)} })

// Видати предмет з бази майстра в інвентар гравця (op add у його активного персонажа)
export const giveItemToPlayer = createAsyncThunk('gm/giveItem', async ({charId, item}, {getState,rejectWithValue}) => {
  const token = getState().auth.token
  // Новий _id, щоб не злився з наявними; копія даних предмета
  const { id, _id, ...itemData } = item
  const row = { ...itemData, _id: 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2,7) }
  try {
    return await apiFetch(`/api/gm/char/${charId}/op`, token, {
      method:'POST',
      body: JSON.stringify({ collection:'_inv_inv-main', action:'add', row, rowId: row._id }),
    })
  } catch(e){ return rejectWithValue(e.message) }
})
// Видати закляття/здібність гравцю — додає рядок у його вкладку "Закляття та здатності"
// ГМ призначає персонажа гравця до пачки (partyId=null — прибрати з пачки)
export const assignPartyGm = createAsyncThunk('gm/assignParty', async ({userId, charId, partyId}, {getState,rejectWithValue}) => {
  try {
    return await apiFetch('/api/gm/assign-party', getState().auth.token, {
      method:'POST', body: JSON.stringify({ userId, charId, partyId }),
    })
  } catch(e){ return rejectWithValue(e.message) }
})

export const giveSpellToPlayer = createAsyncThunk('gm/giveSpell', async ({charId, spell}, {getState,rejectWithValue}) => {
  const token = getState().auth.token
  const row = { ...spell, _id: 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2,7) }
  try {
    return await apiFetch(`/api/gm/char/${charId}/op`, token, {
      method:'POST',
      body: JSON.stringify({ collection:'_spells', action:'add', row, rowId: row._id }),
    })
  } catch(e){ return rejectWithValue(e.message) }
})
export const awardXP         = createAsyncThunk('gm/awardXP',       async (data,{getState,rejectWithValue}) => { try{return await apiFetch('/api/gm/award-xp',getState().auth.token,{method:'POST',body:JSON.stringify(data)})}catch(e){return rejectWithValue(e.message)} })
export const dealDamage      = createAsyncThunk('gm/dealDamage',    async (data,{getState,rejectWithValue}) => { try{return await apiFetch('/api/gm/damage',getState().auth.token,{method:'POST',body:JSON.stringify(data)})}catch(e){return rejectWithValue(e.message)} })
export const healChar        = createAsyncThunk('gm/healChar',      async (data,{getState,rejectWithValue}) => { try{return await apiFetch('/api/gm/heal',getState().auth.token,{method:'POST',body:JSON.stringify(data)})}catch(e){return rejectWithValue(e.message)} })
export const awardPts        = createAsyncThunk('gm/awardPts',      async (data,{getState,rejectWithValue}) => { try{return await apiFetch('/api/gm/award-pts',getState().auth.token,{method:'POST',body:JSON.stringify(data)})}catch(e){return rejectWithValue(e.message)} })

export const fetchItems      = createAsyncThunk('gm/fetchItems',    async (type,{getState,rejectWithValue}) => { try{return await apiFetch(`/api/gm/items${type?`?type=${type}`:''}`,getState().auth.token)}catch(e){return rejectWithValue(e.message)} })
export const createItem      = createAsyncThunk('gm/createItem',    async (data,{getState,rejectWithValue}) => { try{return await apiFetch('/api/gm/items',getState().auth.token,{method:'POST',body:JSON.stringify(data)})}catch(e){return rejectWithValue(e.message)} })
export const updateItem      = createAsyncThunk('gm/updateItem',    async ({id,...data},{getState,rejectWithValue}) => { try{return await apiFetch(`/api/gm/items/${id}`,getState().auth.token,{method:'PUT',body:JSON.stringify(data)})}catch(e){return rejectWithValue(e.message)} })
export const deleteItem      = createAsyncThunk('gm/deleteItem',    async (id,{getState,rejectWithValue}) => { try{await apiFetch(`/api/gm/items/${id}`,getState().auth.token,{method:'DELETE'});return id}catch(e){return rejectWithValue(e.message)} })

export const joinParty       = createAsyncThunk('gm/joinParty',     async ({partyId,charId},{getState,rejectWithValue}) => { try{return await apiFetch(`/api/parties/${partyId}/join`,getState().auth.token,{method:'POST',body:JSON.stringify({charId})})}catch(e){return rejectWithValue(e.message)} })
export const leaveParty      = createAsyncThunk('gm/leaveParty',    async (partyId,{getState,rejectWithValue}) => { try{await apiFetch(`/api/parties/${partyId}/leave`,getState().auth.token,{method:'DELETE'});return partyId}catch(e){return rejectWithValue(e.message)} })

// Видалити гравця з пачки (GM)
export const kickMember      = createAsyncThunk('gm/kickMember',    async ({partyId,userId},{getState,rejectWithValue}) => { try{await apiFetch(`/api/parties/${partyId}/members/${userId}`,getState().auth.token,{method:'DELETE'});return {partyId,userId}}catch(e){return rejectWithValue(e.message)} })

// Масова дія над кількома персонажами одночасно
export const batchAction     = createAsyncThunk('gm/batchAction',   async (data,{getState,rejectWithValue}) => { try{return await apiFetch('/api/gm/batch',getState().auth.token,{method:'POST',body:JSON.stringify(data)})}catch(e){return rejectWithValue(e.message)} })

// Передача грошей/предметів між гравцями пачки
export const transferToMember = createAsyncThunk('gm/transferToMember', async (data, {getState,rejectWithValue}) => {
  try { return await apiFetch(`/api/parties/${data.partyId}/transfer`, getState().auth.token, {method:'POST',body:JSON.stringify(data)}) }
  catch(e) { return rejectWithValue(e.message) }
})

// Гравець завантажує список учасників своєї пачки (для передачі)
export const fetchJoinedPartyMembers = createAsyncThunk('gm/fetchJoinedPartyMembers', async (partyId, {getState,rejectWithValue}) => {
  try { return await apiFetch(`/api/parties/${partyId}`, getState().auth.token) }
  catch(e) { return rejectWithValue(e.message) }
})
// Завантажити лист конкретного персонажа в GM-стан (не чіпає sheetSlice)
export const gmViewLoad      = createAsyncThunk('gm/viewLoad',      async (charId,{getState,rejectWithValue}) => { try{return await apiFetch(`/api/gm/char/${charId}`,getState().auth.token)}catch(e){return rejectWithValue(e.message)} })
// Зберегти поточний GM-стан листа назад на сервер
export const gmViewSave      = createAsyncThunk('gm/viewSave',      async ({charId,sheetData},{getState,rejectWithValue}) => { try{await apiFetch(`/api/gm/char/${charId}`,getState().auth.token,{method:'PUT',body:JSON.stringify({sheetData})});return charId}catch(e){return rejectWithValue(e.message)} })

// ── Slice ───────────────────────────────────────────────
const gmSlice = createSlice({
  name: 'gm',
  initialState: {
    parties:          [],
    activeParty:      null,
    activePartyId:    null,
    joinedPartyMembers: [],    // учасники пачки гравця (для передачі)
    players:          [],
    items:            [],
    loading:          false,
    actionLoading:    false,
    error:            null,
    lastActionResult: null,
    gmTab:            'parties',  // 'parties' | 'players' | 'items'
  },
  reducers: {
    setGmTab:         (st,{payload}) => { st.gmTab = payload },
    setActivePartyId: (st,{payload}) => { st.activePartyId = payload },
    clearError:       st => { st.error = null },
    clearResult:      st => { st.lastActionResult = null },
    // Лайв-оновлення міні-панелі: гравець щось змінив → GM бачить одразу
    patchMemberSheet: (st, {payload: {charId, sheetData}}) => {
      if (!st.activeParty?.members) return
      const m = st.activeParty.members.find(m => m.charId === charId)
      if (m) m.sheetData = sheetData
    },
  },
  extraReducers: b => {
    const load = st => { st.loading = true; st.error = null }
    const act  = st => { st.actionLoading = true; st.error = null }
    const fail = (st, {payload}) => { st.loading = false; st.actionLoading = false; st.error = payload }

    b
      .addCase(fetchParties.pending,    load)
      .addCase(fetchParties.fulfilled,  (st,{payload}) => { st.loading=false; st.parties=payload })
      .addCase(fetchParties.rejected,   fail)

      .addCase(fetchParty.pending,      load)
      .addCase(fetchParty.fulfilled,    (st,{payload}) => { st.loading=false; st.activeParty=payload })
      .addCase(fetchParty.rejected,     fail)

      .addCase(createParty.fulfilled,   (st,{payload}) => { st.parties.unshift(payload) })
      .addCase(deleteParty.fulfilled,   (st,{payload}) => { st.parties=st.parties.filter(p=>p.id!==payload); if(st.activePartyId===payload){st.activePartyId=null;st.activeParty=null} })

      .addCase(fetchPlayers.pending,    load)
      .addCase(fetchPlayers.fulfilled,  (st,{payload}) => { st.loading=false; st.players=payload })
      .addCase(fetchPlayers.rejected,   fail)

      .addCase(awardXP.pending,         act)
      .addCase(awardXP.fulfilled,       (st,{payload}) => { st.actionLoading=false; st.lastActionResult=payload })
      .addCase(awardXP.rejected,        fail)

      .addCase(dealDamage.pending,      act)
      .addCase(dealDamage.fulfilled,    (st,{payload}) => { st.actionLoading=false; st.lastActionResult=payload })
      .addCase(dealDamage.rejected,     fail)

      .addCase(healChar.pending,        act)
      .addCase(healChar.fulfilled,      (st,{payload}) => { st.actionLoading=false; st.lastActionResult=payload })
      .addCase(healChar.rejected,       fail)

      .addCase(awardPts.pending,        act)
      .addCase(awardPts.fulfilled,      (st,{payload}) => { st.actionLoading=false; st.lastActionResult=payload })
      .addCase(awardPts.rejected,       fail)

      .addCase(fetchItems.pending,      load)
      .addCase(fetchItems.fulfilled,    (st,{payload}) => { st.loading=false; st.items=payload })
      .addCase(fetchItems.rejected,     fail)

      .addCase(createItem.fulfilled,    (st,{payload}) => { st.items.unshift(payload) })
      .addCase(updateItem.fulfilled,    (st,{payload}) => { st.items=st.items.map(i=>i.id===payload.id?payload:i) })
      .addCase(deleteItem.fulfilled,    (st,{payload}) => { st.items=st.items.filter(i=>i.id!==payload) })

      .addCase(joinParty.fulfilled,     (st,{payload}) => {
        // Одна активна пачка: joined стоїть РІВНО на тій, куди щойно зайшли
        const pid = Number(payload.partyId)
        st.parties = st.parties.map(p => ({ ...p, joined: Number(p.id) === pid ? 1 : null }))
      })
      .addCase(leaveParty.fulfilled,    (st,{payload}) => {
        st.parties = st.parties.map(p => p.id === payload ? { ...p, joined: null } : p)
      })

      .addCase(fetchJoinedPartyMembers.fulfilled, (st,{payload}) => { st.joinedPartyMembers = payload?.members || [] })

      .addCase(kickMember.fulfilled,    (st,{payload}) => {
        // прибираємо гравця з активної пачки + оновлюємо лічильник
        if (st.activeParty && st.activeParty.id === payload.partyId) {
          st.activeParty.members = (st.activeParty.members||[]).filter(m => m.userId !== payload.userId)
        }
        st.parties = st.parties.map(p => p.id === payload.partyId
          ? { ...p, member_count: Math.max(0,(p.member_count||1)-1) } : p)
      })

      .addCase(batchAction.pending,     act)
      .addCase(batchAction.fulfilled,   (st,{payload}) => { st.actionLoading=false; st.lastActionResult={ batch:true, count:payload.count } })
      .addCase(batchAction.rejected,    fail)
  },
})

export const { setGmTab, setActivePartyId, clearError, clearResult, patchMemberSheet } = gmSlice.actions
export default gmSlice.reducer

export const selGm = {
  parties:       st => st.gm.parties,
  joinedPartyMembers: st => st.gm.joinedPartyMembers,
  activeParty:   st => st.gm.activeParty,
  activePartyId: st => st.gm.activePartyId,
  players:       st => st.gm.players,
  items:         st => st.gm.items,
  loading:       st => st.gm.loading,
  actionLoading: st => st.gm.actionLoading,
  error:         st => st.gm.error,
  lastResult:    st => st.gm.lastActionResult,
  gmTab:         st => st.gm.gmTab,
}
