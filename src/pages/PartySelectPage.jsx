import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { fetchParties, joinParty, selGm } from '../store/slices/gmSlice'
import { fetchCharacters, selSheet } from '../store/slices/sheetSlice'
import { logout, selAuth } from '../store/slices/authSlice'
import s from './PartySelectPage.module.css'

export default function PartySelectPage() {
  const dispatch  = useDispatch()
  const navigate  = useNavigate()
  const parties   = useSelector(selGm.parties)
  const loading   = useSelector(selGm.loading)
  const chars     = useSelector(selSheet.characters)
  const username  = useSelector(selAuth.username)
  const [selectedChar, setSelectedChar] = useState(null)
  const [joining, setJoining] = useState(null)

  useEffect(() => {
    dispatch(fetchParties())
    dispatch(fetchCharacters())
  }, [])

  // Авто-вибираємо активного персонажа
  useEffect(() => {
    const active = chars.find(c => c.isActive)
    if (active && !selectedChar) setSelectedChar(Number(active._id))
  }, [chars])

  const handleJoin = async party => {
    if (!selectedChar) { alert('Спочатку оберіть персонажа'); return }
    const ok = chars.some(c => Number(c._id) === Number(selectedChar))
    if (!ok) { alert('Список персонажів ще завантажується, спробуйте за мить'); return }
    setJoining(party.id)
    try {
      await dispatch(joinParty({ partyId: party.id, charId: selectedChar })).unwrap()
      // Після вибору пачки — до персонажа
      navigate('/characters')
    } catch(e) {
      alert(typeof e === 'string' ? e : (e?.message || 'Не вдалося приєднатись'))
    } finally {
      setJoining(null)
    }
  }

  return (
    <div className={s.page}>
      <div className={s.topbar}>
        <h1 className={s.title}>Оберіть пачку</h1>
        <div style={{ display:'flex', gap:10, alignItems:'center' }}>
          <span className={s.username}>{username}</span>
          <button className={s.logoutBtn} onClick={() => dispatch(logout())}>Вийти</button>
          <button className={s.skipBtn}   onClick={() => navigate('/characters')}>
            Без пачки →
          </button>
        </div>
      </div>

      {/* Вибір персонажа */}
      {loading && <div className={s.hint}>Завантаження пачок…</div>}

      {!loading && parties.length === 0 && (
        <div className={s.empty}>
          Немає активних пачок.<br/>
          <small>Зверніться до Майстра щоб створити пачку.</small>
        </div>
      )}

      <div className={s.list}>
        {parties.map(party => (
          <div key={party.id} className={`${s.card} ${party.joined ? s.joined : ''}`}>
            <div className={s.cardLeft}>
              <div className={s.partyName}>{party.name}</div>
              <div className={s.partyMeta}>
                GM: {party.gm_name} · {party.member_count || 0} гравців
              </div>
              {party.description && (
                <div className={s.partyDesc}>{party.description}</div>
              )}
            </div>
            <div className={s.cardRight}>
              {party.joined
                ? <button className={s.activeBtn} onClick={() => navigate('/characters')}>
                    ✓ В пачці
                  </button>
                : <button className={s.joinBtn}
                    disabled={!selectedChar || joining === party.id}
                    onClick={() => handleJoin(party)}>
                    {joining === party.id ? '…' : 'Приєднатись'}
                  </button>
              }
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
