import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'

const API = import.meta.env.VITE_API_URL ?? ''   // порожньо => відносні /api шляхи (через vite proxy у dev і той самий хост у prod)

export const login = createAsyncThunk('auth/login', async ({ username, password }, { rejectWithValue }) => {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const d = await res.json()
  return res.ok ? d : rejectWithValue(d.error || 'Помилка входу')
})

export const register = createAsyncThunk('auth/register', async ({ username, password, role, gmCode }, { rejectWithValue }) => {
  const res = await fetch(`${API}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, role: role || 'player', ...(gmCode ? { gmCode } : {}) }),
  })
  const d = await res.json()
  return res.ok ? d : rejectWithValue(d.error || 'Помилка реєстрації')
})

// Перевірка збереженого токену при старті. Якщо токен битий/протух — тихо виходимо.
export const verifySession = createAsyncThunk('auth/verify', async (_, { getState, rejectWithValue }) => {
  const token = getState().auth.token
  if (!token) return rejectWithValue('no-token')
  try {
    const res = await fetch(`${API}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return rejectWithValue('invalid')
    return await res.json()
  } catch {
    // мережа недоступна — НЕ виходимо, лишаємо токен (можливо бекенд просто ще не піднявся)
    return rejectWithValue('network')
  }
})

const s = createSlice({
  name: 'auth',
  initialState: { token: null, username: null, userId: null, role: 'player', loading: false, error: null, verified: false },
  reducers: {
    logout:     st => { st.token=null; st.username=null; st.userId=null; st.role='player'; st.error=null; st.verified=false },
    clearError: st => { st.error=null },
  },
  extraReducers: b => {
    const p = st => { st.loading=true; st.error=null }
    const f = (st, {payload}) => {
      st.loading=false; st.token=payload.token
      st.username=payload.username; st.userId=payload.userId
      st.role=payload.role||'player'
      st.verified=true
    }
    const r = (st, {payload}) => { st.loading=false; st.error=payload }
    b.addCase(login.pending,p).addCase(login.fulfilled,f).addCase(login.rejected,r)
     .addCase(register.pending,p).addCase(register.fulfilled,f).addCase(register.rejected,r)
     // Валідація сесії при старті
     .addCase(verifySession.fulfilled, (st,{payload}) => {
       st.verified=true
       // оновлюємо роль/ім'я на випадок якщо змінились на сервері
       st.username=payload.username; st.userId=payload.userId; st.role=payload.role||st.role
     })
     .addCase(verifySession.rejected, (st,{payload}) => {
       st.verified=true
       // Токен невалідний/протух — виходимо. При мережевій помилці лишаємо як є.
       if (payload === 'invalid' || payload === 'no-token') {
         st.token=null; st.username=null; st.userId=null; st.role='player'
       }
     })
  },
})

export const { logout, clearError } = s.actions
export default s.reducer

export const selAuth = {
  token:    st => st.auth.token,
  username: st => st.auth.username,
  userId:   st => st.auth.userId,
  isAuthed: st => !!st.auth.token,
  role:     st => st.auth.role,
  isGM:     st => st.auth.role === 'gm' || st.auth.role === 'admin',
  loading:  st => st.auth.loading,
  error:    st => st.auth.error,
  verified: st => st.auth.verified,
}
