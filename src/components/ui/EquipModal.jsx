/**
 * EquipModal — модальне вікно вибору предмета для екіпірування.
 *
 * Показує предмети з основного інвентарю (_inv_inv-main) відповідного типу
 * (armor для слотів броні, weapon для рук). Клік по предмету → onPick(item).
 */
import { Shield, Swords, Package } from 'lucide-react'

export default function EquipModal({ open, title, items, onPick, onClose }) {
  if (!open) return null

  return (
    <div className="equip-overlay" onClick={onClose}>
      <div className="equip-modal" onClick={e => e.stopPropagation()}>
        <div className="equip-modal-head">
          <span className="equip-modal-title">{title}</span>
          <button className="equip-modal-close" onClick={onClose}>✕</button>
        </div>

        {items.length === 0 ? (
          <div className="equip-modal-empty">
            В інвентарі немає предметів цього типу.
            <br /><small>Створи предмет з відповідним типом у вкладці «Інвентар».</small>
          </div>
        ) : (
          <div className="equip-modal-list">
            {items.map(it => (
              <button key={it._id} className="equip-pick" onClick={() => onPick(it)}>
                <span className="equip-pick-icon" style={{display:'inline-flex',
                  color: it.type==='armor' ? '#6f93b5' : it.type==='weapon' ? '#c98445' : 'var(--gold3)'}}>
                  {it.type==='armor' ? <Shield size={15} strokeWidth={1.8} aria-hidden />
                   : it.type==='weapon' ? <Swords size={15} strokeWidth={1.8} aria-hidden />
                   : <Package size={15} strokeWidth={1.8} aria-hidden />}
                </span>
                <span className="equip-pick-name">{it.name || 'Без назви'}</span>
                <span className="equip-pick-stats">
                  {(parseFloat(it.physicalResistance) || 0) > 0 && <span>Оп. {it.physicalResistance}</span>}
                  {(parseFloat(it.magicalResistance) || 0) > 0 && <span>Маг.оп. {it.magicalResistance}</span>}
                  {(parseFloat(it.physicalDamage) || 0) > 0 && <span style={{ color: '#e0894a' }}>Шк. {it.physicalDamage}</span>}
                  {(parseFloat(it.magicalDamage) || 0) > 0 && <span style={{ color: '#a87fe8' }}>✦ {it.magicalDamage}</span>}
                  {(parseFloat(it.weight) || 0) > 0 && <span style={{ color: 'var(--muted)' }}>{it.weight} кг</span>}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
