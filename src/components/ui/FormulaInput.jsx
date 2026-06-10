/**
 * FormulaInput — текстове поле для числа з підтримкою формул.
 *
 * Звичайне число вводиться як є. Якщо почати з оператора (+, -, *, /),
 * на підтвердженні (Enter або втрата фокусу) формула застосовується до
 * поточного значення: напр. поточне 100, ввід "+50" → 150; "-20" → 130; "*2" → 200.
 *
 * value — поточне число/рядок; onChange(newValue) — повертає підсумкове число (рядком).
 */
import { useState, useEffect } from 'react'
import { applyFormula } from '../../utils/formulas'

export default function FormulaInput({ value, onChange, className = '', style, title, readOnly }) {
  const [draft, setDraft] = useState(String(value ?? ''))
  const [editing, setEditing] = useState(false)

  // Поки не редагуємо — показуємо актуальне значення (оновлення ззовні: GM, SSE)
  useEffect(() => { if (!editing) setDraft(String(value ?? '')) }, [value, editing])

  const commit = () => {
    setEditing(false)
    const result = applyFormula(draft, value)
    const str = String(result)
    setDraft(str)
    if (str !== String(value ?? '')) onChange(str)
  }

  return (
    <input
      type="text"
      inputMode="text"
      className={className}
      style={style}
      title={title || 'Можна вводити формули: +5, -3, *2'}
      readOnly={readOnly}
      value={draft}
      onFocus={(e) => { setEditing(true); e.target.select?.() }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }}
    />
  )
}
