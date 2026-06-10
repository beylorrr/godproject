import { useEffect, useRef, useState } from 'react'
import { SKILL_DESCRIPTIONS } from '../../data/gameData'

/**
 * Глобальний тултіп вмінь.
 * Показується при hover на .skill-row-name (десктоп)
 * або при кліку (мобайл). Повторний клік — закрити.
 */
export default function SkillTooltip() {
  const tipRef = useRef(null)
  const [tip, setTip] = useState({ visible:false, text:'', x:0, y:0 })
  const pinnedRef = useRef(null)  // зафіксована назва (клік)

  useEffect(() => {
    const show = (skillName, x, y) => {
      const desc = SKILL_DESCRIPTIONS?.[skillName] || ''
      if (!desc) return
      setTip({ visible:true, text:desc, x, y })
    }

    const hide = () => { setTip(t=>({...t,visible:false})); pinnedRef.current=null }

    const onOver = e => {
      if (pinnedRef.current) return
      const el = e.target.closest?.('.skill-row-name')
      if (!el) { setTip(t=>({...t,visible:false})); return }
      show(el.dataset.skill, e.clientX, e.clientY)
    }

    const onMove = e => {
      if (!tip.visible || pinnedRef.current) return
      const el = e.target.closest?.('.skill-row-name')
      if (!el) { setTip(t=>({...t,visible:false})); return }
      setTip(t=>({...t, x:e.clientX, y:e.clientY}))
    }

    const onClick = e => {
      const el = e.target.closest?.('.skill-row-name')
      if (!el) { if (pinnedRef.current) hide(); return }
      const name = el.dataset.skill
      if (pinnedRef.current === name) { hide(); return }
      pinnedRef.current = name
      show(name, e.clientX, e.clientY)
    }

    document.addEventListener('mouseover', onOver)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('click', onClick)
    return () => {
      document.removeEventListener('mouseover', onOver)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('click', onClick)
    }
  }, [tip.visible])

  if (!tip.visible) return null

  const TW = 280, TH = 80
  const left = tip.x+14+TW > window.innerWidth  ? tip.x-TW-10 : tip.x+14
  const top  = tip.y-10+TH > window.innerHeight ? tip.y-TH-6  : tip.y-10

  return (
    <div
      ref={tipRef}
      className="skill-tooltip-global"
      style={{ left, top }}
    >
      {tip.text}
    </div>
  )
}
