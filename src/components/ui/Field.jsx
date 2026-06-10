/** Базове поле вводу з лейблом */
export default function Field({ label, value, onChange, multiline, placeholder, type='text', style, ...props }) {
  return (
    <div className="field" style={style}>
      {label && <label>{label}</label>}
      {multiline ? (
        <textarea value={value||''} onChange={e=>onChange(e.target.value)} placeholder={placeholder} {...props}/>
      ) : (
        <input type={type} value={value||''} onChange={e=>onChange(e.target.value)} placeholder={placeholder} {...props}/>
      )}
    </div>
  )
}
