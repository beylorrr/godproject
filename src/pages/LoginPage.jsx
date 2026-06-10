import { useState, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { login, register, clearError, selAuth } from '../store/slices/authSlice'
import s from './LoginPage.module.css'

export default function LoginPage() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const isAuthed = useSelector(selAuth.isAuthed)
  const isGM     = useSelector(selAuth.isGM)
  const loading  = useSelector(selAuth.loading)
  const error    = useSelector(selAuth.error)

  const [tab,  setTab]  = useState('login')
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [role, setRole] = useState('player')
  const [gmCode, setGmCode] = useState('')

  useEffect(() => {
    if (isAuthed) navigate(isGM ? '/gm' : '/party-select', { replace: true })
  }, [isAuthed, isGM])

  const switchTab = t => { setTab(t); dispatch(clearError()); setUser(''); setPass(''); setGmCode('') }

  const submit = async e => {
    e.preventDefault()
    const u = user.trim()
    if (!u || !pass) return
    const action = tab === 'login' ? login : register
    const payload = tab === 'login'
      ? { username: u, password: pass }
      : { username: u, password: pass, role, ...(role === 'gm' ? { gmCode: gmCode.trim() } : {}) }
    await dispatch(action(payload))
  }

  return (
    <div className={s.page}>
      <div className={s.box}>
        <div className={s.corner} aria-hidden="true" />
        <div className={s.orn}>— ✦ —</div>
        <h1 className={s.title}>Лист Персонажа</h1>
        <div className={s.orn}>— ✦ —</div>

        <div className={s.tabs}>
          <button className={`${s.tab} ${tab==='login'?s.active:''}`}    onClick={() => switchTab('login')}>Вхід</button>
          <button className={`${s.tab} ${tab==='register'?s.active:''}`} onClick={() => switchTab('register')}>Реєстрація</button>
        </div>

        {error && <div className={s.err} role="alert">{error}</div>}

        <form onSubmit={submit} noValidate>
          <div className="field">
            <label>Логін</label>
            <input value={user} onChange={e => setUser(e.target.value)}
              placeholder="твій_логін" autoComplete="username" />
          </div>
          <div className="field">
            <label>Пароль</label>
            <input type="password" value={pass} onChange={e => setPass(e.target.value)}
              placeholder="••••••••"
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'} />
          </div>

          {tab === 'register' && (
            <div className={s.roleRow}>
              <span className={s.roleLabel}>Роль:</span>
              <button type="button"
                className={`${s.roleBtn} ${role==='player'?s.roleActive:''}`}
                onClick={() => setRole('player')}>
                Гравець
              </button>
              <button type="button"
                className={`${s.roleBtn} ${role==='gm'?s.roleActive:''}`}
                onClick={() => setRole('gm')}>
                Майстер
              </button>
            </div>
          )}

          {tab === 'register' && role === 'gm' && (
            <div className="field">
              <label>Код Майстра</label>
              <input type="password" value={gmCode} onChange={e => setGmCode(e.target.value)}
                placeholder="секретний код" autoComplete="off" />
            </div>
          )}

          <button className={s.btn} type="submit" disabled={loading}>
            {loading
              ? <span className={s.spin} />
              : tab === 'login' ? 'Увійти' : 'Створити акаунт'}
          </button>
        </form>
      </div>
    </div>
  )
}
