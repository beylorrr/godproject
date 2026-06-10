/**
 * ItemCard — компактна картка предмета у форматі бази майстра (GMItems).
 *
 * Згорнутий: тип-іконка (акцент), назва, прапори, рядок показників, дії ✏/⇄/✕.
 * Редагування: тип, назва, прапори, числа, опис, ефекти + Зберегти/Скасувати.
 */
import { useState, useEffect } from 'react'
import NumInput from './NumInput'
import { ITEM_TYPES } from '../../utils/collections'
import { Shield, Swords, Package, Eye, EyeOff } from 'lucide-react'

const Flag = ({ on, title, color, children }) => on
  ? <span title={title} style={{ color }}>{children}</span>
  : null

const Stat = ({ show, color, children }) => show
  ? <span style={color ? { color } : undefined}>{children}</span>
  : null

export default function ItemCard({ item, readOnly = false, defaultEditing = false, onSave, onRemove, onTransfer, onMove }) {
  const [editing, setEditing] = useState(defaultEditing)
  const [form, setForm] = useState(item)

  const startEdit = () => { setForm(item); setEditing(true) }
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = () => {
    const { _id, ...patch } = form
    patch.weight = Math.round(((parseFloat(patch.amount) || 0) * (parseFloat(patch.weightPerOne) || 0)) * 1000) / 1000
    onSave?.(patch)
    setEditing(false)
  }

  const effects = Array.isArray(form.effects) ? form.effects : []
  const addEffect    = () => set('effects', [...effects, { text: '', isHidden: false }])
  const updEffect    = (i, text) => set('effects', effects.map((e, idx) => idx === i ? { ...e, text } : e))
  const toggleHidden = (i) => set('effects', effects.map((e, idx) => idx === i ? { ...e, isHidden: !e.isHidden } : e))
  const delEffect    = (i) => set('effects', effects.filter((_, idx) => idx !== i))

  const [confirmDel, setConfirmDel] = useState(false)
  // авто-скасування підтвердження за 2.5с — від міскліків
  useEffect(() => {
    if (!confirmDel) return
    const t = setTimeout(() => setConfirmDel(false), 2500)
    return () => clearTimeout(t)
  }, [confirmDel])
  const askRemove = () => { if (confirmDel) { setConfirmDel(false); onRemove?.() } else setConfirmDel(true) }
  const num = (v) => parseFloat(v) || 0
  const fmtW = (v) => Math.round((parseFloat(v) || 0) * 1000) / 1000

  // ── Компактний табличний рядок ──
  if (!editing) {
    const visibleEffects = (Array.isArray(item.effects) ? item.effects : []).filter(e => e?.text && !e.isHidden)
    const TypeIco = item.type === 'armor' ? Shield : item.type === 'weapon' ? Swords : Package
    const typeTitle = item.type === 'armor' ? 'Броня' : item.type === 'weapon' ? 'Зброя' : 'Предмет'
    return (
      <div className={`item-row item-card--${item.type || 'other'}`}>
        <div className="item-row-main">
          <span className="item-row-type" title={typeTitle}><TypeIco size={14} strokeWidth={1.8} aria-hidden /></span>
          <span className="item-row-name">{item.name || <em style={{ opacity: .5 }}>Без назви</em>}</span>
          {num(item.amount) > 1 && <span className="item-row-amt">×{item.amount}</span>}
          <span className="item-row-stats">
            <Stat show={num(item.weight)}>{fmtW(item.weight)}кг</Stat>
            <Stat show={num(item.physicalDamage)} color="#e0894a">Фіз.шк.{item.physicalDamage}</Stat>
            <Stat show={num(item.magicalDamage)} color="#a87fe8">Маг.шк.{item.magicalDamage}</Stat>
            <Stat show={num(item.physicalResistance)} color="#8fb4d6">Фіз.оп.{item.physicalResistance}</Stat>
            <Stat show={num(item.magicalResistance)} color="#b48fd6">Маг.оп.{item.magicalResistance}</Stat>
            <Flag on={item.isMagic}   title="Магічний"  color="#a87fe8">М</Flag>
            <Flag on={item.isCursed}  title="Прокляте"  color="#d65a5a">П</Flag>
            <Flag on={item.isBlessed} title="Освячене"  color="#7fc77f">О</Flag>
          </span>
          <div className="item-row-actions">
            {onMove && <button className="item-card-btn" title="Перемістити в іншу вкладку" onClick={onMove}>⇲</button>}
            {onTransfer && <button className="item-card-btn" title="Передати гравцю" onClick={onTransfer}>⇄</button>}
            {!readOnly && <button className="item-card-btn" title="Редагувати" onClick={startEdit}>✏</button>}
            {!readOnly && (
              <button className={`item-card-btn item-card-btn-del ${confirmDel ? 'item-del-confirm' : ''}`}
                title={confirmDel ? 'Натисни ще раз, щоб видалити' : 'Видалити'}
                onClick={askRemove}>{confirmDel ? 'Точно?' : '✕'}</button>
            )}
          </div>
        </div>
        {(item.description || visibleEffects.length > 0) && (
          <div className="item-row-body">
            {item.description && <span className="item-row-desc">{item.description}</span>}
            {visibleEffects.map((e, i) => <span key={i} className="item-row-eff">◆ {e.text}</span>)}
          </div>
        )}
      </div>
    )
  }

  // ── Редагування ──
  return (
    <div className="item-card item-card-editing">
      <div className="item-edit-top">
        <select className="item-edit-type" value={form.type || 'other'} onChange={e => set('type', e.target.value)}>
          {ITEM_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <input className="inv-name-input" placeholder="Назва предмету…" autoFocus
          value={form.name || ''} onChange={e => set('name', e.target.value)} />
      </div>

      <div className="item-edit-grid">
        <label className="inv-field"><span>К-сть</span>     <NumInput value={form.amount}             onChange={v => set('amount', v)} /></label>
        <label className="inv-field"><span>Вага/шт</span>   <NumInput value={form.weightPerOne}       onChange={v => set('weightPerOne', v)} step={0.1} /></label>
        <label className="inv-field"><span>Фіз.шк.</span> <NumInput value={form.physicalDamage}     onChange={v => set('physicalDamage', v)} /></label>
        <label className="inv-field"><span>Маг.шк.</span> <NumInput value={form.magicalDamage}      onChange={v => set('magicalDamage', v)} /></label>
        <label className="inv-field"><span>Фіз.оп.</span> <NumInput value={form.physicalResistance} onChange={v => set('physicalResistance', v)} /></label>
        <label className="inv-field"><span>Маг.оп.</span> <NumInput value={form.magicalResistance}  onChange={v => set('magicalResistance', v)} /></label>
      </div>

      <textarea className="inv-input" rows={2} placeholder="Опис…"
        style={{ width: '100%', resize: 'vertical', textAlign: 'left', marginTop: 8 }}
        value={form.description || ''} onChange={e => set('description', e.target.value)} />

      <div className="item-edit-eff-head">
        <span>Ефекти</span>
        <button type="button" className="item-card-btn" onClick={addEffect}>+ Ефект</button>
      </div>
      {effects.map((e, i) => (
        <div key={i} className="item-edit-eff-row">
          <input className="inv-input" placeholder={`Ефект ${i + 1}…`} style={{ flex: 1, textAlign: 'left' }}
            value={e.text || ''} onChange={ev => updEffect(i, ev.target.value)} />
          <button type="button" title={e.isHidden ? 'Прихований від гравця' : 'Видимий гравцю'} onClick={() => toggleHidden(i)}
            style={{ background: 'none', border: 'none', cursor: 'pointer' }}>{e.isHidden ? <EyeOff size={13} aria-hidden /> : <Eye size={13} aria-hidden />}</button>
          <button type="button" title="Видалити ефект" onClick={() => delEffect(i)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ember2)' }}>✕</button>
        </div>
      ))}

      <div className="item-edit-props">
        <button type="button" className={`prop-toggle ${form.isMagic ? 'prop-toggle--magic' : ''}`}
          onClick={() => set('isMagic', !form.isMagic)}>Магічний</button>
        <button type="button" className={`prop-toggle ${form.isCursed ? 'prop-toggle--cursed' : ''}`}
          onClick={() => set('isCursed', !form.isCursed)}>Прокляте</button>
        <button type="button" className={`prop-toggle ${form.isBlessed ? 'prop-toggle--blessed' : ''}`}
          onClick={() => set('isBlessed', !form.isBlessed)}>Освячене</button>
      </div>

      <div className="item-edit-foot">
        <button className="item-card-btn" onClick={() => setEditing(false)}>Скасувати</button>
        <button className="item-save-btn" onClick={save}>Зберегти</button>
      </div>
    </div>
  )
}
