/**
 * useSSE.js — підключається до GET /api/events і патчить Redux у реальному часі.
 *
 * Слухаємо подію 'sheet_update':
 *   { charId, patches: { 'res-cur-hp': '75', level: '2', ... }, action, note, leveledUp, ts }
 *
 * Якщо charId збігається з активним персонажем — застосовуємо patches одразу в store.
 * Якщо ні (інший слот) — ігноруємо (гравець сам оновиться при наступному вході).
 */
import { useEffect, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { selAuth } from '../store/slices/authSlice'
import { selSheet, applyServerPatch, applyCollectionOp } from '../store/slices/sheetSlice'
import { fetchParty, patchMemberSheet, selGm } from '../store/slices/gmSlice'

const API = import.meta.env.VITE_API_URL ?? ''

export function useSSE() {
  const dispatch    = useDispatch()
  const token       = useSelector(selAuth.token)
  const role        = useSelector(selAuth.role)
  const activeId    = useSelector(selSheet.activeCharId)
  const activePartyId = useSelector(selGm.activePartyId)
  const esRef       = useRef(null)
  const activeIdRef = useRef(activeId)
  const partyIdRef  = useRef(activePartyId)
  const roleRef     = useRef(role)

  useEffect(() => { activeIdRef.current = activeId }, [activeId])
  useEffect(() => { partyIdRef.current = activePartyId }, [activePartyId])
  useEffect(() => { roleRef.current = role }, [role])

  useEffect(() => {
    if (!token) return

    const url = `${API}/api/events?token=${encodeURIComponent(token)}`
    const es  = new EventSource(url)
    esRef.current = es

    // ── Гравець: живий патч листа ───────────────────
    es.addEventListener('sheet_update', e => {
      try {
        const payload = JSON.parse(e.data)
        if (payload.charId !== activeIdRef.current) return
        dispatch(applyServerPatch(payload.patches))

        const note = payload.note ? ` (${payload.note})` : ''
        if (payload.leveledUp) {
          showToast(`🎉 Рівень підвищено до ${payload.newLevel}! +8 вмінь, +6 хар-к${note}`)
        } else if (payload.action === 'damage') {
          showToast(`⚔️ GM завдав урон: −${payload.amount} ${(payload.resource||'hp').toUpperCase()}${note}`)
        } else if (payload.action === 'heal') {
          showToast(`💚 GM зцілив: +${payload.amount} ${(payload.resource||'hp').toUpperCase()}${note}`)
        } else if (payload.action === 'xp') {
          showToast(`✨ GM дав +${payload.amount} XP${note}`)
        } else if (payload.action === 'award_pts') {
          showToast(`📖 GM нарахував очки${note}`)
        }
      } catch (err) {
        console.warn('[SSE] sheet_update parse error', err)
      }
    })

    // ── Гравець: операція над колекцією (від GM або передачі) ──
    es.addEventListener('collection_op', e => {
      try {
        const payload = JSON.parse(e.data)
        if (String(payload.charId) !== String(activeIdRef.current)) return
        dispatch(applyCollectionOp(payload.op))
      } catch {}
    })

    // ── Гравець: передача грошей/предметів ───────────────
    es.addEventListener('transfer_done', e => {
      try {
        const payload = JSON.parse(e.data)
        // Інвентар/гроші оновлюються окремими подіями (collection_op/sheet_update).
        // Тут лише тост-нотифікація.
        const moneyStr = `${payload.gold>0?payload.gold+'з ':''}${payload.silver>0?payload.silver+'с ':''}${payload.copper>0?payload.copper+'м':''}`.trim()
        if (payload.direction === 'sent') {
          const what = payload.type === 'money'
            ? `💰 Передано ${moneyStr} → ${payload.toUsername}`
            : `Передано «${payload.itemName}» → ${payload.toUsername}`
          showToast(what)
        } else {
          const what = payload.type === 'money'
            ? `💰 Отримано ${moneyStr} від ${payload.fromUsername}`
            : `Отримано «${payload.itemName}» від ${payload.fromUsername}`
          showToast(what)
        }
      } catch {}
    })
    es.addEventListener('player_sheet_update', e => {
      if (roleRef.current !== 'gm' && roleRef.current !== 'admin') return
      try {
        const payload = JSON.parse(e.data)
        dispatch(patchMemberSheet({ charId: payload.charId, sheetData: payload.sheetData }))
      } catch {}
    })

    // ── GM: оновлення активної пачки після GM-дії ──────
    es.addEventListener('gm_action_done', () => {
      if ((roleRef.current === 'gm' || roleRef.current === 'admin') && partyIdRef.current) {
        dispatch(fetchParty(partyIdRef.current))
      }
    })

    // ── Кидок кубиків у пачці ──────
    es.addEventListener('dice_roll', e => {
      try {
        const payload = JSON.parse(e.data)
        // Передаємо у вікно кубиків (якщо відкрите — додасть у лог)
        const handled = window.__diceRollerOpen
        window.dispatchEvent(new CustomEvent('dice_roll', { detail: payload }))
        // Якщо вікно кубиків закрите — показуємо тост (довго, щоб встигли побачити)
        if (!handled) {
          const mod = payload.modifier
            ? (payload.modifier > 0 ? ` + ${payload.modifier}` : ` − ${Math.abs(payload.modifier)}`)
            : ''
          const dice = `${payload.count}d${payload.sides}${mod}`
          showToast(`🎲 ${payload.charName} кинув ${dice} → ${payload.total}`, 9000)
        }
      } catch {}
    })

    es.onerror = () => { /* браузер сам перепідключиться */ }

    return () => { es.close(); esRef.current = null }
  }, [token])
}

// ── Простий toast (без бібліотек) ───────────────────
let toastEl = null

function showToast(msg, duration = 7000) {
  if (!toastEl) {
    toastEl = document.createElement('div')
    Object.assign(toastEl.style, {
      position: 'fixed', bottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
      left: '50%', transform: 'translateX(-50%)',
      background: 'linear-gradient(165deg, #1f1810, #14100a)',
      color: '#f5c84a', border: '1px solid rgba(245,200,74,.4)',
      padding: '12px 24px', borderRadius: '10px', fontFamily: "'Cinzel', serif",
      fontSize: '0.92rem', letterSpacing: '.04em', fontWeight: '700',
      zIndex: '9999', cursor: 'pointer',
      transition: 'opacity .35s, transform .35s',
      boxShadow: '0 8px 32px rgba(0,0,0,.65), 0 0 20px rgba(245,200,74,.15)',
      maxWidth: '90vw', textAlign: 'center',
    })
    // Тап по сповіщенню — закрити одразу
    toastEl.addEventListener('click', () => {
      toastEl.style.opacity = '0'
      toastEl.style.transform = 'translateX(-50%) translateY(10px)'
      clearTimeout(toastEl._t)
    })
    document.body.appendChild(toastEl)
  }
  toastEl.textContent = msg
  toastEl.style.opacity = '1'
  toastEl.style.transform = 'translateX(-50%) translateY(0)'
  clearTimeout(toastEl._t)
  toastEl._t = setTimeout(() => {
    toastEl.style.opacity = '0'
    toastEl.style.transform = 'translateX(-50%) translateY(10px)'
  }, duration)
}
