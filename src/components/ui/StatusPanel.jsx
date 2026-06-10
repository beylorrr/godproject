import { useSelector } from 'react-redux'
import { selSheet } from '../../store/slices/sheetSlice'
import { useSheetData } from '../../context/SheetDataContext'
import { calcDodge, calcEquippedWeight } from '../../utils/formulas'
import FormulaInput from './FormulaInput'
import s from './StatusPanel.module.css'

/**
 * Панель статусу: Fame/Karma/Infame/Status/Crits/Luck + ШУ (шанс ухилення).
 * ШУ — обчислюване значення (з ваги, дозволеної ваги і вміння Ухиляння).
 */
const FIELDS = [
  { k:'fame',       l:'FAME',   bg:'#274E13' },
  { k:'karma',      l:'KARMA',  bg:'#1f1f1f' },
  { k:'infame',     l:'INFAME', bg:'#5B0F00' },
  { k:'status_val', l:'STATUS', bg:'#222'    },
  { k:'crits',      l:'CRITS',  bg:'#4C1130' },
  { k:'luck',       l:'LUCK',   bg:'#20124D' },
]

function computeDodge(data) {
  const equippedWeight = calcEquippedWeight(data)        // лише вдягнене
  const enduranceCur   = parseFloat(data['res-cur-ed']) || 0
  // Рівень навички "Ухиляння"
  let dodgeLvl = 0
  if (data._skillLevels) {
    for (const [key, lvl] of Object.entries(data._skillLevels)) {
      if (key.includes('Ухиляння')) { dodgeLvl = parseInt(lvl) || 0; break }
    }
  }
  return calcDodge({ totalWeight: equippedWeight, enduranceCurrent: enduranceCur, dodgeSkillLevel: dodgeLvl })
}

function StatusPanelInner({ data, onEdit }) {
  const dodge = computeDodge(data)
  return (
    <div className={s.panel}>
      {FIELDS.map(f => (
        <div key={f.k} className={s.chip} style={{ background: f.bg }}>
          <span className={s.label}>{f.l}</span>
          {onEdit
            ? <FormulaInput className={s.valInput} value={data[f.k] || '0'}
                onChange={v => onEdit(f.k, v)} />
            : <span className={s.val}>{data[f.k] || 0}</span>}
        </div>
      ))}
      {/* ШУ — шанс ухилення, обчислюється автоматично (не редагується) */}
      <div className={s.chip} style={{ background: '#0d3b3b' }} title="Шанс Ухилення — залежить від навантаження та вміння «Ухиляння»">
        <span className={s.label}>ШУ</span>
        <span className={s.val}>{dodge}</span>
      </div>
    </div>
  )
}

export function StatusPanelFromContext() {
  const { data, setField } = useSheetData()
  return <StatusPanelInner data={data} onEdit={(k, v) => setField(k, v)} />
}

export default function StatusPanel({ data: dataProp }) {
  const dataStore = useSelector(selSheet.data)
  return <StatusPanelInner data={dataProp || dataStore} />
}
