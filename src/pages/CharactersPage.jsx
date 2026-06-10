import { useEffect, useState, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { fetchCharacters, createCharacter, importCharacter, activateCharacter, loadCharacter, deleteCharacter, selSheet } from '../store/slices/sheetSlice'
import { logout, selAuth } from '../store/slices/authSlice'
import { parseCharacterXlsx } from '../utils/excelImport'
import s from './CharactersPage.module.css'

export default function CharactersPage() {
  const dispatch  = useDispatch()
  const navigate  = useNavigate()
  const chars     = useSelector(selSheet.characters)
  const loading   = useSelector(selSheet.loadingList)
  const error     = useSelector(selSheet.error)
  const username  = useSelector(selAuth.username)
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => { dispatch(fetchCharacters()) }, [])

  const open = async char => {
    await dispatch(activateCharacter(Number(char._id)))
    await dispatch(loadCharacter(Number(char._id)))
    navigate('/sheet')
  }

  const createNew = async () => {
    if (creating) return
    setCreating(true)
    try {
      const res = await dispatch(createCharacter(''))
      if (res.meta.requestStatus==='fulfilled') {
        const newId = Number(res.payload._id)
        await dispatch(activateCharacter(newId))
        await dispatch(loadCharacter(newId))
        navigate('/sheet')
      }
    } finally { setCreating(false) }
  }

  const onImportClick = () => fileRef.current?.click()

  const onFileChosen = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''  // дозволити повторний вибір того ж файлу
    if (!file) return
    setImporting(true)
    try {
      const buf = await file.arrayBuffer()
      const sheetData = parseCharacterXlsx(buf)
      const slotName = sheetData.name_known || sheetData.name_full || 'Імпортований персонаж'
      const res = await dispatch(importCharacter({ slotName, sheetData }))
      if (res.meta.requestStatus === 'fulfilled') {
        const newId = Number(res.payload._id)
        await dispatch(activateCharacter(newId))
        await dispatch(loadCharacter(newId))
        navigate('/sheet')
      } else {
        alert('Не вдалося імпортувати персонажа')
      }
    } catch (err) {
      console.error(err)
      alert('Помилка читання файлу. Переконайтесь, що це коректна Excel-таблиця персонажа.')
    } finally {
      setImporting(false)
    }
  }

  const del = async (e, id) => {
    e.stopPropagation()
    if (!window.confirm('Видалити персонажа?')) return
    dispatch(deleteCharacter(Number(id)))
  }

  return (
    <div className={s.page}>
      <div className={s.topbar}>
        <h1 className={s.title}>Персонажі</h1>
        <div className={s.right}>
          <span className={s.username}>{username}</span>
          <button className={s.logoutBtn} onClick={()=>navigate('/party-select')}>← Пачки</button>
          <button className={s.logoutBtn} onClick={()=>dispatch(logout())}>Вийти</button>
        </div>
      </div>

      {error && <div className={s.error}>{error}</div>}
      {loading && <div className={s.hint}>Завантаження…</div>}

      <div className={s.list}>
        {chars.map(c => (
          <div key={c._id} className={`${s.card} ${c.isActive?s.active:''}`}>
            {c.isActive && <span className={s.badge}>активний</span>}
            <div className={s.icon}>✦</div>
            <div className={s.info}>
              <div className={s.name}>{c.slotName || c.preview?.name_known || 'Без імені'}</div>
              <div className={s.meta}>
                {[c.preview?.name_known, c.preview?.race,
                  `Рів. ${c.preview?.level && c.preview.level !== '0' ? c.preview.level : '1'}`
                ].filter(Boolean).join(' · ')}
              </div>
            </div>
            <div className={s.actions}>
              <button className={s.openBtn} onClick={()=>open(c)}>Відкрити</button>
              <button className={s.delBtn}  onClick={e=>del(e,c._id)}>✕</button>
            </div>
          </div>
        ))}
      </div>

      <div className={s.btnRow}>
        <button className={s.newBtn} onClick={createNew} disabled={creating || importing}>
          {creating ? '…' : '+ Новий персонаж'}
        </button>
        <button className={s.importBtn} onClick={onImportClick} disabled={creating || importing}>
          {importing ? 'Імпорт…' : '⭳ Імпорт з Excel'}
        </button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls"
          style={{ display: 'none' }} onChange={onFileChosen} />
      </div>
    </div>
  )
}
