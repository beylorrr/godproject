import { useEffect, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { saveCharacter, selSheet } from '../store/slices/sheetSlice'
import { selAuth } from '../store/slices/authSlice'
import { isCollection } from '../utils/collections'

// Поля, які відрізняються між base і next (верхній рівень ключів).
// Колекції (інвентар/закляття) виключаємо — вони зберігаються поопераційно.
function diffFields(base = {}, next = {}) {
  const out = {}
  for (const k of Object.keys(next)) {
    if (isCollection(k)) continue
    const a = base[k], b = next[k]
    const changed = (typeof b === 'object' && b !== null)
      ? JSON.stringify(a) !== JSON.stringify(b)
      : a !== b
    if (changed) out[k] = b
  }
  return out
}

/**
 * Автозбереження гравця.
 *
 * Логіка спирається ВИКЛЮЧНО на дельту (data vs _synced):
 *  - serverPatch/SSE одночасно оновлює _synced, тож серверні зміни не дають дельти
 *    і не шлються назад — окремий прапор-блокування не потрібен (саме він раніше
 *    спричиняв "зависання" статусу).
 *  - дельта рахується в момент відправки з актуального стану через ref.
 *  - якщо за час відправки набіглі нові зміни — зберігаємо ще раз.
 *  - сторож-таймер не дає статусу залипнути.
 */
export function useAutoSave() {
  const dispatch = useDispatch()
  const data     = useSelector(selSheet.data)
  const synced   = useSelector(selSheet.synced)
  const charId   = useSelector(selSheet.activeCharId)
  const token    = useSelector(selAuth.token)
  const [status, setStatus] = useState('idle')

  const ref      = useRef({})
  ref.current = { data, synced, charId, token }
  const timer    = useRef(null)
  const inFlight  = useRef(false)

  useEffect(() => {
    if (!charId || !token) return
    if (Object.keys(diffFields(synced, data)).length === 0) {
      // Нема локальних змін → нічого зберігати; статус у спокій (якщо не йде запис)
      if (!inFlight.current) setStatus(s => (s === 'pending' ? 'idle' : s))
      return
    }
    clearTimeout(timer.current)
    setStatus('pending')
    timer.current = setTimeout(run, 1200)
    return () => clearTimeout(timer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, charId])

  async function run() {
    if (inFlight.current) { timer.current = setTimeout(run, 400); return }
    const { data, synced, charId, token } = ref.current
    if (!charId || !token) { setStatus('idle'); return }
    const patch = diffFields(synced, data)
    if (Object.keys(patch).length === 0) { setStatus('idle'); return }

    inFlight.current = true
    setStatus('saving')
    try {
      await dispatch(saveCharacter({ id: charId, patch })).unwrap()
      setStatus('saved')
      setTimeout(() => setStatus(s => (s === 'saved' ? 'idle' : s)), 1800)
    } catch {
      setStatus('error')
      setTimeout(() => setStatus(s => (s === 'error' ? 'idle' : s)), 3000)
    } finally {
      inFlight.current = false
      // Зміни, що набігли під час запису — зберегти ще раз
      const { data: d2, synced: s2 } = ref.current
      if (Object.keys(diffFields(s2, d2)).length > 0) {
        clearTimeout(timer.current)
        timer.current = setTimeout(run, 500)
      }
    }
  }

  return status
}
