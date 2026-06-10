export default function SaveIndicator({ status }) {
  const labels = { idle:'', pending:'○ Зміни…', saving:'● Збереження…', saved:'✓ Збережено', error:'⚠ Помилка збереження' }
  if (!labels[status]) return null
  return (
    <span className={`save-indicator ${status}`} aria-live="polite">
      {labels[status]}
    </span>
  )
}
