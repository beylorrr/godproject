import { useSheetData } from '../../context/SheetDataContext'
import { SOCIAL_SKILLS, NEUTRAL_SKILLS, COMBAT_SKILLS, MAGIC_SKILLS, SCIENCE_SKILLS, CRIME_SKILLS,
         SKILL_COST_TABLE, SKILL_DESCRIPTIONS } from '../../data/gameData'
import SectionTitle from '../ui/SectionTitle'
import s from './TabSkills.module.css'
import { Users, Swords, Compass, FlaskConical, Sparkles, Skull, KeyRound, Lock } from 'lucide-react'

const CATEGORIES = [
  { id:'social-skills-table',  label:'Соціальні',     gate:'Говорливість',   Icon: Users        },
  { id:'combat-skills-table',  label:'Бойові',        gate:'Бойові навички', Icon: Swords       },
  { id:'neutral-skills-table', label:'Нейтральні',    gate:'Інстинкти',      Icon: Compass      },
  { id:'science-skills-table', label:'Наука',         gate:'Розуміння',      Icon: FlaskConical },
  { id:'magic-skills-table',   label:'Магія',         gate:'Магічність',     Icon: Sparkles     },
  { id:'crime-skills-table',   label:'Поза законом',  gate:'Злочинність',    Icon: Skull        },
]

const SKILLS_MAP = {
  'social-skills-table':  () => SOCIAL_SKILLS,
  'combat-skills-table':  () => COMBAT_SKILLS,
  'neutral-skills-table': () => NEUTRAL_SKILLS,
  'science-skills-table': () => SCIENCE_SKILLS,
  'magic-skills-table':   () => MAGIC_SKILLS,
  'crime-skills-table':   () => CRIME_SKILLS,
}

export default function TabSkills() {
  const { data:d, adjustSkill:adjSkill, commitBuild, gmMode, setField, gmSetSkill } = useSheetData()
  const skillPts = parseInt(d.skill_pts)||0
  const levels   = d._skillLevels||{}

  const getLvl      = (tId,name) => levels[`${tId}::${name}`]||0
  const isGateLocked= (tId,name) => {
    const cat = CATEGORIES.find(c=>c.id===tId)
    if (!cat||name===cat.gate) return false
    return getLvl(tId,cat.gate)===0
  }

  const adj = (tId,name,delta,maxLvl,cost) =>
    adjSkill({tableId:tId,skillName:name,delta,maxLvl,cost,SKILL_COST_TABLE})

  // GM: пряме встановлення рівня навички (без витрат очок).
  // Рівень одразу стає floor — гравцю не висітиме "Зберегти розподіл".
  const gmSetLvl = (tId, name, raw) => gmSetSkill(`${tId}::${name}`, raw)

  // Незбережений розподіл: якийсь рівень вищий за floor
  const skillFloor = d._skillFloor || {}
  // незбережено, якщо рівень відрізняється від floor (нова навичка → floor 0)
  const hasUnsaved = Object.entries(levels).some(([key,lvl]) => lvl !== (skillFloor[key] ?? 0))

  return (
    <div>
      {/* Очки вмінь */}
      <div className={s.ptsBar}>
        <span className={s.ptsLabel}>Очки вмінь</span>
        {gmMode
          ? <input type="number" className="gm-num-edit" value={d.skill_pts||'0'}
              onChange={e=>setField('skill_pts', e.target.value)} />
          : <span className={s.ptsVal} style={{color:skillPts>0?'var(--gold2)':'var(--muted)'}}>
              {skillPts}
            </span>}
        {!gmMode && <button className="commit-btn" disabled={!hasUnsaved} onClick={()=>commitBuild()}>
          {hasUnsaved ? 'Зберегти розподіл' : 'Збережено'}
        </button>}
      </div>
      {!gmMode && hasUnsaved && <div className="commit-hint">Після збереження повернути очки вже не вийде</div>}

      {/* Сітка категорій — 2 колонки */}
      <div className={s.grid}>
        {CATEGORIES.map(cat => {
          const skills = SKILLS_MAP[cat.id]?.() || []
          return (
            <div key={cat.id} className="skill-category-card">
              <div className="skill-cat-title">
                <cat.Icon size={16} strokeWidth={1.7} className="skill-cat-icon" aria-hidden />
                {cat.label}
              </div>
              {skills.map(sk => {
                const cur     = getLvl(cat.id, sk.name)
                const locked  = isGateLocked(cat.id, sk.name)
                const isGate  = sk.name===cat.gate
                const costRow = SKILL_COST_TABLE[sk.cost]
                const nextCost= cur<sk.max&&costRow ? costRow[cur] : null
                const prevCost= cur>0&&costRow ? costRow[cur-1] : null
                const desc    = sk.desc || SKILL_DESCRIPTIONS?.[sk.name]||''
                return (
                  <div key={sk.name}
                    className={`skill-row${cur>0?' has-level':''}`}
                    title={desc}
                  >
                    <span
                      className={`skill-row-name${isGate?' skill-gate-key':''}`}
                      data-skill={sk.name}
                    >
                      {isGate && <KeyRound size={12} strokeWidth={2} className="skill-gate-ico" aria-hidden />}{sk.name}
                    </span>
                    <div className="skill-row-right">
                      {cur>=sk.max && <span className="skill-max-badge">МАКС</span>}
                      {cur>0&&cur<sk.max && <span className="skill-lvl-badge">{cur}<span style={{fontSize:'.55rem',opacity:.7,marginLeft:2}}>рів</span></span>}
                      {cur===0&&!locked && <span className="skill-0-badge">—</span>}
                      {locked && <span className="skill-lock-badge"><Lock size={11} strokeWidth={2} aria-hidden /></span>}
                    </div>
                    <div className="skill-row-btns">
                      {!gmMode && !locked && cur < sk.max && nextCost ? (
                        <span className="skill-next-cost" title={`Вартість наступного рівня: ${nextCost} оч`}>{nextCost}</span>
                      ) : null}
                      {gmMode
                        ? <input type="number" className="gm-num-edit" style={{width:54}}
                            value={cur||'0'} onChange={e=>gmSetLvl(cat.id, sk.name, e.target.value)} />
                        : <>
                      <button className="pip-btn pip-btn-minus"
                        disabled={cur<=0}
                        title={prevCost?`Повернути ${prevCost} оч`:''}
                        onClick={()=>adj(cat.id,sk.name,-1,sk.max,sk.cost)}>−</button>
                      <button className="pip-btn pip-btn-plus"
                        disabled={cur>=sk.max||locked}
                        onClick={()=>adj(cat.id,sk.name,1,sk.max,sk.cost)}>
                        +
                        <span className="skill-cost-tooltip">
                          {locked?'закрито':cur>=sk.max?'МАКС':nextCost?`${nextCost} оч`:''}
                        </span>
                      </button>
                        </>}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
