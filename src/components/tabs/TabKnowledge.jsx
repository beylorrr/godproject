/**
 * TabKnowledge — вкладка "Знання": Рецепти та Технології.
 * Перенесено з інвентаря; опис — багаторядковий, тож довгі тексти видно повністю.
 */
import { useState, useEffect } from 'react'
import { useSheetData } from '../../context/SheetDataContext'
import SectionTitle from '../ui/SectionTitle'
import { FlaskConical, Cog, Plus, X } from 'lucide-react'

export default function TabKnowledge() {
  const ctx = useSheetData()
  const { data: d } = ctx
  return (
    <div>
      <KnowledgeBlock
        title="Рецепти" Icon={FlaskConical}
        rows={d._recipes || []}
        onAdd={() => ctx.addRecipe()}
        onUpdate={(i, f, v) => ctx.updateRecipe({ i, f, v })}
        onRemove={(i) => ctx.removeRecipe(i)}
        addLabel="+ Додати рецепт"
        namePh="Назва рецепта…" srcPh="Джерело (де навчився)…" descPh="Складники, кроки приготування…"
      />
      <KnowledgeBlock
        title="Технології" Icon={Cog}
        rows={d._technologies || []}
        onAdd={() => ctx.addTech()}
        onUpdate={(i, f, v) => ctx.updateTech({ i, f, v })}
        onRemove={(i) => ctx.removeTech(i)}
        addLabel="+ Додати технологію"
        namePh="Назва технології…" srcPh="Джерело…" descPh="Що дає, як застосовується…"
      />
    </div>
  )
}

function KnowledgeBlock({ title, Icon, rows, onAdd, onUpdate, onRemove, addLabel, namePh, srcPh, descPh }) {
  const [confirmDel, setConfirmDel] = useState(null)
  useEffect(() => {
    if (confirmDel == null) return
    const t = setTimeout(() => setConfirmDel(null), 2500)
    return () => clearTimeout(t)
  }, [confirmDel])
  const askRemove = (i) => { if (confirmDel === i) { setConfirmDel(null); onRemove(i) } else setConfirmDel(i) }

  return (
    <div style={{ marginBottom: 22 }}>
      <SectionTitle><Icon size={15} strokeWidth={1.8} style={{ verticalAlign: '-2px', marginRight: 7, color: 'var(--gold3)' }} aria-hidden />{title}</SectionTitle>
      {rows.map((rec, i) => (
        <div key={rec._id || i} className="knowledge-card">
          <div className="knowledge-row">
            <input className="inv-input" style={{ textAlign: 'left', flex: 2 }} placeholder={namePh}
              value={rec.name || ''} onChange={e => onUpdate(i, 'name', e.target.value)} />
            <input className="inv-input" style={{ textAlign: 'left', flex: 1 }} placeholder={srcPh}
              value={rec.source || ''} onChange={e => onUpdate(i, 'source', e.target.value)} />
            <button className={`inv-delete ${confirmDel === i ? 'item-del-confirm' : ''}`}
              title={confirmDel === i ? 'Натисни ще раз, щоб видалити' : 'Видалити'}
              onClick={() => askRemove(i)}>{confirmDel === i ? 'Точно?' : <X size={13} aria-hidden />}</button>
          </div>
          {/* Опис — textarea, авто-висота: довгий текст видно повністю */}
          <textarea className="knowledge-desc" rows={Math.max(2, Math.ceil((rec.desc || '').length / 70))}
            placeholder={descPh}
            value={rec.desc || ''} onChange={e => onUpdate(i, 'desc', e.target.value)} />
        </div>
      ))}
      <button className="add-row-btn" onClick={onAdd}><Plus size={12} aria-hidden style={{ verticalAlign: '-2px' }} /> {addLabel.replace('+ ', '')}</button>
    </div>
  )
}
