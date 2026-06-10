/**
 * TransferPanel — передача грошей або предмету іншому гравцю пачки.
 * Використовується в TabGeneral (гроші) і TabInventory (предмет).
 * mode: 'money' | 'item'
 * itemRow: [name, qty, weight, total, note] — якщо mode='item'
 * listId: string — звідки брати предмет
 */
import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  fetchParties, fetchJoinedPartyMembers, transferToMember, selGm,
} from '../../store/slices/gmSlice'
import { selAuth } from '../../store/slices/authSlice'

export default function TransferPanel({ mode = 'money', itemRow, rowId, listId, onClose }) {
  const dispatch = useDispatch()
  const parties  = useSelector(selGm.parties)
  const members  = useSelector(selGm.joinedPartyMembers)
  const userId   = useSelector(selAuth.userId)

  const joinedParty = parties.find(p => p.joined)

  const [toUserId, setToUserId] = useState('')
  const [gold,   setGold]   = useState('')
  const [silver, setSilver] = useState('')
  const [copper, setCopper] = useState('')
  const [sending, setSending] = useState(false)
  const [err,    setErr]    = useState('')

  useEffect(() => {
    if (!parties.length) dispatch(fetchParties())
  }, [])

  useEffect(() => {
    if (joinedParty?.id) dispatch(fetchJoinedPartyMembers(joinedParty.id))
  }, [joinedParty?.id])

  const otherMembers = members.filter(m => m.userId !== userId)

  const handleSend = async () => {
    if (!toUserId) { setErr('Оберіть гравця'); return }
    if (!joinedParty) { setErr('Ви не в пачці'); return }
    if (mode === 'money' && !gold && !silver && !copper) { setErr('Вкажіть суму'); return }

    setSending(true); setErr('')
    try {
      const payload = {
        partyId: joinedParty.id,
        toUserId: Number(toUserId),
        type: mode,
        ...(mode === 'money'
          ? { gold: parseInt(gold)||0, silver: parseInt(silver)||0, copper: parseInt(copper)||0 }
          : { rowId, listId }
        ),
      }
      const res = await dispatch(transferToMember(payload))
      if (res.meta.requestStatus === 'fulfilled') {
        onClose?.()
      } else {
        setErr(res.payload || 'Помилка передачі')
      }
    } catch (e) {
      setErr(e.message || 'Помилка')
    } finally {
      setSending(false)
    }
  }

  if (!joinedParty) return (
    <div style={{ fontSize: '.82rem', color: 'var(--muted)', padding: '8px 0' }}>
      Ви не в пачці — передача недоступна
    </div>
  )

  const inl = { display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 10 }

  return (
    <div style={{
      background: 'var(--s2)', border: '1px solid var(--br2)',
      borderRadius: 8, padding: '14px 16px', marginTop: 10,
    }}>
      <div style={{
        fontFamily: "'Cinzel',serif", fontSize: '.72rem', fontWeight: 700,
        letterSpacing: '.1em', textTransform: 'uppercase',
        color: 'var(--gold2)', marginBottom: 10,
      }}>
        {mode === 'money' ? 'Передати гроші' : `Передати «${itemRow?.name || '…'}»`}
      </div>

      {/* Вибір отримувача — картки у стилі сайту */}
      <div className="field">
        <label>Кому передати</label>
        {otherMembers.length === 0 ? (
          <div style={{ fontSize: '.8rem', color: 'var(--muted)', padding: '6px 0' }}>
            У вашій пачці більше нікого немає
          </div>
        ) : (
          <div className="transfer-picks">
            {otherMembers.map(m => (
              <button key={m.userId} type="button"
                className={`transfer-pick ${Number(toUserId) === m.userId ? 'transfer-pick--on' : ''}`}
                onClick={() => setToUserId(String(m.userId))}>
                <span className="transfer-pick-name">
                  {m.username}{m.sheetData?.name_known ? ` — ${m.sheetData.name_known}` : ''}
                </span>
                {Number(toUserId) === m.userId && <span className="transfer-pick-check">✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {mode === 'money' && (
        <div style={inl}>
          <div className="field" style={{ minWidth: 75 }}>
            <label style={{ color: '#f5c84a' }}>Золото</label>
            <input type="number" className="inv-input" min={0}
              value={gold} onChange={e => setGold(e.target.value)}
              style={{ width: 75 }} placeholder="0"/>
          </div>
          <div className="field" style={{ minWidth: 75 }}>
            <label style={{ color: '#c8c8c8' }}>🥈 Срібло</label>
            <input type="number" className="inv-input" min={0}
              value={silver} onChange={e => setSilver(e.target.value)}
              style={{ width: 75 }} placeholder="0"/>
          </div>
          <div className="field" style={{ minWidth: 75 }}>
            <label style={{ color: '#c07830' }}>🥉 Мідь</label>
            <input type="number" className="inv-input" min={0}
              value={copper} onChange={e => setCopper(e.target.value)}
              style={{ width: 75 }} placeholder="0"/>
          </div>
        </div>
      )}

      {err && (
        <div style={{ color: 'var(--ember2)', fontSize: '.8rem', marginTop: 6 }}>{err}</div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button
          onClick={handleSend}
          disabled={sending || !toUserId}
          style={{
            fontFamily: "'Cinzel',serif", fontSize: '.68rem', fontWeight: 700,
            letterSpacing: '.08em', textTransform: 'uppercase',
            background: 'linear-gradient(135deg,rgba(245,200,74,.15),rgba(232,168,48,.08))',
            border: '1px solid var(--gold4)', borderRadius: 6,
            color: 'var(--gold2)', padding: '8px 18px', cursor: 'pointer',
            opacity: sending ? .6 : 1, transition: 'all .15s',
          }}>
          {sending ? '…' : '► Передати'}
        </button>
        {onClose && (
          <button onClick={onClose} style={{
            fontFamily: "'Cinzel',serif", fontSize: '.66rem',
            background: 'transparent', border: '1px solid var(--br)',
            borderRadius: 6, color: 'var(--muted)', padding: '8px 14px', cursor: 'pointer',
          }}>Скасувати</button>
        )}
      </div>
    </div>
  )
}
