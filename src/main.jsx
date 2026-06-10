import { StrictMode }  from 'react'
import { createRoot }  from 'react-dom/client'
import { Provider }    from 'react-redux'
import { PersistGate } from 'redux-persist/integration/react'
import { store, persistor } from './store/index'
import App  from './App'
import './index.css'

// Глобально: при фокусі на числовому полі зі значенням "0" виділяємо весь текст,
// щоб перший введений символ одразу замінив нолик (не доводилось стирати вручну).
// Глобально: при фокусі на полі зі значенням "0" виділяємо весь текст,
// щоб перший введений символ одразу замінив нолик (не доводилось стирати вручну).
// Працює і для type=number, і для текстових полів, що містять лише число.
document.addEventListener('focusin', (e) => {
  const el = e.target
  if (!el || el.tagName !== 'INPUT') return
  const isNumeric = el.type === 'number' ||
    (el.type === 'text' && /^-?\d*\.?\d*$/.test(el.value))
  if (isNumeric && (el.value === '0' || el.value === '')) {
    // подвійний rAF — щоб виділення спрацювало після нативного встановлення каретки
    requestAnimationFrame(() => requestAnimationFrame(() => { try { el.select() } catch {} }))
  }
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Provider store={store}>
      <PersistGate
        loading={<div style={{color:'#f5c84a',textAlign:'center',marginTop:'40vh',fontFamily:"'Cinzel',serif",letterSpacing:'.2em',fontSize:'2rem'}}>✦</div>}
        persistor={persistor}>
        <App/>
      </PersistGate>
    </Provider>
  </StrictMode>
)
