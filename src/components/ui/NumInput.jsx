/**
 * NumInput — числове поле для листа.
 *  - Без браузерних стрілок (спінера) — глобально прибрано в index.css.
 *  - При фокусі, якщо значення 0 або порожнє, поле очищається, щоб не доводилось
 *    вручну стирати нолик перед введенням (часта скарга при редагуванні).
 *  - При втраті фокусу порожнє повертається у 0.
 *
 * value — число або рядок; onChange(value) повертає рядок (зберігаємо як є).
 */
import { useState } from 'react'

export default function NumInput({ value, onChange, step, min = 0, className = '', style, placeholder }) {
  const [focused, setFocused] = useState(false)

  // Що показуємо: при фокусі ховаємо "0", щоб одразу друкувати нове значення
  const shown = focused && (value === 0 || value === '0' || value === '' || value == null)
    ? ''
    : (value ?? '')

  return (
    <input
      type="number"
      inputMode="decimal"
      step={step}
      min={min}
      className={className}
      style={style}
      placeholder={placeholder}
      value={shown}
      onFocus={(e) => { setFocused(true); e.target.select?.() }}
      onBlur={() => { setFocused(false); if (value === '' || value == null) onChange('0') }}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}
