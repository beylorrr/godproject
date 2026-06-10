import { useEffect, useRef, useState } from 'react'
import { Eye, Crosshair, Clover } from 'lucide-react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import {
  fetchParties, fetchParty, createParty, deleteParty,
  batchAction, kickMember, fetchPlayers, assignPartyGm,
  setActivePartyId, clearResult, selGm,
} from '../../store/slices/gmSlice'
import SectionTitle from '../../components/ui/SectionTitle'
import s from './GM.module.css'

const RESOURCES = [
  { id:'hp', label:'HP', color:'var(--hp-color)' },
  { id:'mp', label:'MP', color:'var(--mp-color)' },
  { id:'mt', label:'MT', color:'var(--mt-color)' },
  { id:'ed', label:'ED', color:'var(--ed-color)' },
]

export default function GMParties() {
  const dispatch      = useDispatch()
  const navigate      = useNavigate()
  const parties       = useSelector(selGm.parties)
  const players       = useSelector(selGm.players)
  const activeParty   = useSelector(selGm.activeParty)
  const activePartyId = useSelector(selGm.activePartyId)
  const loading       = useSelector(selGm.loading)
  const actionLoading = useSelector(selGm.actionLoading)
  const lastResult    = useSelector(selGm.lastResult)
  const pollRef       = useRef(null)

  const [assignChar, setAssignChar] = useState({})   // userId → charId для призначення
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [creating, setCreating] = useState(false)

  const [selectedIds, setSelectedIds] = useState(() => new Set())

  const [actionType,     setActionType]     = useState('xp')
  const [actionAmount,   setActionAmount]   = useState('')
  const [actionRes,      setActionRes]      = useState('hp')
  const [actionNote,     setActionNote]     = useState('')
  const [actionSkillPts, setActionSkillPts] = useState('')
  const [actionStatPts,  setActionStatPts]  = useState('')
  const [actionCrits,    setActionCrits]    = useState('')
  const [actionLuck,     setActionLuck]     = useState('')
  const [actionGold,     setActionGold]     = useState('')
  const [actionSilver,   setActionSilver]   = useState('')
  const [actionCopper,   setActionCopper]   = useState('')

  useEffect(() => {
    dispatch(fetchParties()); dispatch(fetchPlayers())
    // автооновлення: нові персонажі/гравці підтягуються самі
    const t = setInterval(() => dispatch(fetchPlayers()), 12000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    clearInterval(pollRef.current)
    setSelectedIds(new Set())
    if (activePartyId) {
      dispatch(fetchParty(activePartyId))
      pollRef.current = setInterval(() => dispatch(fetchParty(activePartyId)), 4000)
    }
    return () => clearInterval(pollRef.current)
  }, [activePartyId])

  useEffect(() => {
    if (lastResult) {
      const t = setTimeout(() => dispatch(clearResult()), 5000)
      return () => clearTimeout(t)
    }
  }, [lastResult])

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    await dispatch(createParty({ name: newName.trim(), description: newDesc.trim() }))
    setNewName(''); setNewDesc(''); setCreating(false)
  }

  const members = activeParty?.members || []

  const toggleSelect = charId => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(charId) ? next.delete(charId) : next.add(charId)
      return next
    })
  }
  const selectAll = () => setSelectedIds(new Set(members.filter(m=>m.charId).map(m=>m.charId)))
  const clearSel  = () => setSelectedIds(new Set())

  const handleBatch = async () => {
    const charIds = [...selectedIds]
    if (charIds.length === 0) return
    const base = { charIds, type: actionType === 'money' ? 'pts' : actionType, note: actionNote }
    let payload
    if (actionType === 'pts') {
      payload = { ...base,
        skillPts: parseInt(actionSkillPts)||0, statPts: parseInt(actionStatPts)||0,
        crits: parseInt(actionCrits)||0, luck: parseInt(actionLuck)||0,
        gold: 0, silver: 0, copper: 0,
      }
    } else if (actionType === 'money') {
      payload = { ...base,
        skillPts: 0, statPts: 0, crits: 0, luck: 0,
        gold: parseInt(actionGold)||0, silver: parseInt(actionSilver)||0, copper: parseInt(actionCopper)||0,
      }
    } else if (actionType === 'xp') {
      payload = { ...base, amount: parseInt(actionAmount)||0 }
    } else {
      payload = { ...base, amount: parseInt(actionAmount)||0, resource: actionRes }
    }
    try {
      await dispatch(batchAction(payload)).unwrap()
      if (activePartyId) dispatch(fetchParty(activePartyId))
      setActionAmount(''); setActionNote(''); setActionSkillPts(''); setActionStatPts(''); setActionCrits(''); setActionLuck(''); setActionGold(''); setActionSilver(''); setActionCopper('')
    } catch (e) {
      alert(typeof e === 'string' ? e : (e?.message || 'Дія не виконалась'))
    }
  }

  const handleKick = async (m) => {
    if (!window.confirm(`Видалити ${m.username} з пачки «${activeParty.name}»?`)) return
    await dispatch(kickMember({ partyId: activePartyId, userId: m.userId }))
  }

  const selCount = selectedIds.size

  return (
    <div>
      <h2 className={s.pageTitle}>Пачки</h2>

      {/* ── Призначення персонажів до пачок ── */}
      <div className={s.card}>
        <SectionTitle>Призначення персонажів</SectionTitle>
        {players.length === 0
          ? <div style={{fontFamily:"'EB Garamond',serif",fontStyle:'italic',color:'var(--muted)'}}>Гравців поки немає.</div>
          : players.map(p => {
            const selChar = assignChar[p.userId] ?? (p.memberCharId || p.chars[0]?.id || '')
            return (
              <div key={p.userId} className="item-row" style={{marginBottom:5}}>
                <div className="item-row-main">
                  <span style={{fontFamily:"'Cinzel',serif",fontSize:'.74rem',fontWeight:700,color:'var(--iv2)',flexShrink:0}}>
                    {p.username}
                  </span>
                  {/* персонаж: усі персонажі гравця, не лише обраний ним */}
                  <select className={s.input} style={{maxWidth:160,padding:'5px 8px',flexShrink:1,minWidth:0}}
                    value={selChar}
                    title="Який персонаж гравця йде у пачку"
                    onChange={e => setAssignChar(m => ({...m, [p.userId]: Number(e.target.value) || ''}))}>
                    {p.chars.length === 0 && <option value="">без персонажа</option>}
                    {p.chars.map(ch => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
                  </select>
                  <select className={s.input} style={{marginLeft:'auto',maxWidth:180,padding:'5px 8px',flexShrink:0}}
                    value={p.partyId || ''}
                    title="Пачка гравця — зміна застосовується одразу"
                    onChange={async e => {
                      const pid = e.target.value ? Number(e.target.value) : null
                      await dispatch(assignPartyGm({ userId: p.userId, charId: Number(selChar) || null, partyId: pid }))
                      dispatch(fetchPlayers()); dispatch(fetchParties())
                    }}>
                    <option value="">— без пачки —</option>
                    {parties.map(pt => <option key={pt.id ?? pt._id} value={pt.id ?? pt._id}>{pt.name}</option>)}
                  </select>
                </div>
              </div>
            )
          })}
      </div>

      <div className={s.card}>
        <SectionTitle>Нова пачка</SectionTitle>
        <div className={s.createRow}>
          <input className={s.input} placeholder="Назва пачки / квесту…"
            value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key==='Enter' && handleCreate()}/>
          <input className={s.input} placeholder="Опис (необов'язково)…"
            value={newDesc} onChange={e => setNewDesc(e.target.value)}/>
          <button className={s.primaryBtn} onClick={handleCreate} disabled={creating||!newName.trim()}>
            {creating?'…':'+ Створити'}
          </button>
        </div>
      </div>

      {loading && !activePartyId && <div className={s.hint}>Завантаження…</div>}
      <div className={s.partyList}>
        {parties.map(p => (
          <div key={p.id}
            className={`${s.partyCard} ${activePartyId===p.id?s.partyActive:''}`}
            onClick={() => dispatch(setActivePartyId(activePartyId===p.id ? null : p.id))}>
            <div className={s.partyCardLeft}>
              <div className={s.partyName}>{p.name}</div>
              <div className={s.partyMeta}>{p.member_count||0} гравців</div>
              {p.description && <div className={s.partyDesc}>{p.description}</div>}
            </div>
            <button className={s.delBtn}
              onClick={e=>{e.stopPropagation(); window.confirm(`Видалити пачку «${p.name}»?`)&&dispatch(deleteParty(p.id))}}>✕</button>
          </div>
        ))}
        {parties.length===0 && !loading && <div className={s.hint}>Пачок ще немає. Створи першу вище.</div>}
      </div>

      {activeParty && activePartyId && (
        <div className={s.card} style={{marginTop:14}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12,flexWrap:'wrap',gap:8}}>
            <SectionTitle>{activeParty.name}</SectionTitle>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              {members.length>0 && (
                <>
                  <button className={s.miniBtn} onClick={selectAll}>Вибрати всіх</button>
                  {selCount>0 && <button className={s.miniBtn} onClick={clearSel}>Зняти ({selCount})</button>}
                </>
              )}
              <span style={{fontFamily:"'Cinzel',serif",fontSize:'.55rem',color:'var(--muted)',letterSpacing:'.1em'}}>🔄 live</span>
            </div>
          </div>

          {lastResult && (
            <div className={s.resultBanner}>
              {lastResult.batch
                ? `✓ Застосовано до ${lastResult.count} гравц.`
                : lastResult.leveledUp
                  ? `🎉 Рівень підвищено до ${lastResult.newLevel}!`
                  : '✓ Застосовано'}
            </div>
          )}

          <div className={s.playerGrid}>
            {members.map(m => {
              const d   = m.sheetData||{}
              const hp  = parseFloat(d['res-cur-hp'])||0
              const hpM = parseFloat(d['res-max-hp'])||0
              const pct = Math.min(100,(hp/(hpM||1))*100)
              const hpColor = pct<25?'var(--ember2)':pct<50?'#c8962a':'var(--hp-color)'
              const isSel = selectedIds.has(m.charId)
              return (
                <div key={m.userId}
                  className={`${s.playerCard} ${isSel?s.playerSelected:''}`}>
                  {/* Верхній рядок: ім'я + рівень + кікнути */}
                  <div className={s.playerTop}>
                    <span className={s.playerName}>{m.username}</span>
                    <span className={s.playerLvl}>Рів.{d.level||'1'}</span>
                    <button className={s.kickBtn} title="Видалити з пачки"
                      onClick={()=>handleKick(m)}>✕</button>
                  </div>
                  {/* Ім'я ПЕРСОНАЖА — велике й помітне */}
                  <div className={s.playerCharName}>{d.name_known||m.slotName||'—'}</div>

                  {/* HP бар */}
                  <div className={s.resBarRow}>
                    <span className={s.resBarLbl} style={{color:'var(--hp-color)'}}>HP</span>
                    <div className={s.resBarWrap}>
                      <div className={s.resBarFill} style={{width:`${pct}%`,background:hpColor}}/>
                    </div>
                    <span className={s.resBarNums}>{hp}/{hpM}</span>
                  </div>

                  {/* MP, MT, ED бари */}
                  {[
                    {id:'mp', color:'var(--mp-color)', label:'MP'},
                    {id:'mt', color:'var(--mt-color)', label:'MT'},
                    {id:'ed', color:'var(--ed-color)', label:'ED'},
                  ].map(r => {
                    const cur = parseFloat(d[`res-cur-${r.id}`])||0
                    const max = parseFloat(d[`res-max-${r.id}`])||0
                    const p   = Math.min(100,(cur/(max||1))*100)
                    return (
                      <div key={r.id} className={s.resBarRow}>
                        <span className={s.resBarLbl} style={{color:r.color}}>{r.label}</span>
                        <div className={s.resBarWrap}>
                          <div className={s.resBarFill} style={{width:`${p}%`,background:r.color}}/>
                        </div>
                        <span className={s.resBarNums}>{cur}/{max}</span>
                      </div>
                    )
                  })}

                  {/* Кріти та вдача — великі іконки */}
                  <div className={s.critLuckRow}>
                    <span className={s.critLuckChip} style={{borderColor:'#e0903a', color:'#e0903a'}}>
                      <Crosshair size={16} strokeWidth={2} aria-hidden /><span className={s.critLuckVal}>{d.crits||0}</span>
                    </span>
                    <span className={s.critLuckChip} style={{borderColor:'#5fb36a', color:'#5fb36a'}}>
                      <Clover size={16} strokeWidth={2} aria-hidden /><span className={s.critLuckVal}>{d.luck||0}</span>
                    </span>
                  </div>

                  <div style={{display:'flex',gap:5,marginTop:7}}>
                    <button
                      className={`${s.selectBtn} ${isSel?s.selectBtnActive:''}`}
                      onClick={()=>toggleSelect(m.charId)}
                      disabled={!m.charId}>
                      {isSel?'✓ Обрано':'Обрати'}
                    </button>
                    <button className={s.viewSheetBtn}
                      onClick={()=>navigate(`/gm/sheet/${m.charId}`)}>
                      <Eye size={14} aria-hidden />
                    </button>
                  </div>
                </div>
              )
            })}
            {members.length===0 && <div className={s.hint}>Поки немає гравців у цій пачці.</div>}
          </div>

          {selCount>0 && (
            <div className={s.actionPanel}>
              <SectionTitle>Дія → {selCount} гравц. одночасно</SectionTitle>
              <div className={s.actionTabs}>
                {[{id:'xp',label:'XP'},{id:'damage',label:'Урон'},{id:'heal',label:'Ліку'},{id:'pts',label:'Очки'},{id:'money',label:'Гроші'}].map(t=>(
                  <button key={t.id}
                    className={`${s.actionTab} ${actionType===t.id?s.actionTabActive:''}`}
                    onClick={()=>setActionType(t.id)}>{t.label}</button>
                ))}
              </div>

              <div className={s.actionFields}>
                {actionType==='pts' ? (
                  <>
                    <div className="field" style={{minWidth:90}}>
                      <label>Вміння</label>
                      <input type="number" className={s.input} value={actionSkillPts} onChange={e=>setActionSkillPts(e.target.value)} placeholder="0" style={{width:90}}/>
                    </div>
                    <div className="field" style={{minWidth:90}}>
                      <label>Хар-ки</label>
                      <input type="number" className={s.input} value={actionStatPts} onChange={e=>setActionStatPts(e.target.value)} placeholder="0" style={{width:90}}/>
                    </div>
                    <div className="field" style={{minWidth:90}}>
                      <label><Crosshair size={11} aria-hidden /> Крити</label>
                      <input type="number" className={s.input} value={actionCrits} onChange={e=>setActionCrits(e.target.value)} placeholder="0" style={{width:90}}/>
                    </div>
                    <div className="field" style={{minWidth:90}}>
                      <label><Clover size={11} aria-hidden /> Удача</label>
                      <input type="number" className={s.input} value={actionLuck} onChange={e=>setActionLuck(e.target.value)} placeholder="0" style={{width:90}}/>
                    </div>
                  </>
                ) : actionType==='money' ? (
                  <>
                    <div className="field" style={{minWidth:95}}>
                      <label style={{color:'#f5c84a'}}>Золото</label>
                      <input type="number" className={s.input} value={actionGold} onChange={e=>setActionGold(e.target.value)} placeholder="0" style={{width:95}}/>
                    </div>
                    <div className="field" style={{minWidth:95}}>
                      <label style={{color:'#c8c8c8'}}>🥈 Срібло</label>
                      <input type="number" className={s.input} value={actionSilver} onChange={e=>setActionSilver(e.target.value)} placeholder="0" style={{width:95}}/>
                    </div>
                    <div className="field" style={{minWidth:95}}>
                      <label style={{color:'#c07830'}}>🥉 Мідь</label>
                      <input type="number" className={s.input} value={actionCopper} onChange={e=>setActionCopper(e.target.value)} placeholder="0" style={{width:95}}/>
                    </div>
                    <div style={{fontSize:'.72rem',color:'var(--muted)',alignSelf:'flex-end',paddingBottom:6}}>
                      Від'ємні — забрати
                    </div>
                  </>
                ) : (
                  <>
                    {(actionType==='damage'||actionType==='heal') && (
                      <div className="field" style={{width:90}}>
                        <label>Ресурс</label>
                        <select className={s.input} value={actionRes} onChange={e=>setActionRes(e.target.value)}>
                          {RESOURCES.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}
                        </select>
                      </div>
                    )}
                    <div className="field" style={{minWidth:80}}>
                      <label>{actionType==='xp'?'XP':'Кількість'}</label>
                      <input type="number" className={s.input} value={actionAmount}
                        onChange={e=>setActionAmount(e.target.value)}
                        onKeyDown={e=>e.key==='Enter'&&handleBatch()}
                        style={{width:90}}/>
                    </div>
                  </>
                )}
                <div className="field" style={{flex:1,minWidth:120}}>
                  <label>Примітка</label>
                  <input className={s.input} value={actionNote} onChange={e=>setActionNote(e.target.value)} placeholder="За що…"/>
                </div>
                <button className={s.actionBtn} onClick={handleBatch} disabled={actionLoading}>
                  {actionLoading?'…':`► Застосувати (${selCount})`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
