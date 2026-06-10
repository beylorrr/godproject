import { useSheetData } from '../../context/SheetDataContext'
import { useState } from 'react'
import SectionTitle from '../ui/SectionTitle'
import TransferPanel from '../ui/TransferPanel'
import ItemCard from '../ui/ItemCard'
import { Backpack, Scroll, Wrench, BookOpen, Leaf, FlaskRound, Caravan, Layers, Shield } from 'lucide-react'
import TabCombat from './TabCombat'

const INV_TABS = [
  { id: 'all',             label: 'Усе',          special: 'all',   Icon: Layers },
  { id: 'inv-main',        label: 'Загальне',    Icon: Backpack   },
  { id: 'equip',           label: 'Екіпірування', special: 'equip', Icon: Shield },
  { id: 'inv-quest',       label: 'Квест',       Icon: Scroll     },
  { id: 'inv-tools',       label: 'Дрібниці',    Icon: Wrench     },
  { id: 'inv-books',       label: 'Книги',       Icon: BookOpen   },
  { id: 'inv-ingredients', label: 'Інгредієнти', Icon: Leaf       },
  { id: 'inv-potions',     label: 'Зілля',       Icon: FlaskRound },
  { id: 'inv-horse',       label: 'Кінь/Візок',  Icon: Caravan    },
]

const TAB_BTN = (active) => ({
  fontFamily: "'Cinzel',serif", fontSize: '.62rem', fontWeight: 700,
  letterSpacing: '.07em', textTransform: 'uppercase',
  background: active ? 'var(--s4)' : 'var(--s2)',
  border: active ? '1px solid var(--gold4)' : '1px solid var(--br)',
  borderRadius: 4, color: active ? 'var(--gold2)' : 'var(--muted)',
  padding: '7px 11px', cursor: 'pointer', transition: 'all .12s', whiteSpace: 'nowrap',
  display: 'inline-flex', alignItems: 'center', gap: 5,
  boxShadow: active ? '0 0 10px rgba(160,30,30,.25), inset 0 1px 0 rgba(212,176,72,.15)' : 'none',
})

export default function TabInventory() {
  const ctx = useSheetData()
  const { data: d } = ctx
  const [tab, setTab] = useState('inv-main')
  const current = INV_TABS.find(t => t.id === tab) || INV_TABS[0]

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
        {INV_TABS.map(t => (
          <button key={t.id} style={TAB_BTN(tab === t.id)} onClick={() => setTab(t.id)}>
            <t.Icon size={13} strokeWidth={1.8} style={{ flexShrink: 0, opacity: tab === t.id ? 1 : .6 }} aria-hidden />
            {t.label}
          </button>
        ))}
      </div>

      {current.special === 'all' ? <AllItemsView d={d}/>
        : current.special === 'equip' ? <TabCombat/>
        : <InventoryList
            key={current.id}
            listId={current.id}
            rows={d[`_inv_${current.id}`] || []}
            maxRows={current.maxRows || null}
            ctx={ctx}/>
      }
    </div>
  )
}


// Вкладка "Усе": зведення всіх предметів гравця, включно з екіпіруванням.
// Перегляд — редагувати предмети можна у їхніх рідних вкладках.
function AllItemsView({ d }) {
  const SOURCES = [
    ['_inv_inv-main','Загальне'], ['_inv_inv-quest','Квест'], ['_inv_inv-tools','Дрібниці'],
    ['_inv_inv-books','Книги'], ['_inv_inv-ingredients','Інгредієнти'], ['_inv_inv-potions','Зілля'],
    ['_inv_inv-horse','Кінь/Візок'],
  ]
  const groups = SOURCES
    .map(([key, label]) => ({ label, rows: d[key] || [] }))
    .filter(g => g.rows.length > 0)

  // Екіпіроване: броня по слотах, зброя в руках, щит
  const equipped = []
  Object.entries(d._armor || {}).forEach(([slot, a]) => {
    if (a && (a.name || a.equipped)) equipped.push({ kind: 'Броня', slot, name: a.name || slot, w: a.w, phys: a.phys, mag: a.mag })
  })
  ;['wr','wl'].forEach(hand => {
    if (d[`${hand}-name`]) equipped.push({ kind: 'Зброя', slot: hand === 'wr' ? 'Права рука' : 'Ліва рука',
      name: d[`${hand}-name`], w: d[`${hand}-weight`], phys: d[`${hand}-phys`], mag: d[`${hand}-mag`] })
  })
  if (d._shield?.name) equipped.push({ kind: 'Щит', slot: 'Щит', name: d._shield.name, w: d._shield.w, phys: d._shield.phys, mag: d._shield.mag })

  const totalW = Math.round(groups.reduce((s, g) =>
    s + g.rows.reduce((a, it) => a + (parseFloat(it.weight) || 0), 0), 0) * 1000) / 1000

  if (groups.length === 0 && equipped.length === 0)
    return <div style={{ fontFamily: "'EB Garamond',serif", fontStyle: 'italic', color: 'var(--muted)', padding: '14px 4px' }}>
      Кишені порожні — додай предмети у вкладках інвентарю.
    </div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <span style={{ fontFamily: "'Cinzel',serif", fontSize: '.7rem', color: 'var(--muted)' }}>
          Носима вага: <strong style={{ color: 'var(--iv2)' }}>{totalW} кг</strong>
        </span>
      </div>

      {equipped.length > 0 && (
        <>
          <SectionTitle>Екіпіровано</SectionTitle>
          {equipped.map((eq, i) => (
            <div key={i} className="item-row" style={{ marginBottom: 5 }}>
              <div className="item-row-main">
                <span className="item-row-badge">{eq.kind}</span>
                <span className="item-row-name">{eq.name}</span>
                <span className="item-row-stats">
                  <span style={{ color: 'var(--muted)' }}>{eq.slot}</span>
                  {parseFloat(eq.w) ? <span>{eq.w}кг</span> : null}
                  {parseFloat(eq.phys) ? <span style={{ color: '#8fb4d6' }}>Фіз {eq.phys}</span> : null}
                  {parseFloat(eq.mag) ? <span style={{ color: '#b48fd6' }}>Маг {eq.mag}</span> : null}
                </span>
              </div>
            </div>
          ))}
        </>
      )}

      {groups.map(g => (
        <div key={g.label}>
          <SectionTitle>{g.label}</SectionTitle>
          <div className="inv-grid">
            {g.rows.map(it => (
              <div key={it._id} className="inv-cell">
                <ItemCard item={it} readOnly />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}


function InventoryList({ listId, rows, maxRows, ctx }) {
  const { invAdd, invUpdate, invRemove, invMove } = ctx
  const [transferRow, setTransferRow] = useState(null)
  const [moveRow, setMoveRow] = useState(null)
  const [typeFilter, setTypeFilter] = useState('')
  const [search, setSearch] = useState('')
  const [justAdded, setJustAdded] = useState(null)
  const [dragId, setDragId] = useState(null)
  const [overId, setOverId] = useState(null)

  const totalW = Math.round(rows.reduce((s, it) => s + (parseFloat(it.weight) || 0), 0) * 1000) / 1000
  const canAdd = !maxRows || rows.length < maxRows

  // Перемістити предмет у інший список інвентарю
  const doMove = (item, targetListId) => {
    if (targetListId && targetListId !== listId) {
      const { _id, ...rest } = item
      invAdd(targetListId, { ...rest })
      invRemove(listId, item._id)
    }
    setMoveRow(null)
  }

  // Перетягування для сортування
  const onDrop = (targetId) => {
    if (!dragId || dragId === targetId) { setDragId(null); setOverId(null); return }
    const toIndex = rows.findIndex(r => r._id === targetId)
    if (toIndex >= 0) invMove(listId, dragId, toIndex)
    setDragId(null); setOverId(null)
  }

  const shown = rows.filter(it =>
    (!typeFilter || (it.type || 'other') === typeFilter) &&
    (!search || (it.name || '').toLowerCase().includes(search.toLowerCase()))
  )
  const canDrag = !typeFilter && !search   // сортувати можна лише без фільтрів

  return (
    <>
      {/* Кнопка додавання — зверху */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        {canAdd
          ? <button className="add-row-btn" onClick={() => setJustAdded(invAdd(listId))}>
              + Додати предмет{maxRows ? ` (${rows.length}/${maxRows})` : ''}
            </button>
          : <span style={{ fontFamily: "'Cinzel',serif", fontSize: '.65rem', color: 'var(--muted)', opacity: .7 }}>
              Заповнено ({rows.length}/{maxRows})
            </span>
        }
        {rows.length > 0 && (
          <span style={{ fontFamily: "'Cinzel',serif", fontSize: '.7rem', color: 'var(--muted)' }}>
            Вага: <strong style={{ color: 'var(--iv2)' }}>{totalW} кг</strong>
          </span>
        )}
      </div>

      {rows.length > 2 && (
        <div className="inv-toolbar">
          <div className="inv-type-chips">
            {[['', 'Всі'], ['armor', 'Броня'], ['weapon', 'Зброя'], ['other', 'Інше']].map(([id, lbl]) => (
              <button key={id}
                className={`inv-type-chip ${typeFilter === id ? 'inv-type-chip--on' : ''}`}
                onClick={() => setTypeFilter(id)}>{lbl}</button>
            ))}
          </div>
          <input className="inv-search" placeholder="Пошук…" value={search}
            onChange={e => setSearch(e.target.value)} />
        </div>
      )}

      {/* Сітка предметів у дві колонки */}
      <div className="inv-grid">
        {shown.map((it) => {
          const isTransferring = transferRow === it._id
          const isMoving = moveRow === it._id
          const expanded = isTransferring || isMoving || it._id === justAdded
          return (
            <div key={it._id}
              draggable={canDrag}
              onDragStart={() => canDrag && setDragId(it._id)}
              onDragOver={e => { if (canDrag) { e.preventDefault(); setOverId(it._id) } }}
              onDragLeave={() => overId === it._id && setOverId(null)}
              onDrop={() => onDrop(it._id)}
              className={`inv-cell ${expanded ? 'inv-cell--wide' : ''} ${dragId === it._id ? 'dragging' : ''} ${overId === it._id && dragId ? 'drag-over' : ''}`}>
              <ItemCard
                item={it}
                defaultEditing={it._id === justAdded}
                onSave={(patch) => invUpdate(listId, it._id, patch)}
                onRemove={() => invRemove(listId, it._id)}
                onTransfer={() => { setTransferRow(isTransferring ? null : it._id); setMoveRow(null) }}
                onMove={() => { setMoveRow(isMoving ? null : it._id); setTransferRow(null) }}
              />
              {isMoving && (
                <div className="move-panel">
                  <span className="move-panel-label">Перемістити в:</span>
                  <div className="move-panel-opts">
                    {INV_TABS.filter(t => !t.special && t.id !== listId).map(t => (
                      <button key={t.id} className="move-panel-btn"
                        onClick={() => doMove(it, t.id)}>{t.label}</button>
                    ))}
                  </div>
                  <button className="move-panel-cancel" onClick={() => setMoveRow(null)}>Скасувати</button>
                </div>
              )}
              {isTransferring && (
                <TransferPanel
                  mode="item" itemRow={it} rowId={it._id} listId={listId}
                  onClose={() => setTransferRow(null)} />
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
