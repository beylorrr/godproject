import { useState } from 'react'
import { useSheetData } from '../../context/SheetDataContext'
import { StatusPanelFromContext } from '../ui/StatusPanel'
import TransferPanel from '../ui/TransferPanel'
import { RESOURCES } from '../../data/gameData'
import { calcTotalWeight, calcMaxWeight } from '../../utils/formulas'
import Field from '../ui/Field'
import FormulaInput from '../ui/FormulaInput'
import SectionTitle from '../ui/SectionTitle'
import s from './TabGeneral.module.css'

const RES_COLORS = { hp:'var(--hp-color)', mp:'var(--mp-color)', pr:'var(--pr-color)', mr:'var(--mr-color)', mt:'var(--mt-color)', ed:'var(--ed-color)' }
const AUTO_MAX   = { hp:'con', mp:'wis', mt:'will', ed:'end' }
const RES_ABBR   = { hp:'HP', mp:'MP', pr:'PR', mr:'MR', mt:'MT', ed:'ED' }


export default function TabGeneral() {
  const { data:d, setField:sf, addEffect, updateEffect, removeEffect, addTrait, updateTrait, removeTrait, addQuirk, updateQuirk, removeQuirk, gmMode } = useSheetData()
  const upd = (k,v) => sf(k,v)
  const [showTransfer, setShowTransfer] = useState(false)

  const level = parseInt(d.level)||0
  const xp    = parseInt(d.xp_current)||0
  const need  = (level+1)*50
  const xpPct = Math.min(100,(xp/need)*100)

  const total  = calcTotalWeight(d)
  const maxW   = calcMaxWeight(d)
  const wPct   = Math.min(100,(total/(maxW||1))*100)
  const wColor = wPct>90?'#8b1a1a':wPct>70?'#c8962a':'linear-gradient(to right,#4a7c1f,#a0c04a)'

  const activeSkills = {}
  Object.entries(d._skillLevels||{}).forEach(([key,lvl])=>{
    const [tId,name] = key.split('::')
    if (!activeSkills[tId]) activeSkills[tId]=[]
    activeSkills[tId].push({name,lvl})
  })
  const CAT_LABELS = {
    'social-skills-table':'Соціальні','combat-skills-table':'Бойові',
    'neutral-skills-table':'Нейтральні','science-skills-table':'Наука',
    'magic-skills-table':'Магія','crime-skills-table':'Поза законом',
  }

  return (
    <div className={s.page}>

      {/* ── Панель статусу: FAME/KARMA/INFAME/STATUS/CRITS/LUCK ── */}
      <StatusPanelFromContext/>

      {/* ── Шапка ── */}
      <div className={s.header}>
        <div className={s.headerLeft}>
          <span className={s.charName}>{d.name_known||'—'}</span>
          <span className={s.charMeta}>{[d.race,d.age&&`${d.age} р.`].filter(Boolean).join(' · ')}</span>
        </div>
        <div className={s.headerRight}>
          <div className={s.levelBadge}>
            <span className={s.levelNum}>{level}</span>
            <span className={s.levelLbl}>рів</span>
          </div>
          <div className={s.xpMini}>
            <div className={s.xpTrackMini}><div className={s.xpFillMini} style={{width:`${xpPct}%`}}/></div>
            <span className={s.xpNums}>{xp} / {need} xp</span>
          </div>
        </div>
      </div>

      <div className={s.dashboard}>
        {/* ── ЛІВА КОЛОНКА ── */}
        <div className={s.col}>

          <SectionTitle>Ресурси</SectionTitle>
          <div className={s.resList}>
            {RESOURCES.map(r=>{
              const isAuto = r.id in AUTO_MAX
              const cur = parseFloat(d[`res-cur-${r.id}`])||0
              const max = parseFloat(d[`res-max-${r.id}`])||1
              const pct = Math.min(100,(cur/max)*100)
              return (
                <div key={r.id} className={s.resRow}>
                  <div className={s.resLeft}>
                    <span className={s.resIcon}>{r.icon}</span>
                    <span className={s.resAbbrv}>{RES_ABBR[r.id]}</span>
                    <div className={s.resBar}>
                      <div className={s.resBarFill} style={{width:`${pct}%`,background:RES_COLORS[r.id]}}/>
                    </div>
                  </div>
                  <div className={s.resValues}>
                    <FormulaInput className={s.resInput}
                      value={d[`res-cur-${r.id}`]||'0'}
                      onChange={v=>upd(`res-cur-${r.id}`,v)}/>
                    <span className={s.resSep}>/</span>
                    {isAuto
                      ? <input type="text" className={s.resInput} readOnly
                          style={{color:'var(--muted)',fontSize:'1rem'}}
                          value={d[`res-max-${r.id}`]||'0'}/>
                      : <FormulaInput className={s.resInput} style={{fontSize:'1rem'}}
                          value={d[`res-max-${r.id}`]||'0'} onChange={v=>upd(`res-max-${r.id}`,v)}/>}
                  </div>
                </div>
              )
            })}
          </div>

          <SectionTitle>Риси та недоліки</SectionTitle>
          <div className={s.traitsList}>
            {(d._traits_v2||[]).map((tr,i)=>(
              <div key={i} className={s.traitCard}>
                <div className={s.traitRow}>
                  <input type="text" className={s.traitInput}
                    placeholder="Назва риси…"
                    value={tr.name||''} onChange={e=>updateTrait({i,f:'name',v:e.target.value})}/>
                  <input type="number" className={s.traitCostInput}
                    placeholder="Варт."
                    value={tr.cost||''} onChange={e=>updateTrait({i,f:'cost',v:e.target.value})}/>
                  <button className={s.effectDel} onClick={()=>removeTrait(i)}>✕</button>
                </div>
                <input type="text" className={s.traitDescInput}
                  placeholder="Опис ефекту…"
                  value={tr.desc||''} onChange={e=>updateTrait({i,f:'desc',v:e.target.value})}/>
              </div>
            ))}
          </div>
          <button className={s.addBtn} onClick={()=>addTrait()}>+ Додати рису</button>

        </div>

        {/* ── ПРАВА КОЛОНКА ── */}
        <div className={s.col}>

          <SectionTitle>Активні ефекти</SectionTitle>
          <div className={s.effectsList}>
            {(d._effects||[]).map((eff,i)=>(
              <div key={i} className={s.effectRow}>
                <input type="text" className={s.effectInput} placeholder="Ефект…"
                  value={eff.name||''} onChange={e=>updateEffect({i,name:e.target.value})}/>
                <button className={s.effectDel} onClick={()=>removeEffect(i)}>✕</button>
              </div>
            ))}
          </div>
          <button className={s.addBtn} onClick={()=>addEffect()}>+ Додати ефект</button>


          <SectionTitle>Рівень та очки</SectionTitle>
          <div className={s.progressBlock}>
            <div className={s.xpRow}>
              <span className={s.xpLabel}>XP</span>
              <div className={s.xpTrack}><div className={s.xpFill} style={{width:`${xpPct}%`}}/></div>
              <div className={s.xpValGroup}>
                <input type="number" className={s.xpValEditable}
                  value={d.xp_current||'0'} onChange={e=>upd('xp_current',e.target.value)}/>
                <span className={s.xpSep}>/</span>
                <span className={s.xpNeed}>{need}</span>
              </div>
            </div>
            <div className={s.ptsRow}>
              <div className={s.ptChip}>
                <span className={s.ptLabel}>Вміння</span>
                <input type="number" className={s.ptInput}
                  readOnly={!gmMode}
                  style={!gmMode ? {opacity:.5,cursor:'not-allowed'} : {}}
                  title={!gmMode ? 'Змінює тільки Майстер' : ''}
                  value={d.skill_pts||'0'} onChange={e=>gmMode&&upd('skill_pts',e.target.value)}/>
              </div>
              <div className={s.ptChip}>
                <span className={s.ptLabel}>Характеристики</span>
                <input type="number" className={s.ptInput}
                  readOnly={!gmMode}
                  style={!gmMode ? {opacity:.5,cursor:'not-allowed'} : {}}
                  title={!gmMode ? 'Змінює тільки Майстер' : ''}
                  value={d.stat_pts||'0'} onChange={e=>gmMode&&upd('stat_pts',e.target.value)}/>
              </div>
            </div>
          </div>

          {Object.keys(activeSkills).length>0 && <>
            <SectionTitle>Активні вміння</SectionTitle>
            <div className={s.skillsBlock}>
              {Object.entries(activeSkills).map(([tId,skills])=>(
                <div key={tId} className={s.skillCatBlock}>
                  <div className={s.skillCatLbl}>{CAT_LABELS[tId]||tId}</div>
                  <div className={s.skillChips}>
                    {skills.map(({name,lvl})=>(
                      <span key={name} className={s.skillChip}>
                        {name}<span className={s.skillLvl}>{lvl}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>}

          <SectionTitle>Гроші</SectionTitle>
          <div className={s.moneyRow}>
            {[{k:'gold',l:'Золото',c:'#f5c84a'},{k:'silver',l:'Срібло',c:'#c8c8c8'},{k:'copper',l:'Мідь',c:'#c07830'}].map(m=>(
              <div key={m.k} className={s.moneyChip}>
                <span className={s.moneyLabel} style={{color:m.c}}>{m.l}</span>
                <FormulaInput className={s.moneyInput} style={{color:m.c}}
                  value={d[m.k]||'0'} onChange={v=>upd(m.k,v)}/>
              </div>
            ))}
          </div>
          {/* Кнопка передачі грошей іншому гравцю (тільки для гравців) */}
          {!gmMode && (
            <div style={{marginTop:8}}>
              <button
                onClick={() => setShowTransfer(v => !v)}
                style={{
                  fontFamily:"'Cinzel',serif", fontSize:'.66rem', fontWeight:700,
                  letterSpacing:'.08em', textTransform:'uppercase',
                  background: showTransfer ? 'rgba(245,200,74,.12)' : 'transparent',
                  border:'1px solid var(--br2)', borderRadius:6,
                  color: showTransfer ? 'var(--gold2)' : 'var(--muted)',
                  padding:'6px 14px', cursor:'pointer', transition:'all .15s',
                }}>
                Передати гроші гравцю
              </button>
              {showTransfer && (
                <TransferPanel mode="money" onClose={() => setShowTransfer(false)}/>
              )}
            </div>
          )}

          <SectionTitle>Вага</SectionTitle>
          <div className={s.weightBlock}>
            <div className={s.weightNums}>
              <span>{total.toFixed(1)} кг</span>
              <span className={s.weightSep}>/</span>
              <span className={s.weightMax} style={{minWidth:'auto'}}>{maxW}</span>
              <span style={{fontSize:'.72rem',color:'var(--muted)'}}>кг макс {maxW>30?`(база 30 + Мул ${(maxW-30)/5} рів.)`:''}</span>
            </div>
            <div className={s.weightBar}><div className={s.weightFill} style={{width:`${wPct}%`,background:wColor}}/></div>
          </div>

        </div>
      </div>

      {/* Особистість — accordion */}
      <details className={s.personalDetails}>
        <summary className={s.personalSummary}>Особистість та передісторія</summary>
        <div className={s.personalContent}>
          <div className="grid-2">
            <Field label="Відоме ім'я" value={d.name_known} onChange={v=>upd('name_known',v)}/>
            <Field label="Повне ім'я"  value={d.name_full}  onChange={v=>upd('name_full',v)}/>
            <Field label="Раса"         value={d.race}       onChange={v=>upd('race',v)}/>
            <Field label="Вік"          value={d.age}        onChange={v=>upd('age',v)} type="number"/>
          </div>
          <Field label="Зовнішність"  value={d.appearance} onChange={v=>upd('appearance',v)}  multiline/>
          <Field label="Мотивація"    value={d.motivation} onChange={v=>upd('motivation',v)}   multiline/>
          <Field label="Передісторія" value={d.backstory}  onChange={v=>upd('backstory',v)}    multiline/>

          {/* Квірки та нотатки тут */}
          <QuirksBlock d={d}/>
          <NotesBlock d={d} upd={upd}/>
        </div>
      </details>
    </div>
  )
}

function QuirksBlock({ d }) {
  const { addQuirk, updateQuirk, removeQuirk } = useSheetData()
  const quirks = d._quirks||[]
  if (quirks.length===0 && true) return (
    <>
      <SectionTitle>Квірки</SectionTitle>
      <button className={s.addBtn} onClick={()=>addQuirk()}>+ Додати квірк</button>
    </>
  )
  return (
    <>
      <SectionTitle>Квірки</SectionTitle>
      {quirks.map((q,i)=>(
        <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 70px 1fr 28px',gap:'6px 8px',marginBottom:6,alignItems:'center'}}>
          <input className="inv-input" placeholder="Квірк…" style={{textAlign:'left'}}
            value={q.name||''} onChange={e=>updateQuirk({i,f:'name',v:e.target.value})}/>
          <input type="number" className="inv-input" placeholder="Варт."
            value={q.cost||''} onChange={e=>updateQuirk({i,f:'cost',v:e.target.value})}/>
          <input className="inv-input" placeholder="Опис…" style={{textAlign:'left'}}
            value={q.desc||''} onChange={e=>updateQuirk({i,f:'desc',v:e.target.value})}/>
          <button className="inv-delete" onClick={()=>removeQuirk(i)}>✕</button>
        </div>
      ))}
      <button className={s.addBtn} onClick={()=>addQuirk()}>+ Додати квірк</button>
    </>
  )
}

function NotesBlock({ d, upd }) {
  return (
    <>
      <SectionTitle>Нотатки</SectionTitle>
      <textarea className="note-field" placeholder="Загальні нотатки…"
        style={{width:'100%',minHeight:100}}
        value={d._notes||''} onChange={e=>upd('_notes',e.target.value)}/>
    </>
  )
}
