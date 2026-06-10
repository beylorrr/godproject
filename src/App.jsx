import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { selAuth, verifySession } from './store/slices/authSlice'
import { useSSE } from './hooks/useSSE'
import LoginPage       from './pages/LoginPage'
import CharactersPage  from './pages/CharactersPage'
import SheetPage       from './pages/SheetPage'
import PartySelectPage from './pages/PartySelectPage'
import GMPage          from './pages/gm/GMPage'

// Захист маршруту + редирект за роллю

// Тільки GM/admin. Гравець, що відкрив GM-URL, летить на свою стартову сторінку.
function RequireGM({ children }) {
  const isAuthed = useSelector(selAuth.isAuthed)
  const isGM     = useSelector(selAuth.isGM)
  if (!isAuthed) return <Navigate to="/login" replace />
  if (!isGM)     return <Navigate to="/party-select" replace />
  return children
}

// Тільки гравець. GM, що клікнув гравецький маршрут, повертається в GM-панель.
function RequirePlayer({ children }) {
  const isAuthed = useSelector(selAuth.isAuthed)
  const isGM     = useSelector(selAuth.isGM)
  if (!isAuthed) return <Navigate to="/login" replace />
  if (isGM)      return <Navigate to="/gm" replace />
  return children
}

function RoleRouter() {
  const isAuthed = useSelector(selAuth.isAuthed)
  const isGM     = useSelector(selAuth.isGM)
  if (!isAuthed) return <Navigate to="/login" replace />
  return <Navigate to={isGM ? '/gm' : '/party-select'} replace />
}

export default function App() {
  const dispatch = useDispatch()
  useSSE()  // SSE-підключення: живе оновлення листа від GM

  // При старті перевіряємо збережений токен. Протухлий — тихо виходить сам, без ручного скидання.
  useEffect(() => { dispatch(verifySession()) }, [])

  return (
    <BrowserRouter>
      <Routes>
        {/* Публічна */}
        <Route path="/login" element={<LoginPage />} />

        {/* Після логіну — редирект за роллю */}
        <Route path="/" element={<RoleRouter />} />

        {/* Гравці */}
        <Route path="/party-select" element={<RequirePlayer><PartySelectPage /></RequirePlayer>} />
        <Route path="/characters"   element={<RequirePlayer><CharactersPage  /></RequirePlayer>} />
        <Route path="/sheet"        element={<RequirePlayer><SheetPage        /></RequirePlayer>} />

        {/* GM */}
        <Route path="/gm/*"         element={<RequireGM><GMPage           /></RequireGM>} />

        <Route path="*"             element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
