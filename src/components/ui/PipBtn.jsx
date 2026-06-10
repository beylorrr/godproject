/** Кнопка +/− для вмінь і характеристик */
export default function PipBtn({ onClick, disabled, children, title, tooltip }) {
  return (
    <button
      className={`pip-btn ${children==='+'?'pip-btn-plus':'pip-btn-minus'}`}
      onClick={onClick} disabled={disabled} title={title}
    >
      {children}
      {tooltip && <span className="skill-cost-tooltip">{tooltip}</span>}
    </button>
  )
}
