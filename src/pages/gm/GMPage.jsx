import { useDispatch, useSelector } from 'react-redux'
import { Users, Library, Swords, ScrollText } from 'lucide-react'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { logout, selAuth } from '../../store/slices/authSlice'
import { setGmTab, selGm } from '../../store/slices/gmSlice'
import GMParties from './GMParties'
import GMItems      from './GMItems'
import GMFight from './GMFight'
import DiceRoller from '../../components/ui/DiceRoller'
import GMLogs from './GMLogs'
import GMSheetView from './GMSheetView'
import s from './GMPage.module.css'

const TABS = [
  { id: 'parties', label: 'Пачки',   path: '/gm',       Icon: Users   },
  { id: 'items',   label: 'База',    path: '/gm/items', Icon: Library },
  { id: 'fight',   label: 'Бій',     path: '/gm/fight', Icon: Swords  },
  { id: 'logs',    label: 'Журнал',  path: '/gm/logs',  Icon: ScrollText },
]

export default function GMPage() {
  const dispatch  = useDispatch()
  const navigate  = useNavigate()
  const location  = useLocation()
  const username  = useSelector(selAuth.username)

  const activeTab = TABS.find(t =>
    t.path === '/gm'
      ? location.pathname === '/gm' || location.pathname === '/gm/'
      : location.pathname.startsWith(t.path)
  )?.id || 'parties'

  return (
    <div className={s.layout}>
      {/* ── Sidebar ── */}
      <aside className={s.sidebar}>
        <div className={s.sideHeader}>
          <div className={s.gmBadge}>GM</div>
          <div>
            <div className={s.gmName}>{username}</div>
            <div className={s.gmRole}>Майстер</div>
          </div>
        </div>

        <nav className={s.nav}>
          {TABS.map(t => (
            <button key={t.id}
              className={`${s.navBtn} ${activeTab === t.id ? s.navActive : ''}`}
              onClick={() => navigate(t.path)}>
              <t.Icon size={14} strokeWidth={1.8} style={{ verticalAlign: '-2px', marginRight: 6, opacity: .8 }} aria-hidden />
              {t.label}
            </button>
          ))}
        </nav>

        <button className={s.logoutBtn} onClick={() => { dispatch(logout()); navigate('/login') }}>
          Вийти
        </button>
      </aside>

      {/* ── Контент ── */}
      <main className={s.content}>
        <Routes>
          <Route index           element={<GMParties    />} />
          <Route path="items"     element={<GMItems      />} />
          <Route path="fight"     element={<GMFight      />} />
          <Route path="logs"      element={<GMLogs       />} />
          <Route path="sheet/:charId" element={<GMSheetView />} />
        </Routes>
      </main>

      {/* Кубики майстра: кидає у вибрану пачку, бачить кидки гравців */}
      <DiceRoller gm />
    </div>
  )
}
