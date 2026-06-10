/**
 * DamageTable — таблиця урону за відсотками для правої/лівої руки.
 * Використовується і на головному екрані (зведення), і у вкладці Бій.
 *
 * Права рука: 100% = СИЛ×5 + фіз.атака зброї, ІНТ×5 + маг.атака зброї.
 * Ліва рука:  100% = лише фіз.атака + маг.атака зброї (без характеристик).
 * Ліва рука рахується лише якщо в ній щось є.
 */
const DMG_PCTS = [
  { k: '100%', mult: 1 }, { k: '10%', mult: .1 }, { k: '25%', mult: .25 },
  { k: '50%', mult: .5 }, { k: '75%', mult: .75 }, { k: '150%', mult: 1.5 }, { k: '300%', mult: 3 },
]

export default function DamageTable({ d, className = '' }) {
  const str = parseInt(d['stat-str']) || 0
  const int = parseInt(d['stat-int']) || 0
  const wrPhys = parseFloat(d['wr-phys']) || 0
  const wrMag  = parseFloat(d['wr-mag'])  || 0
  const wlPhys = parseFloat(d['wl-phys']) || 0
  const wlMag  = parseFloat(d['wl-mag'])  || 0
  const hasLeft = !!(d['wl-name'] || wlPhys || wlMag)

  // Права — з характеристиками; ліва — лише зброя
  const wr100p = Math.floor(str * 5 + wrPhys)
  const wr100m = Math.floor(int * 5 + wrMag)
  const wl100p = hasLeft ? Math.floor(wlPhys) : 0
  const wl100m = hasLeft ? Math.floor(wlMag) : 0

  return (
    <table className={`dmg-table ${className}`}>
      <thead>
        <tr>
          <th>%</th>
          <th colSpan={3}>{d['wr-name'] || 'П.Рука'} — права</th>
          <th colSpan={3} style={{ opacity: hasLeft ? 1 : .45 }}>{d['wl-name'] || 'Л.Рука'} — ліва</th>
        </tr>
        <tr>
          <th /><th>Фіз</th><th>Маг</th><th>Заг</th>
          <th>Фіз</th><th>Маг</th><th>Заг</th>
        </tr>
      </thead>
      <tbody>
        {DMG_PCTS.map(({ k, mult }) => {
          const wp = Math.floor(wr100p * mult), wm = Math.floor(wr100m * mult)
          const lp = Math.floor(wl100p * mult), lm = Math.floor(wl100m * mult)
          return (
            <tr key={k}>
              <td>{k}</td>
              <td>{wp}</td><td>{wm}</td><td style={{ fontWeight: 700, color: 'var(--gold2)' }}>{wp + wm}</td>
              <td style={{ opacity: hasLeft ? 1 : .3 }}>{lp}</td>
              <td style={{ opacity: hasLeft ? 1 : .3 }}>{lm}</td>
              <td style={{ fontWeight: 700, color: 'var(--gold2)', opacity: hasLeft ? 1 : .3 }}>{lp + lm}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
