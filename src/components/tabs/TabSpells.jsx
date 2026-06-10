import { useState, useEffect } from 'react'
import { useSheetData } from '../../context/SheetDataContext'
import SectionTitle from '../ui/SectionTitle'
import { SPELL_SCHOOLS, ABILITY_SCHOOLS } from '../../data/gameData'

// Школи заклять з листа Грюмбля + класи здібностей (для виданих майстром)
const SCHOOLS = [...SPELL_SCHOOLS, ...ABILITY_SCHOOLS, 'Здібність']

export default function TabSpells() {
  const { data, addSpell, updateSpell, removeSpell } = useSheetData()
  const [confirmDel, setConfirmDel] = useState(null)   // _id/індекс закляття під підтвердженням
  useEffect(() => {
    if (confirmDel == null) return
    const t = setTimeout(() => setConfirmDel(null), 2500)
    return () => clearTimeout(t)
  }, [confirmDel])
  const askRemove = (i) => { if (confirmDel === i) { setConfirmDel(null); removeSpell(i) } else setConfirmDel(i) }
  const spells = data._spells || []
  const upd = (i,f,v) => updateSpell({i,f,v})

  return (
    <div>
      <SectionTitle>Закляття та здатності</SectionTitle>
      <div id="spells-list">
        {spells.map((sp,i) => (
          <div key={i} className="spell-card">
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <input className="inv-input" placeholder="Назва закляття / здатності…"
                style={{textAlign:'left',flex:1,fontWeight:600}}
                value={sp.name||''} onChange={e=>upd(i,'name',e.target.value)}/>
              <select className="inv-input" style={{width:130}}
                value={sp.school||'Сила вогню'} onChange={e=>upd(i,'school',e.target.value)}>
                {SCHOOLS.map(s=><option key={s}>{s}</option>)}
              </select>
              <button className="inv-delete" onClick={()=>askRemove(i)}
                title={confirmDel===i ? 'Натисни ще раз, щоб видалити' : 'Видалити закляття'}
                style={{fontFamily:"'Cinzel',serif",background:'transparent',border:'none',
                  color:confirmDel===i?'var(--ember2)':'var(--muted)',fontSize:confirmDel===i?'.66rem':'.8rem',
                  fontWeight:confirmDel===i?700:400,cursor:'pointer',whiteSpace:'nowrap'}}>
                {confirmDel===i ? 'Точно?' : '✕'}</button>
            </div>
            <div className="spell-card-grid">
              {[
                {f:'od',label:'OD (час дії)',ph:'1 хвилина…',t:'text'},
                {f:'om',label:'OM (вартість мани)',ph:'',t:'number'},
                {f:'vs',label:'ВС (витривалість)',ph:'',t:'number'},
                {f:'cd',label:'CD (кулдаун)',ph:'1 раунд…',t:'text'},
              ].map(({f,label,ph,t})=>(
                <div key={f} className="field">
                  <label>{label}</label>
                  <input type={t} placeholder={ph} value={sp[f]||''} onChange={e=>upd(i,f,e.target.value)}/>
                </div>
              ))}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:8}}>
              <div className="field">
                <label>Радіус касту</label>
                <input placeholder="5 метрів…" value={sp.range||''} onChange={e=>upd(i,'range',e.target.value)}/>
              </div>
              <div className="field">
                <label>Урон / Ефект</label>
                <input placeholder="2d6+МОД…" value={sp.damage||''} onChange={e=>upd(i,'damage',e.target.value)}/>
              </div>
            </div>
            <div className="field" style={{marginTop:8}}>
              <label>Опис</label>
              <textarea style={{minHeight:50}} placeholder="Детальний опис…"
                value={sp.desc||''} onChange={e=>upd(i,'desc',e.target.value)}/>
            </div>
          </div>
        ))}
      </div>
      <button onClick={()=>addSpell()}
        style={{fontFamily:"'Cinzel',serif",fontSize:'.65rem',letterSpacing:'.1em',textTransform:'uppercase',
          background:'transparent',border:'none',color:'var(--muted)',cursor:'pointer',padding:'8px 0',
          transition:'color .12s'}}>
        + Додати закляття / здатність
      </button>
    </div>
  )
}
