/**
 * GMLogs.jsx — журнал дій гравців для майстра.
 * Читає GET /api/gm/logs: кидки, зміни ХП/грошей, створення/видалення
 * предметів і заклять, дії майстра, рухи по пачках.
 */
import { useState, useEffect } from 'react'
import { useSelector } from 'react-redux'
import { selAuth } from '../../store/slices/authSlice'
import { RefreshCw, ScrollText, Dice5, Heart, Coins, Package, Flame, Users, Crown, PenLine } from 'lucide-react'
import s from './GM.module.css'

const API = import.meta.env.VITE_API_URL ?? ''

// Тип запису → іконка, колір, підпис
const TYPE_META = {
  roll:  { Icon: Dice5,   color: '#7fa8d6', label: 'Кидок'   },
  hp:    { Icon: Heart,   color: '#c05050', label: 'Ресурси' },
  money: { Icon: Coins,   color: 'var(--gold3)', label: 'Гроші' },
  item:  { Icon: Package, color: '#c98445', label: 'Предмет' },
  spell: { Icon: Flame,   color: '#a87fe8', label: 'Закляття' },
  party: { Icon: Users,   color: '#6aaa7a', label: 'Пачка'   },
  gm:    { Icon: Crown,   color: 'var(--gold2)', label: 'Майстер' },
  note:  { Icon: PenLine, color: '#9a8fb5', label: 'Записи'  },
}

const fmtTime = (ts) => {
  const d = new Date(ts)
  const today = new Date().toDateString() === d.toDateString()
  const hm = d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
  return today ? hm : `${d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' })} ${hm}`
}

export default function GMLogs() {
  const token = useSelector(selAuth.token)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('')
  const [partyFilter, setPartyFilter] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API}/api/gm/logs?limit=300`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) setRows(await res.json())
    } catch { /* мережа */ }
    setLoading(false)
  }
  useEffect(() => {
    load()
    // автооновлення журналу кожні 8с
    const t = setInterval(load, 8000)
    return () => clearInterval(t)
  }, [])

  const shown = rows
    .filter(r => !filter || r.type === filter)
    .filter(r => !partyFilter || String(r.party_id || '') === partyFilter)
  const partyOpts = [...new Map(rows.filter(r => r.party_id).map(r => [String(r.party_id), r.party_name || `Пачка ${r.party_id}`])).entries()]
  const types = [...new Set(rows.map(r => r.type).filter(Boolean))]

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12, flexWrap: 'wrap' }}>
        <h2 className={s.pageTitle}><ScrollText size={17} strokeWidth={1.8} style={{ verticalAlign: '-2px', marginRight: 8 }} aria-hidden />Журнал</h2>
        <button className={s.ghostBtn} onClick={load} disabled={loading} title="Оновити журнал">
          <RefreshCw size={13} className={loading ? s.spin : ''} aria-hidden /> Оновити
        </button>
      </div>

      {types.length > 1 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
          <button className={`${s.filterBtn} ${!filter ? s.filterActive : ''}`} onClick={() => setFilter('')}>Всі</button>
          {types.map(t => {
            const m = TYPE_META[t] || {}
            return (
              <button key={t} className={`${s.filterBtn} ${filter === t ? s.filterActive : ''}`} onClick={() => setFilter(t)}>
                {m.label || t}
              </button>
            )
          })}
        </div>
      )}

      {partyOpts.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
          <button className={`${s.filterBtn} ${!partyFilter ? s.filterActive : ''}`} onClick={() => setPartyFilter('')}>Всі пачки</button>
          {partyOpts.map(([pid, name]) => (
            <button key={pid} className={`${s.filterBtn} ${partyFilter === pid ? s.filterActive : ''}`}
              onClick={() => setPartyFilter(pid)}>{name}</button>
          ))}
        </div>
      )}

      {shown.length === 0 && !loading && (
        <div style={{ fontFamily: "'EB Garamond',serif", fontStyle: 'italic', color: 'var(--muted)', padding: '16px 4px' }}>
          Журнал порожній — дії гравців з'являтимуться тут.
        </div>
      )}

      <div>
        {shown.map(r => {
          const m = TYPE_META[r.type] || { Icon: ScrollText, color: 'var(--muted)', label: r.type }
          return (
            <div key={r.id} className="item-row" style={{ marginBottom: 4, borderLeftColor: m.color }}>
              <div className="item-row-main">
                <span title={m.label} style={{ color: m.color, display: 'inline-flex', flexShrink: 0 }}>
                  <m.Icon size={14} strokeWidth={1.8} aria-hidden />
                </span>
                <span style={{ fontFamily: "'Cinzel',serif", fontSize: '.7rem', fontWeight: 700,
                  color: r.type === 'gm' || r.actor === 'Майстер' ? 'var(--gold2)' : 'var(--iv2)', flexShrink: 0 }}>
                  {r.actor || '—'}
                </span>
                <span style={{ fontFamily: "'EB Garamond',serif", fontSize: '.92rem', color: 'var(--iv2)',
                  minWidth: 0, overflowWrap: 'break-word' }}>
                  {r.message}
                </span>
                {r.party_name && (
                  <span style={{ fontFamily: "'Cinzel',serif", fontSize: '.58rem', color: 'var(--muted)',
                    border: '1px solid var(--br)', borderRadius: 3, padding: '1px 5px', flexShrink: 0 }}>
                    {r.party_name}
                  </span>
                )}
                <span style={{ marginLeft: 'auto', fontFamily: "'Cinzel',serif", fontSize: '.62rem',
                  color: 'var(--muted)', flexShrink: 0 }} title={new Date(r.ts).toLocaleString('uk-UA')}>
                  {fmtTime(r.ts)}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
