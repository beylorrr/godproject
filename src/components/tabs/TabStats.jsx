import { useSheetData } from '../../context/SheetDataContext'
import { calcMod } from '../../utils/formulas'
import { STATS, RESOURCES } from '../../data/gameData'
import SectionTitle from '../ui/SectionTitle'
import s from './TabStats.module.css'

const AUTO_MAX   = { hp:'con', mp:'wis', mt:'will', ed:'end' }
const RES_COLORS = { hp:'var(--hp-color)', mp:'var(--mp-color)', pr:'var(--pr-color)', mr:'var(--mr-color)', mt:'var(--mt-color)', ed:'var(--ed-color)' }
const RES_ABBR   = { hp:'HP', mp:'MP', pr:'PR', mr:'MR', mt:'MT', ed:'ED' }

export default function TabStats() {
  const { data:d, setField:sf, adjustStat:adjStat, commitBuild, gmMode, gmSetStat } = useSheetData()
  const statPts = parseInt(d.stat_pts)||0
  const upd = (k,v) => sf(k,v)

  // Чи є незбережений розподіл (поточні стати > floor десь)
  const floor = d._statFloor || {}
  const hasUnsaved = ['str','con','end','int','wis','will'].some(id =>
    (parseInt(d[`stat-${id}`])||0) !== (floor[id] ?? (parseInt(d[`stat-${id}`])||0)))

  return (
    <div>
      {/* Очки — у GM редагуються напряму */}
      <div className={s.ptsBar}>
        <span className={s.ptsLabel}>Очки характеристик</span>
        {gmMode
          ? <input type="number" className="gm-num-edit" value={d.stat_pts||'0'}
              onChange={e=>upd('stat_pts', e.target.value)} />
          : <span className={s.ptsVal} style={{color:statPts>0?'var(--gold2)':'var(--muted)'}}>{statPts}</span>}
        {!gmMode && <button className="commit-btn" disabled={!hasUnsaved} onClick={()=>commitBuild()}>
          {hasUnsaved ? 'Зберегти розподіл' : 'Збережено'}
        </button>}
      </div>
      {!gmMode && hasUnsaved && <div className="commit-hint">Після збереження повернути очки вже не вийде</div>}

      <SectionTitle>Характеристики</SectionTitle>
      <div className={s.statsGrid}>
        {STATS.map(st=>{
          const val=parseInt(d[`stat-${st.id}`])||0
          const mod=calcMod(val)
          return (
            <div key={st.id} className="stat-box">
              <span className="stat-box-label">{st.label}<br/><small style={{opacity:.6,fontSize:'.6rem'}}>{st.sub}</small></span>
              {gmMode
                ? <div style={{margin:'6px 0'}}>
                    <input type="number" className="gm-num-edit gm-num-big" value={d[`stat-${st.id}`]||'0'}
                      onChange={e=>gmSetStat(st.id, e.target.value)} />
                  </div>
                : <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,margin:'6px 0'}}>
                    <button className="pip-btn" onClick={()=>adjStat({statId:st.id,delta:-1})}>−</button>
                    <span className="stat-box-val">{val}</span>
                    <button className="pip-btn" disabled={statPts<=0} onClick={()=>adjStat({statId:st.id,delta:1})}>+</button>
                  </div>}
              <div className="stat-box-mod">МОД: {mod>=0?'+':''}{mod}</div>
            </div>
          )
        })}
      </div>

      <SectionTitle>Ресурси</SectionTitle>
      <div className={s.resList}>
        {RESOURCES.map(r=>{
          const isAuto = r.id in AUTO_MAX
          const cur = parseFloat(d[`res-cur-${r.id}`])||0
          const max = parseFloat(d[`res-max-${r.id}`])||1
          const pct = Math.min(100,(cur/max)*100)
          return (
            <div key={r.id} className={s.resRow}>
              <span className={s.resIcon}>{r.icon}</span>
              <span className={s.resLabel}>{r.label}{isAuto&&<small> (авто)</small>}</span>
              <div className={s.resBar}>
                <div className={s.resBarFill} style={{width:`${pct}%`,background:RES_COLORS[r.id]}}/>
              </div>
              <div className={s.resInputs}>
                <input type="text" className={s.resInput}
                  value={d[`res-cur-${r.id}`]||'0'}
                  onChange={e=>upd(`res-cur-${r.id}`,e.target.value)}/>
                <span className={s.resSep}>/</span>
                <input type="text" className={s.resInput}
                  style={{color:isAuto?'var(--muted)':'var(--ivory)'}}
                  value={d[`res-max-${r.id}`]||'0'} readOnly={isAuto}
                  onChange={e=>!isAuto&&upd(`res-max-${r.id}`,e.target.value)}/>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
