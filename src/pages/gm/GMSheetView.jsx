/**
 * GMSheetView — повністю ізольований від sheetSlice гравця.
 * GM тримає лист у локальному useReducer → гравець не втрачає свої дані.
 * Лайв-синхронізація:
 *   - Гравець редагує → SSE patch → GM бачить одразу
 *   - GM редагує → debounced PUT /api/gm/char/:id → гравець отримує SSE patch
 */
import { useEffect, useReducer, useRef, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { setActiveTab, selSheet } from '../../store/slices/sheetSlice'
import { selAuth } from '../../store/slices/authSlice'
import { gmSheetReducer } from '../../utils/gmSheetReducer'
import { emptySheet } from '../../store/slices/sheetSlice'
import { GmSheetProvider } from '../../context/SheetDataContext'
import { isCollection } from '../../utils/collections'
import SaveIndicator from '../../components/ui/SaveIndicator'
import SkillTooltip  from '../../components/ui/SkillTooltip'
import TabGeneral    from '../../components/tabs/TabGeneral'
import TabStats      from '../../components/tabs/TabStats'
import TabSkills     from '../../components/tabs/TabSkills'
import TabCombat     from '../../components/tabs/TabCombat'
import TabInventory  from '../../components/tabs/TabInventory'
import TabSpells     from '../../components/tabs/TabSpells'
import sheetCss from '../SheetPage.module.css'
import s from './GMSheetView.module.css'

const API = import.meta.env.VITE_API_URL ?? ''

// Повертає поля, які відрізняються між base і next (по верхньому рівні ключів).
// Колекції (інвентар/закляття) виключаємо — вони йдуть поопераційно через collectionOp.
function diffFields(base = {}, next = {}) {
  const out = {}
  for (const k of Object.keys(next)) {
    if (isCollection(k)) continue
    const a = base[k]
    const b = next[k]
    const changed = (typeof b === 'object' && b !== null)
      ? JSON.stringify(a) !== JSON.stringify(b)
      : a !== b
    if (changed) out[k] = b
  }
  return out
}

const TABS = [
  { id:'general',   label:'Загальне'       },
  { id:'stats',     label:'Характеристики' },
  { id:'skills',    label:'Вміння'         },
  { id:'combat',    label:'Бій'            },
  { id:'inventory', label:'Інвентар'       },
  { id:'spells',    label:'Закляття'       },
]

// НЕ оголошуємо CONTENT тут — табки мають рендеритись всередині GmSheetProvider

export default function GMSheetView() {
  const navigate    = useNavigate()
  const reduxDispatch = useDispatch()
  const { charId }  = useParams()
  const token       = useSelector(selAuth.token)
  const activeTab   = useSelector(selSheet.activeTab)

  // ── Локальний стан листа (ізольований від sheetSlice) ──
  const [data, localDispatch] = useReducer(gmSheetReducer, emptySheet())
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState('idle')
  const saveTimer  = useRef(null)
  const dataRef    = useRef(data)
  const isFirstLoad = useRef(true)
  // Знімок листа на момент останнього синку з сервером (load / save / SSE).
  // Дельта для збереження = поля, що відрізняються від цього знімка.
  const syncedRef  = useRef({})
  dataRef.current = data

  // ── 1. Завантажити лист при вході ──────────────────
  useEffect(() => {
    if (!charId || !token) return
    setLoading(true)
    fetch(`${API}/api/gm/char/${charId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(res => {
        const sd = res.sheetData || {}
        localDispatch({ type: 'init', payload: sd })
        syncedRef.current = { ...emptySheet(), ...sd }
        setLoading(false)
        isFirstLoad.current = false
      })
      .catch(() => setLoading(false))
  }, [charId, token])

  // ── 2. SSE: зміни гравця → оновлюємо GM лайв ──
  useEffect(() => {
    if (!token) return
    const es = new EventSource(`${API}/api/events?token=${encodeURIComponent(token)}`)

    // Коли GM сам щось зробив (damage/xp) — гравець отримує sheet_update,
    // але GM також підписаний і може отримати його — ігноруємо (GM вже має ці дані)
    es.addEventListener('sheet_update', e => {
      try {
        const payload = JSON.parse(e.data)
        if (String(payload.charId) !== String(charId)) return
        localDispatch({ type: 'applySSEPatch', payload: payload.patches })
        // Ці поля прийшли з сервера — синхронізуємо знімок, щоб вони не пішли назад як GM-дельта
        syncedRef.current = { ...syncedRef.current, ...payload.patches }
      } catch {}
    })

    // Гравець зберіг автозбереженням → повний sheetData → оновлюємо GM
    es.addEventListener('player_sheet_update', e => {
      try {
        const payload = JSON.parse(e.data)
        if (String(payload.charId) !== String(charId)) return
        const sd = payload.sheetData || {}
        // Беремо поля гравця, але НЕ затираємо поля, які GM редагує просто зараз
        // (тобто ті, що відрізняються від останнього синку — незбережена GM-дельта).
        const gmDelta = diffFields(syncedRef.current, dataRef.current)
        const merged  = { ...sd, ...gmDelta }
        localDispatch({ type: 'mergePlayerUpdate', payload: merged })
        // Синк-знімок = повний лист гравця (GM-дельта лишається "незбереженою" поверх)
        syncedRef.current = { ...emptySheet(), ...sd }
      } catch {}
    })

    // Гравець (або сервер при передачі) змінив колекцію — застосовуємо операцію локально
    es.addEventListener('collection_op', e => {
      try {
        const payload = JSON.parse(e.data)
        if (String(payload.charId) !== String(charId)) return
        localDispatch({ type: 'collectionOp', op: payload.op })
      } catch {}
    })

    return () => es.close()
  }, [charId, token])

  // ── 3. Автозбереження GM → бекенд → SSE гравцю ───
  // Шлемо ТІЛЬКИ змінені GM-ом поля (дельту проти останнього синку).
  // Так зміни гравця в інших полях не затираються.
  const saveFn = useCallback(async (sheetData) => {
    const patch = diffFields(syncedRef.current, sheetData)
    if (Object.keys(patch).length === 0) { setSaveStatus('idle'); return }
    setSaveStatus('saving')
    try {
      await fetch(`${API}/api/gm/char/${charId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ patch }),
      })
      // Збережене стало синком — наступна дельта рахується від нього
      syncedRef.current = { ...syncedRef.current, ...patch }
      setSaveStatus('saved')
    } catch { setSaveStatus('error') }
    setTimeout(() => setSaveStatus('idle'), 3000)
  }, [charId, token])

  useEffect(() => {
    // Не зберігаємо при першому завантаженні
    if (isFirstLoad.current) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveFn(dataRef.current), 1500)
    return () => clearTimeout(saveTimer.current)
  }, [data])

  if (loading) return (
    <div className={s.page}>
      <div className={s.header}>
        <button className={s.backBtn} onClick={() => navigate('/gm')}>← Назад до пачок</button>
      </div>
      <div style={{ padding: '60px', textAlign: 'center', color: 'var(--muted)' }}>
        Завантаження листа…
      </div>
    </div>
  )

  return (
    <GmSheetProvider data={data} dispatch={localDispatch}>
      <div className={s.page}>
        <div className={s.header}>
          <button className={s.backBtn} onClick={() => navigate('/gm')}>← Назад до пачок</button>
          <div className={s.title}>
            <span className={s.charName}>{data.name_known || 'Персонаж'}</span>
            <span className={s.playerName}> · GM-редагування</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <SaveIndicator status={saveStatus} />
            <div className={s.levelBadge}>Рів. {data.level || 1}</div>
          </div>
        </div>

        <div className={sheetCss.tabNav}>
          {TABS.map(t => (
            <button key={t.id}
              className={`${sheetCss.tabBtn} ${activeTab === t.id ? sheetCss.active : ''}`}
              onClick={() => reduxDispatch(setActiveTab(t.id))}>
              {t.label}
            </button>
          ))}
        </div>

        <div className={`${sheetCss.content} ${activeTab === 'skills' ? sheetCss.contentWide : ''}`}>
          <GmTabContent activeTab={activeTab}/>
        </div>

        <SkillTooltip />
      </div>
    </GmSheetProvider>
  )
}

// Всередині GmSheetProvider — useSheetData() отримує GM-локальний стан
function GmTabContent({ activeTab }) {
  const CONTENT = {
    general:   <TabGeneral/>,
    stats:     <TabStats/>,
    skills:    <TabSkills/>,
    combat:    <TabCombat/>,
    inventory: <TabInventory/>,
    spells:    <TabSpells/>,
  }
  return <div key={activeTab}>{CONTENT[activeTab] || CONTENT.general}</div>
}
