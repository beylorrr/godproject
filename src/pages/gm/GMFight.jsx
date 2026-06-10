/**
 * GMFight.jsx — вкладка "Бій" для майстра.
 *
 * Електронна версія аркуша "fight window" з Excel:
 *   · картка ворога: назва зверху, ряд статів HP/OM/MT/PD/MD/PR/MR/DC
 *   · ХП веде облік як формула "=база−шкода": майстер вписує число — воно віднімається
 *   · таблиця уражень: PD і MD × множники 0.1 / 0.25 / 0.5 / 0.75 / 1.0 / 1.5
 *   · список ефектів
 *   · картки вільно перетягуються по полю, копіюються і видаляються
 *
 * Стан живе в localStorage ('gm_fight_v1') — бойове полотно сесії.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { Swords, Copy, X, Plus, Heart, Droplets, Brain, GripHorizontal, Minus } from 'lucide-react'
import s from './GMFight.module.css'

const LS_KEY = 'gm_fight_v1'
const genId = () => 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

// Стати з аркуша fight window (рядок 3) + підказки, що куди вписувати
const STAT_DEFS = [
  { id: 'pd', label: 'PD', hint: 'Фізична шкода ворога — база для таблиці уражень' },
  { id: 'md', label: 'MD', hint: 'Магічна шкода ворога — база для таблиці уражень' },
  { id: 'pr', label: 'PR', hint: 'Фізичний опір — віднімається від вхідної фізичної шкоди' },
  { id: 'mr', label: 'MR', hint: 'Магічний опір — віднімається від вхідної магічної шкоди' },
  { id: 'dc', label: 'DC', hint: 'Складність влучання по ворогу (клас захисту)' },
]

// Множники уражень (рядки 5 і 7 аркуша)
const MULTS = [0.1, 0.25, 0.5, 0.75, 1.0, 1.5]
const MULT_HINTS = ['Дотик 10%', 'Слабке 25%', 'Половина 50%', 'Сильне 75%', 'Повне 100%', 'Кріт 150%']

function emptyEnemy(offset = 0) {
  return {
    id: genId(),
    name: 'Ворог',
    x: 24 + offset, y: 24 + offset,
    hpBase: 150, hpLost: 0,     // ХП = база − втрачено (як "=150-172" у таблиці)
    om: '0', mt: '0',           // одхі та ментальність — окремі ресурси
    pd: '0', md: '0', pr: '0', mr: '0', dc: '0',
    effects: [],
    dmgInput: '',               // поле швидкого віднімання
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) { const p = JSON.parse(raw); if (Array.isArray(p.enemies)) return p.enemies }
  } catch { /* зіпсований стан — починаємо з чистого поля */ }
  return []
}

export default function GMFight() {
  const [enemies, setEnemies] = useState(loadState)
  const fieldRef = useRef(null)
  const dragRef = useRef(null)   // { id, dx, dy } під час перетягування

  // Автозбереження полотна
  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ enemies })) } catch { /* квота */ }
  }, [enemies])

  const patch = (id, fn) =>
    setEnemies(list => list.map(e => (e.id === id ? fn(e) : e)))

  const addEnemy = () =>
    setEnemies(list => [...list, emptyEnemy((list.length % 8) * 26)])

  // Копія попередньої заповненої картки — поряд, зі зсувом
  const copyEnemy = (id) =>
    setEnemies(list => {
      const src = list.find(e => e.id === id)
      if (!src) return list
      return [...list, { ...src, id: genId(), name: src.name + ' (копія)', x: src.x + 34, y: src.y + 34 }]
    })

  const removeEnemy = (id) => setEnemies(list => list.filter(e => e.id !== id))

  // ── Перетягування за заголовок (pointer events: миша + тач) ──
  const onDragStart = (e, id) => {
    const card = e.currentTarget.closest(`.${s.card}`)
    const rect = card.getBoundingClientRect()
    dragRef.current = { id, dx: e.clientX - rect.left, dy: e.clientY - rect.top }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onDragMove = useCallback((e) => {
    const d = dragRef.current
    if (!d) return
    const field = fieldRef.current.getBoundingClientRect()
    const x = Math.max(0, e.clientX - field.left - d.dx + fieldRef.current.scrollLeft)
    const y = Math.max(0, e.clientY - field.top - d.dy + fieldRef.current.scrollTop)
    patch(d.id, en => ({ ...en, x, y }))
  }, [])
  const onDragEnd = () => { dragRef.current = null }

  return (
    <div>
      <div className={s.toolbar}>
        <h2 className={s.title}><Swords size={17} strokeWidth={1.8} aria-hidden /> Бій</h2>
        <button className={s.addBtn} onClick={addEnemy}>
          <Plus size={13} aria-hidden /> Ворог
        </button>
        <span className={s.toolHint}>Тягни картку за верхню смугу · вписуй шкоду і тисни «−»</span>
      </div>

      <div className={s.field} ref={fieldRef}
        onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerLeave={onDragEnd}>
        {enemies.length === 0 && (
          <div className={s.empty}>Поле бою порожнє. Додай першого ворога кнопкою «+ Ворог».</div>
        )}
        {enemies.map(en => (
          <EnemyCard key={en.id} en={en}
            onPatch={fn => patch(en.id, fn)}
            onCopy={() => copyEnemy(en.id)}
            onRemove={() => removeEnemy(en.id)}
            onDragStart={e => onDragStart(e, en.id)} />
        ))}
      </div>
    </div>
  )
}

function EnemyCard({ en, onPatch, onCopy, onRemove, onDragStart }) {
  const hpCur = (parseFloat(en.hpBase) || 0) - (parseFloat(en.hpLost) || 0)
  const set = (k) => (e) => onPatch(x => ({ ...x, [k]: e.target.value }))

  // "Віднімати те, що він може записати" — як формула "=150-172" в Excel:
  // вписане число додається до втраченого ХП. Підтримує і вирази "12+5".
  const applyDamage = () => {
    const raw = String(en.dmgInput || '').replace(',', '.').trim()
    if (!raw) return
    // дозволяємо прості вирази з + - * / і числами
    if (!/^[\d\s.+\-*/()]+$/.test(raw)) return
    let val
    try { val = Function(`"use strict"; return (${raw})`)() } catch { return }
    if (!isFinite(val)) return
    onPatch(x => ({ ...x, hpLost: Math.round(((parseFloat(x.hpLost) || 0) + val) * 100) / 100, dmgInput: '' }))
  }

  const pd = parseFloat(en.pd) || 0
  const md = parseFloat(en.md) || 0

  return (
    <div className={s.card} style={{ left: en.x, top: en.y }}>
      {/* Смуга перетягування + назва */}
      <div className={s.cardHead} onPointerDown={onDragStart} title="Тягни, щоб перемістити картку">
        <GripHorizontal size={14} className={s.grip} aria-hidden />
        <input className={s.nameInput} value={en.name} placeholder="Назва супротивника…"
          onChange={set('name')} onPointerDown={e => e.stopPropagation()} />
        <button className={s.headBtn} title="Копіювати картку (з усіма значеннями)" onClick={onCopy}
          onPointerDown={e => e.stopPropagation()}><Copy size={13} aria-hidden /></button>
        <button className={`${s.headBtn} ${s.headBtnDel}`} title="Прибрати ворога з поля" onClick={onRemove}
          onPointerDown={e => e.stopPropagation()}><X size={13} aria-hidden /></button>
      </div>

      {/* ХП: база − втрачено = поточне; швидке віднімання */}
      <div className={s.hpRow}>
        <span className={s.hpLabel} title="Здоров'я: база − завдана шкода"><Heart size={13} aria-hidden /> HP</span>
        <input className={s.hpBase} type="number" value={en.hpBase} title="База здоров'я"
          onChange={e => onPatch(x => ({ ...x, hpBase: e.target.value }))} />
        <span className={s.hpSep}>−</span>
        <input className={s.hpLost} type="number" value={en.hpLost} title="Сумарна завдана шкода (можна правити вручну)"
          onChange={e => onPatch(x => ({ ...x, hpLost: e.target.value }))} />
        <span className={s.hpSep}>=</span>
        <span className={`${s.hpCur} ${hpCur <= 0 ? s.hpDead : ''}`} title="Поточне здоров'я">{Math.round(hpCur * 100) / 100}</span>
        <input className={s.dmgInput} placeholder="шкода…" value={en.dmgInput}
          title="Впиши число або вираз (напр. 12+5) і натисни −"
          onChange={set('dmgInput')} onKeyDown={e => e.key === 'Enter' && applyDamage()} />
        <button className={s.dmgBtn} title="Відняти від ХП" onClick={applyDamage}><Minus size={13} aria-hidden /></button>
      </div>

      {/* OM і MT — окремі ресурси, як у таблиці */}
      <div className={s.resRow}>
        <label className={s.resPill} title="Одхі (мана) ворога">
          <Droplets size={12} aria-hidden /> OM
          <input type="number" value={en.om} onChange={set('om')} />
        </label>
        <label className={s.resPill} title="Ментальність ворога">
          <Brain size={12} aria-hidden /> MT
          <input type="number" value={en.mt} onChange={set('mt')} />
        </label>
        {STAT_DEFS.map(st => (
          <label key={st.id} className={s.statPill} title={st.hint}>
            {st.label}
            <input type="number" value={en[st.id]} onChange={set(st.id)} />
          </label>
        ))}
      </div>

      {/* Таблиця уражень: PD і MD × множники (рядки 5-8 аркуша) */}
      <table className={s.dmgTable} title="Готові значення шкоди ворога за силою влучання">
        <thead>
          <tr>
            <th></th>
            {MULTS.map((m, i) => <th key={m} title={MULT_HINTS[i]}>{m}</th>)}
          </tr>
        </thead>
        <tbody>
          <tr title="Фізична шкода × множник">
            <td className={s.dmgKind}>PD</td>
            {MULTS.map(m => <td key={m}>{Math.round(pd * m * 10) / 10}</td>)}
          </tr>
          <tr title="Магічна шкода × множник">
            <td className={s.dmgKind}>MD</td>
            {MULTS.map(m => <td key={m}>{Math.round(md * m * 10) / 10}</td>)}
          </tr>
        </tbody>
      </table>

      {/* Ефекти (колонка I аркуша) */}
      <div className={s.effects}>
        {(en.effects || []).map((ef, i) => (
          <div key={i} className={s.effectRow}>
            <span className={s.effectDot} aria-hidden>◆</span>
            <input value={ef} placeholder={`Ефект ${i + 1}…`}
              onChange={e => onPatch(x => {
                const effects = [...x.effects]; effects[i] = e.target.value
                return { ...x, effects }
              })} />
            <button className={s.effectDel} title="Прибрати ефект"
              onClick={() => onPatch(x => ({ ...x, effects: x.effects.filter((_, j) => j !== i) }))}>
              <X size={11} aria-hidden />
            </button>
          </div>
        ))}
        <button className={s.effectAdd} onClick={() => onPatch(x => ({ ...x, effects: [...(x.effects || []), ''] }))}>
          <Plus size={11} aria-hidden /> Ефект
        </button>
      </div>
    </div>
  )
}
