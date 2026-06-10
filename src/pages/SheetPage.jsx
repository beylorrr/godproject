import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { setActiveTab, selSheet, loadCharacter } from '../store/slices/sheetSlice'
import { logout, selAuth } from '../store/slices/authSlice'
import { fetchParties } from '../store/slices/gmSlice'
import { useAutoSave } from '../hooks/useAutoSave'
import { PlayerSheetProvider } from '../context/SheetDataContext'
import SaveIndicator  from '../components/ui/SaveIndicator'
import SkillTooltip   from '../components/ui/SkillTooltip'
import DiceRoller     from '../components/ui/DiceRoller'
import TabGeneral    from '../components/tabs/TabGeneral'
import TabStats      from '../components/tabs/TabStats'
import TabSkills     from '../components/tabs/TabSkills'
import TabCombat     from '../components/tabs/TabCombat'
import TabInventory  from '../components/tabs/TabInventory'
import TabKnowledge from '../components/tabs/TabKnowledge'
import TabSpells     from '../components/tabs/TabSpells'
import s from './SheetPage.module.css'
import { ScrollText, Heart, Target, Shield, Backpack, Flame, BookOpen } from 'lucide-react'

const TABS = [
  { id:'general',   label:'Загальне',       Icon: ScrollText },
  { id:'stats',     label:'Характеристики', Icon: Heart      },
  { id:'skills',    label:'Вміння',         Icon: Target     },
  { id:'combat',    label:'Екіпірування',   Icon: Shield     },
  { id:'inventory', label:'Інвентар',       Icon: Backpack   },
  { id:'spells',    label:'Закляття',       Icon: Flame      },
  { id:'knowledge', label:'Знання',         Icon: BookOpen   },
]

export default function SheetPage() {
  const dispatch   = useDispatch()
  const navigate   = useNavigate()
  const activeId   = useSelector(selSheet.activeCharId)
  const activeTab  = useSelector(selSheet.activeTab)
  const loading    = useSelector(selSheet.loadingChar)
  const d          = useSelector(selSheet.data)
  const username   = useSelector(selAuth.username)
  const saveStatus = useAutoSave()

  // Якщо немає активного персонажа — повертаємось на вибір
  useEffect(() => {
    if (activeId == null) navigate('/characters')
  }, [activeId])

  // Завантажуємо лист при вході
  useEffect(() => {
    if (activeId != null) dispatch(loadCharacter(activeId))
  }, [activeId])

  // Завантажуємо пачки для TransferPanel
  useEffect(() => { dispatch(fetchParties()) }, [])

  // Поки немає activeId — нічого не рендеримо (уникаємо пустого екрану)
  if (activeId == null) return null

  return (
    <PlayerSheetProvider>
      <div className={s.page}>
        {/* Топ-бар */}
        <div className={s.topbar}>
          <div className={s.charName}>
            {d.name_known || 'Персонаж'} · Рів.{d.level || 1}
          </div>
          <div className={s.topRight}>
            <SaveIndicator status={saveStatus}/>
            <button className={s.btn} onClick={() => navigate('/characters')}>Персонажі</button>
            <span className={s.user}>{username}</span>
            <button className={s.btn} onClick={() => dispatch(logout())} style={{color:'var(--muted)'}}>Вийти</button>
          </div>
        </div>

        {/* Вкладки */}
        <div className={s.tabNav}>
          {TABS.map(t => (
            <button key={t.id}
              className={`${s.tabBtn} ${activeTab === t.id ? s.active : ''}`}
              onClick={() => dispatch(setActiveTab(t.id))}>
              <t.Icon size={15} strokeWidth={1.8} className={s.tabIcon} aria-hidden />
              {t.label}
            </button>
          ))}
        </div>

        {/* Контент — завжди всередині PlayerSheetProvider */}
        <div className={`${s.content} ${activeTab === 'skills' ? s.contentWide : ''}`}>
          {loading
            ? <div style={{padding:'40px',textAlign:'center',color:'var(--muted)'}}>Завантаження…</div>
            : <SheetTabContent activeTab={activeTab}/>
          }
        </div>

        {/* Мобільний bottom nav */}
        <div className={s.mobileNav}>
          {TABS.map(t => (
            <button key={t.id}
              className={`${s.mobileBtn} ${activeTab === t.id ? s.mobileActive : ''}`}
              onClick={() => { dispatch(setActiveTab(t.id)); window.scrollTo({top:0,behavior:'smooth'}) }}>
              <t.Icon size={19} strokeWidth={1.8} aria-hidden />
              <span className={s.mobileLbl}>{t.label}</span>
            </button>
          ))}
        </div>

        <SkillTooltip/>
        <DiceRoller/>
      </div>
    </PlayerSheetProvider>
  )
}

// Окремий компонент — всередині PlayerSheetProvider, тому useSheetData() працює
function SheetTabContent({ activeTab }) {
  const map = {
    general:   <TabGeneral/>,
    stats:     <TabStats/>,
    skills:    <TabSkills/>,
    combat:    <TabCombat readOnly/>,
    inventory: <TabInventory/>,
    spells:    <TabSpells/>,
    knowledge: <TabKnowledge/>,
  }
  return <div key={activeTab}>{map[activeTab] || map.general}</div>
}
