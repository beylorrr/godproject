import { useState, useEffect, useRef } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { selSheet } from '../../store/slices/sheetSlice'
import { selAuth } from '../../store/slices/authSlice'
import { selGm, fetchParties } from '../../store/slices/gmSlice'
import s from './DiceRoller.module.css'

const API = import.meta.env.VITE_API_URL ?? ''
const DICE = [2, 4, 6, 8, 10, 12, 20, 100]
const LOG_KEY = 'dice_log_v1'
const LOG_MAX = 60

function loadLog() {
  try {
    const raw = localStorage.getItem(LOG_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export default function DiceRoller({ gm = false }) {
  const token = useSelector(selAuth.token)
  const myUserId = useSelector(selAuth.userId)
  const data  = useSelector(selSheet.data)
  const dispatch = useDispatch()
  const parties = useSelector(selGm.parties)
  const [partyId, setPartyId] = useState('')
  const [hidden, setHidden]   = useState(false)
  const [mode, setMode]       = useState('norm')   // norm | adv | dis

  // ГМ: підтягнути пачки і авто-вибрати першу
  useEffect(() => { if (gm && parties.length === 0) dispatch(fetchParties()) }, [gm])
  useEffect(() => { if (gm && !partyId && parties.length > 0) setPartyId(String(parties[0].id ?? parties[0]._id)) }, [gm, parties])
  const [open, setOpen]   = useState(false)
  const [log, setLog]     = useState(loadLog)
  const [modifier, setMod] = useState(0)
  const [count, setCount] = useState(1)
  const [rolling, setRolling] = useState(false)
  const [anim, setAnim]   = useState(null)
  const logRef = useRef(null)
  const seenIds = useRef(new Set(log.map(r => r.id).filter(Boolean)))

  useEffect(() => { window.__diceRollerOpen = open; return () => { window.__diceRollerOpen = false } }, [open])

  // Додати кидок у лог з дедуплікацією за id (усуває дублі fetch+SSE)
  const pushRoll = (p) => {
    if (!p) return
    const key = p.id || `${p.userId}-${p.ts}`
    if (seenIds.current.has(key)) return
    seenIds.current.add(key)
    setLog(prev => {
      const next = [...prev, p].slice(-LOG_MAX)
      try { localStorage.setItem(LOG_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }

  useEffect(() => {
    const onRoll = (e) => pushRoll(e.detail)
    window.addEventListener('dice_roll', onRoll)
    return () => window.removeEventListener('dice_roll', onRoll)
  }, [])

  useEffect(() => {
    if (open && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log, open])

  const charName = gm ? 'Майстер' : (data.name_known || data.name_full || 'Герой')

  const activeSkills = []
  Object.entries(data._skillLevels || {}).forEach(([key, lvl]) => {
    const [, name] = key.split('::')
    if (name && lvl > 0) activeSkills.push({ name, lvl })
  })
  const activeEffects = (data._effects || []).filter(e => e.name)

  const mod = Number(modifier) || 0

  const roll = async (sides) => {
    if (rolling) return
    setRolling(true)
    setAnim({ sides, face: 1 })
    let ticks = 0
    const spin = setInterval(() => {
      setAnim({ sides, face: Math.floor(Math.random() * sides) + 1 })
      if (++ticks > 9) clearInterval(spin)
    }, 55)

    try {
      const sendMode = sides === 20 && mode !== 'norm' ? mode : null
      const url  = gm ? `${API}/api/gm/roll` : `${API}/api/parties/roll`
      const body = gm
        ? { partyId: Number(partyId) || null, hidden, sides, count: Number(count) || 1, modifier: mod, mode: sendMode }
        : { sides, count: Number(count) || 1, modifier: mod, charName, mode: sendMode }
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      const p = res.ok ? await res.json() : null
      setTimeout(() => {
        clearInterval(spin)
        setAnim(null)
        pushRoll(p)
        setRolling(false)
      }, 580)
    } catch {
      clearInterval(spin); setAnim(null); setRolling(false)
    }
  }

  const fmtMod = (m) => m ? (m > 0 ? ` +${m}` : ` −${Math.abs(m)}`) : ''
  // Кріт/провал: чиста 20/1 на d20 (одна кістка або обрана при перевазі/недоліку)
  const natRoll = (p) => p.sides === 20 ? (p.mode ? p.picked : (p.count === 1 ? p.rolls[0] : null)) : null
  const isCrit   = (p) => natRoll(p) === 20
  const isFumble = (p) => natRoll(p) === 1
  const modeTag  = (m) => m === 'adv' ? 'ПЕР' : m === 'dis' ? 'НЕД' : ''
  const fmtRolls = (p) => p.mode
    ? `[${p.rolls.join(' | ')}] → ${p.picked}`
    : `[${p.rolls.join(', ')}]`
  const gmDisabled = gm && !hidden && !partyId
  const bump = (delta) => setMod(m => (Number(m) || 0) + delta)
  // Сцена показує лише власний останній кидок; чужі йдуть тільки в журнал —
  // інакше здається, що кубик "крутиться" у того, хто не кидав.
  const visible = gm
    ? log.filter(p => !p.partyId || !partyId || String(p.partyId) === String(partyId) || p.gm)
    : log
  const last = [...log].reverse().find(p => p.userId === myUserId || p.charName === charName)

  return (
    <>
      <button className={s.fab} onClick={() => setOpen(o => !o)} title="Кидок кубиків" aria-label="Кубики">
        <DiceIcon />
      </button>

      {open && (
        <div className={s.panel}>
          <div className={s.head}>
            <span className={s.title}>Кидок кубиків</span>
            <button className={s.close} onClick={() => setOpen(false)}>✕</button>
          </div>

          <div className={s.body}>
            {/* Сцена: анімація / останній результат */}
            <div className={s.stage}>
              {anim ? (
                <div className={`${s.bigDie} ${s.bigDieSpin}`}>{anim.face}</div>
              ) : last ? (
                <div className={s.stageResult}>
                  <div className={s.bigDie}>{last.total}</div>
                  <div className={s.stageSub}>
                    {last.mode ? `d20 ${modeTag(last.mode)}` : `${last.count}d${last.sides}`}{fmtMod(last.modifier)} · {fmtRolls(last)}
                    {isCrit(last)   && <span className={s.badgeCrit}>Кріт!</span>}
                    {isFumble(last) && <span className={s.badgeFumble}>Провал</span>}
                  </div>
                </div>
              ) : (
                <div className={s.stageEmpty}>Обери кубик</div>
              )}
            </div>

            {/* ГМ: вибір пачки і прихований кидок */}
            {gm && (
              <div className={s.gmRow}>
                <select className={s.gmSelect} value={partyId} onChange={e => setPartyId(e.target.value)}
                  title="У яку пачку летить кидок">
                  <option value="">— пачка —</option>
                  {parties.map(p => <option key={p.id ?? p._id} value={p.id ?? p._id}>{p.name}</option>)}
                </select>
                <label className={s.gmHidden} title="Прихований кидок бачать лише майстри">
                  <input type="checkbox" checked={hidden} onChange={e => setHidden(e.target.checked)} />
                  Прихований
                </label>
              </div>
            )}

            {/* Модифікатор */}
            <div className={s.modBar}>
              <span className={s.modLabel}>Мод.</span>
              <button className={s.modBtn} onClick={() => bump(-1)}>−</button>
              <input className={s.modInput} type="number" value={modifier}
                onChange={e => setMod(e.target.value)} />
              <button className={s.modBtn} onClick={() => bump(1)}>+</button>
              <div className={s.modPreview}>{mod > 0 ? `+${mod}` : mod < 0 ? `${mod}` : '±0'}</div>
            </div>

            {/* Кількість */}
            <div className={s.modBar}>
              <span className={s.modLabel}>К-сть</span>
              <button className={s.modBtn} onClick={() => setCount(c => Math.max(1, (Number(c)||1) - 1))}>−</button>
              <input className={s.modInput} type="number" min={1} max={20} value={count}
                onChange={e => setCount(e.target.value)} />
              <button className={s.modBtn} onClick={() => setCount(c => Math.min(20, (Number(c)||1) + 1))}>+</button>
              <div className={s.modPreview}>{count}d</div>
            </div>

            {/* Перевага / недолік — діє на d20 (2 кістки, береться більша/менша) */}
            <div className={s.modeBar}>
              {[['norm','Звичайний'],['adv','Перевага'],['dis','Недолік']].map(([id,lbl]) => (
                <button key={id}
                  className={`${s.modeBtn} ${mode === id ? s.modeOn : ''}`}
                  title={id==='norm' ? 'Один кидок' : id==='adv' ? 'd20: 2 кістки, береться більша' : 'd20: 2 кістки, береться менша'}
                  onClick={() => setMode(id)}>{lbl}</button>
              ))}
            </div>

            {/* Кубики */}
            <div className={s.diceRow}>
              {DICE.map(d => (
                <button key={d} className={`${s.die} ${d === 20 ? s.die20 : ''}`}
                  disabled={rolling || gmDisabled}
                  title={gmDisabled ? 'Вибери пачку або постав «Прихований»' : `Кинути д${d}`}
                  onClick={() => roll(d)}>д{d}</button>
              ))}
            </div>

            {/* Журнал */}
            <div className={s.logHead}>
              <span>Журнал кидків</span>
              {log.length > 0 && (
                <button className={s.clearBtn} onClick={() => {
                  setLog([]); seenIds.current = new Set()
                  try { localStorage.removeItem(LOG_KEY) } catch {}
                }}>Очистити</button>
              )}
            </div>
            <div className={s.log} ref={logRef}>
              {visible.length === 0
                ? <div className={s.logEmpty}>Ще немає кидків</div>
                : visible.map((p, i) => (
                    <div key={p.id || i} className={`${s.logRow} ${p.charName === charName ? s.logMine : ''}`}>
                      <span className={`${s.logName} ${p.gm ? s.logGm : ''}`}>{p.charName}</span>
                      <span className={s.logDice}>
                        {p.mode ? `d20 ${modeTag(p.mode)}` : `${p.count}d${p.sides}`}{fmtMod(p.modifier)}
                        {p.hidden && <em className={s.hiddenTag} title="Бачать лише майстри"> прихов.</em>}
                      </span>
                      <span className={s.logRolls}>{fmtRolls(p)}</span>
                      <span className={`${s.logTotal} ${isCrit(p) ? s.totalCrit : ''} ${isFumble(p) ? s.totalFumble : ''}`}>{p.total}</span>
                    </div>
                  ))}
            </div>

            {/* Активні вміння / ефекти */}
            {!gm && (activeSkills.length > 0 || activeEffects.length > 0) && (
              <div className={s.refs}>
                {activeSkills.length > 0 && (
                  <div className={s.refBlock}>
                    <div className={s.refTitle}>Активні вміння</div>
                    <div className={s.chips}>
                      {activeSkills.map((sk, i) => (
                        <span key={i} className={s.chip}>{sk.name} <b>{sk.lvl}</b></span>
                      ))}
                    </div>
                  </div>
                )}
                {activeEffects.length > 0 && (
                  <div className={s.refBlock}>
                    <div className={s.refTitle}>Активні ефекти</div>
                    <div className={s.chips}>
                      {activeEffects.map((ef, i) => (
                        <span key={i} className={`${s.chip} ${s.chipEffect}`}>{ef.name}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function DiceIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l8.5 5v10L12 22 3.5 17V7L12 2z" />
      <path d="M12 2v6l8.5 -1M12 8L3.5 6M12 8v14M12 8l6 9M12 8l-6 9M3.5 17l8.5-3 8.5 3" />
    </svg>
  )
}
