import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { fetchItems, createItem, updateItem, deleteItem, fetchPlayers, giveItemToPlayer, giveSpellToPlayer, selGm } from '../../store/slices/gmSlice'
import { SPELL_SCHOOLS, ABILITY_SCHOOLS } from '../../data/gameData'
import { Eye, EyeOff, Layers, Shield, Swords, Flame, Sparkles, Package, Plus, X } from 'lucide-react'
import SectionTitle from '../../components/ui/SectionTitle'
import s from './GM.module.css'

const TYPES = [
  { id:'',       label:'Всі',       Icon: Layers   },
  { id:'armor',  label:'Броня',     Icon: Shield   },
  { id:'weapon', label:'Зброя',     Icon: Swords   },
  { id:'spell',  label:'Заклин.',   Icon: Flame    },
  { id:'ability',label:'Здібності', Icon: Sparkles },
  { id:'other',  label:'Інше',      Icon: Package  },
]


// Базові предмет/закляття. Ефекти й покращення — масиви, рядок з'являється лише по «+».
const EMPTY_ITEM = {
  type:'other', name:'', isMagic:false, isCursed:false, isBlessed:false,
  weightPerOne:0, weight:0, amount:1,
  physicalDamage:0, magicalDamage:0, physicalResistance:0, magicalResistance:0,
  description:'',
  effects:[],   // [{ text, isHidden }]
}
const EMPTY_SPELL = {
  type:'spell', name:'', school:'', level:1,
  timeToCast:'', manaCost:0, enduranceCost:0, coolDown:'',
  radiusCast:0, attackType:'', power:0, description:'',
  upgrades:[],  // [string]
}

// Міграція старого плоского формату (effect1..5 / upgrade2..5) у масиви
function normalizeItemData(d = {}) {
  if (Array.isArray(d.effects)) return d
  const effects = []
  for (let n = 1; n <= 5; n++) {
    const t = d[`effect${n}`]
    if (t && String(t).trim()) effects.push({ text:String(t), isHidden:!!d[`effect${n}IsHidden`] })
  }
  const clean = { ...d }
  for (let n = 1; n <= 5; n++) { delete clean[`effect${n}`]; delete clean[`effect${n}IsHidden`] }
  return { ...clean, effects }
}
function normalizeSpellData(d = {}) {
  if (Array.isArray(d.upgrades)) return d
  const upgrades = []
  for (let n = 2; n <= 5; n++) {
    const t = d[`upgrade${n}`]
    if (t && String(t).trim()) upgrades.push(String(t))
  }
  const clean = { ...d }
  for (let n = 2; n <= 5; n++) delete clean[`upgrade${n}`]
  return { ...clean, upgrades }
}

// Групує гравців за пачками для модалки видачі (замість суцільного списку)
function groupByParty(players) {
  const groups = {}
  for (const p of players) {
    const key = p.partyId ? `p${p.partyId}` : 'none'
    if (!groups[key]) groups[key] = { key, title: p.partyName || 'Без пачки', players: [] }
    groups[key].players.push(p)
  }
  // Спершу пачки, «Без пачки» — в кінець
  return Object.values(groups).sort((a, b) =>
    a.key === 'none' ? 1 : b.key === 'none' ? -1 : a.title.localeCompare(b.title))
}

export default function GMItems() {
  const dispatch = useDispatch()
  const items    = useSelector(selGm.items)
  const loading  = useSelector(selGm.loading)
  const [filter,  setFilter]  = useState('')
  const [search,  setSearch]  = useState('')
  const [showForm,setShowForm]= useState(false)
  const [formType,setFormType]= useState('item')
  const [form,    setForm]    = useState(EMPTY_ITEM)
  const [giveItem, setGiveItem] = useState(null)   // предмет, який видаємо
  const [giveDone, setGiveDone] = useState('')      // повідомлення про успішну видачу
  const players = useSelector(selGm.players)
  useEffect(() => { dispatch(fetchPlayers()) }, [])
  const [editing, setEditing] = useState(null)

  useEffect(() => { dispatch(fetchItems(filter||undefined)) }, [filter])

  const filtered = items.filter(i =>
    (!filter || i.type === filter) &&
    (!search || i.name.toLowerCase().includes(search.toLowerCase()) ||
      (i.description||'').toLowerCase().includes(search.toLowerCase()))
  )

  const set = (k,v) => setForm(f => ({...f,[k]:v}))

  const openNew = (type) => {
    setFormType(type==='spell'||type==='ability'?'spell':'item')
    setForm(type==='spell'||type==='ability'?{...EMPTY_SPELL,type}:{...EMPTY_ITEM,type})
    setEditing(null); setShowForm(true)
  }

  const startEdit = item => {
    const isSpell = item.type==='spell'||item.type==='ability'
    const d = isSpell ? normalizeSpellData(item.data||{}) : normalizeItemData(item.data||{})
    setFormType(isSpell?'spell':'item')
    setForm({type:item.type,name:item.name,description:item.description||'',...d})
    setEditing(item.id); setShowForm(true)
  }

  const saveItem = async () => {
    if (!form.name.trim()) return
    const {type,name,description,...rest} = form
    if (Array.isArray(rest.effects))  rest.effects  = rest.effects.filter(e => e && String(e.text||'').trim())
    if (Array.isArray(rest.upgrades)) rest.upgrades = rest.upgrades.filter(u => String(u||'').trim())
    // Авто-вага: загальна = кількість × вага за штуку
    rest.weight = +(((parseFloat(rest.amount)||0) * (parseFloat(rest.weightPerOne)||0)).toFixed(2))
    const payload = {type,name,description,data:rest}
    if (editing) { await dispatch(updateItem({id:editing,...payload})); setEditing(null) }
    else          { await dispatch(createItem(payload)) }
    setShowForm(false)
  }

  return (
    <div>
      <h2 className={s.pageTitle}>База знань</h2>

      <div className={s.filterRow}>
        {TYPES.map(t=>(
          <button key={t.id} className={`${s.filterBtn} ${filter===t.id?s.filterActive:''}`}
            onClick={()=>setFilter(t.id)}>
            <t.Icon size={12} strokeWidth={1.8} style={{ verticalAlign: '-2px', marginRight: 5, opacity: filter===t.id ? 1 : .6 }} aria-hidden />
            {t.label}</button>
        ))}
        <input className={s.searchInput} placeholder="Пошук…"
          value={search} onChange={e=>setSearch(e.target.value)}/>
      </div>
      <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}}>
        <button className={s.primaryBtn} onClick={()=>openNew('other')}><Plus size={13} aria-hidden /> Предмет</button>
        <button className={s.primaryBtn} onClick={()=>openNew('spell')}><Flame size={13} aria-hidden /> Закляття</button>
        <button className={s.primaryBtn} onClick={()=>openNew('ability')}><Sparkles size={13} aria-hidden /> Здібність</button>
        {showForm&&<button className={s.ghostBtn} onClick={()=>setShowForm(false)}><X size={13} aria-hidden /> Скасувати</button>}
        {giveDone && (
          <span style={{fontFamily:"'Cinzel',serif",fontSize:'.68rem',color:'#7fc77f',
            border:'1px solid #3a5a3a',borderRadius:4,padding:'6px 12px',
            textShadow:'0 0 8px rgba(127,199,127,.3)'}}>
            ✓ {giveDone}
          </span>
        )}
      </div>

      {showForm && (
        <div className={s.card}>
          <SectionTitle>{editing?'Редагувати':'Новий запис'}</SectionTitle>
          {formType==='item' ? <ItemForm form={form} set={set}/> : <SpellForm form={form} set={set}/>}
          <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:12}}>
            <button className={s.ghostBtn} onClick={()=>setShowForm(false)}>Скасувати</button>
            <button className={s.primaryBtn} onClick={saveItem} disabled={!form.name.trim()}>
              {editing?'Зберегти':'Додати'}
            </button>
          </div>
        </div>
      )}

      {loading && <div className={s.hint}>Завантаження…</div>}
      {!loading && filtered.length===0 && <div className={s.empty}>База порожня.</div>}
      <div className={s.itemList}>
        {filtered.map(item=>(
          <ItemCard key={item.id} item={item}
            onEdit={()=>startEdit(item)}
            onGive={()=>setGiveItem(item)}
            onDelete={()=>window.confirm('Видалити?')&&dispatch(deleteItem(item.id))}/>
        ))}
      </div>

      {giveItem && (
        <div className="equip-overlay" onClick={()=>setGiveItem(null)}>
          <div className="equip-modal" onClick={e=>e.stopPropagation()}>
            <div className="equip-modal-head">
              <span className="equip-modal-title">Видати «{giveItem.name}» гравцю</span>
              <button className="equip-modal-close" onClick={()=>setGiveItem(null)}>✕</button>
            </div>
            {players.length===0 ? (
              <div className="equip-modal-empty">Немає гравців.</div>
            ) : (
              <div className="equip-modal-list">
                {groupByParty(players).map(group => (
                  <div key={group.key} className="picker-group">
                    <div className="picker-group-title">{group.title}</div>
                    {group.players.map(p=>(
                      <button key={p.userId} className="equip-pick" disabled={!p.charId}
                        onClick={()=>{
                          const isSpellLike = giveItem.type==='spell' || giveItem.type==='ability'
                          if (isSpellLike) {
                            // Закляття/здібність → вкладка гравця "Закляття та здатності"
                            const gd = giveItem.data || {}
                            const ups = Array.isArray(gd.upgrades) ? gd.upgrades.filter(Boolean) : []
                            const descParts = [giveItem.description || gd.description || '']
                            if (gd.attackType) descParts.push(`Тип атаки: ${gd.attackType}`)
                            if (gd.timeToCast) descParts.push(`Час касту: ${gd.timeToCast}`)
                            ups.forEach((u,n)=>descParts.push(`Рів.${n+2}: ${u}`))
                            dispatch(giveSpellToPlayer({charId:p.charId, spell:{
                              name:   giveItem.name || '',
                              school: gd.school || (giveItem.type==='ability' ? 'Здібність' : ''),
                              od:     gd.timeToCast || '',
                              om:     String(gd.manaCost ?? ''),
                              vs:     String(gd.enduranceCost ?? ''),
                              cd:     gd.coolDown || '',
                              range:  String(gd.radiusCast ?? ''),
                              damage: String(gd.power ?? ''),
                              desc:   descParts.filter(Boolean).join('\n'),
                            }}))
                          } else {
                            dispatch(giveItemToPlayer({charId:p.charId, item:{...giveItem.data, type:giveItem.type, name:giveItem.name, description:giveItem.description}}))
                          }
                          setGiveDone(`Видано «${giveItem.name}» гравцю ${p.username}`)
                          setTimeout(() => setGiveDone(''), 3000)
                          setGiveItem(null)
                        }}>
                        <span className="equip-pick-name">{p.username}{p.sheet?.name_known?` — ${p.sheet.name_known}`:''}{!p.charId && ' (немає персонажа)'}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Fld({label,children,style}) {
  return <div className="field" style={style}><label>{label}</label>{children}</div>
}
function Inp({form,set,k,type='text',placeholder,w}) {
  const isNum = type === 'number'
  // Під час редагування не примусовуємо 0: порожнє лишається порожнім, на blur → 0.
  return <input type={type} className="inv-input" placeholder={placeholder||''}
    value={form[k]??''}
    onChange={e=>{
      const v = e.target.value
      set(k, isNum ? (v === '' ? '' : (parseFloat(v) ?? '')) : v)
    }}
    onFocus={e=>{ if (isNum && (form[k]===0 || form[k]==='0')) e.target.select() }}
    onBlur={()=>{ if (isNum && (form[k]==='' || form[k]==null)) set(k, 0) }}
    style={{width:w}}/>
}
function Chk({form,set,k,label}) {
  return <label style={{display:'flex',alignItems:'center',gap:5,cursor:'pointer',
    fontFamily:"'Cinzel',serif",fontSize:'.66rem',color:'var(--muted)',letterSpacing:'.05em',whiteSpace:'nowrap'}}>
    <input type="checkbox" checked={!!form[k]} onChange={e=>set(k,e.target.checked)}/> {label}
  </label>
}

function ItemForm({form,set}) {
  const row = {display:'flex',gap:8,flexWrap:'wrap',alignItems:'flex-end',marginBottom:8}
  const effects = Array.isArray(form.effects) ? form.effects : []
  const addEffect    = () => set('effects', [...effects, { text:'', isHidden:false }])
  const updateEffect = (i, text) => set('effects', effects.map((e,idx)=>idx===i?{...e,text}:e))
  const toggleHidden = (i) => set('effects', effects.map((e,idx)=>idx===i?{...e,isHidden:!e.isHidden}:e))
  const removeEffect = (i) => set('effects', effects.filter((_,idx)=>idx!==i))

  return (
    <div>
      <div style={row}>
        <Fld label="Назва" style={{flex:1,minWidth:200}}>
          <Inp form={form} set={set} k="name" placeholder="Назва предмету…"/>
        </Fld>
        <Fld label="Тип">
          <select className="inv-input" value={form.type||'other'} onChange={e=>set('type',e.target.value)}>
            <option value="armor">Броня/одяг</option>
            <option value="weapon">Зброя</option>
            <option value="other">Інше</option>
          </select>
        </Fld>
      </div>
      <div style={row}>
        <Fld label="Вага/шт"><Inp form={form} set={set} k="weightPerOne" type="number" w={70}/></Fld>
        <Fld label="Заг.вага">
          <input type="number" className="inv-input" w={70} readOnly
            style={{width:70,opacity:.7,cursor:'default'}}
            value={((parseFloat(form.amount)||0)*(parseFloat(form.weightPerOne)||0)).toFixed(2)}/>
        </Fld>
        <Fld label="К-сть">   <Inp form={form} set={set} k="amount"     type="number" w={70}/></Fld>
        <Fld label="Фіз.шкода"><Inp form={form} set={set} k="physicalDamage"    type="number" w={70}/></Fld>
        <Fld label="Маг.шкода"><Inp form={form} set={set} k="magicalDamage"     type="number" w={70}/></Fld>
        <Fld label="Фіз.захист"><Inp form={form} set={set} k="physicalResistance" type="number" w={70}/></Fld>
        <Fld label="Маг.захист"><Inp form={form} set={set} k="magicalResistance"  type="number" w={70}/></Fld>
      </div>
      <Fld label="Опис">
        <textarea className="inv-input" rows={2}
          style={{width:'100%',resize:'vertical',textAlign:'left'}}
          placeholder="Опис предмету…"
          value={form.description||''} onChange={e=>set('description',e.target.value)}/>
      </Fld>

      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:6}}>
        <SectionTitle>Ефекти</SectionTitle>
        <button type="button" className={s.miniBtn} onClick={addEffect}>+ Ефект</button>
      </div>
      {effects.length===0 && (
        <div className={s.hint} style={{marginTop:4}}>Ефектів нема. Натисни «+ Ефект» щоб додати.</div>
      )}
      {effects.map((e,i)=>(
        <div key={i} style={{display:'flex',gap:6,alignItems:'center',marginTop:5}}>
          <input className="inv-input" placeholder={`Ефект ${i+1}…`}
            style={{flex:1,textAlign:'left'}}
            value={e.text} onChange={ev=>updateEffect(i,ev.target.value)}/>
          <button type="button"
            title={e.isHidden?'Прихований від гравця (натисни щоб відкрити)':'Видимий гравцю (натисни щоб приховати)'}
            onClick={()=>toggleHidden(i)}
            style={{background:'none',border:'none',cursor:'pointer',fontSize:'1rem'}}>
            {e.isHidden?<EyeOff size={13} aria-hidden />:<Eye size={13} aria-hidden />}
          </button>
          <button type="button" title="Видалити ефект" onClick={()=>removeEffect(i)}
            style={{background:'none',border:'none',cursor:'pointer',fontSize:'.95rem',color:'var(--ember2)'}}>✕</button>
        </div>
      ))}

      <div className="item-edit-props" style={{marginTop:12}}>
        <button type="button" className={`prop-toggle ${form.isMagic?'prop-toggle--magic':''}`}
          onClick={()=>set('isMagic',!form.isMagic)}>Магічний</button>
        <button type="button" className={`prop-toggle ${form.isCursed?'prop-toggle--cursed':''}`}
          onClick={()=>set('isCursed',!form.isCursed)}>Прокляте</button>
        <button type="button" className={`prop-toggle ${form.isBlessed?'prop-toggle--blessed':''}`}
          onClick={()=>set('isBlessed',!form.isBlessed)}>Освячене</button>
      </div>
    </div>
  )
}

function SpellForm({form,set}) {
  const row = {display:'flex',gap:8,flexWrap:'wrap',alignItems:'flex-end',marginBottom:8}
  const upgrades = Array.isArray(form.upgrades) ? form.upgrades : []
  const addUpgrade    = () => set('upgrades', [...upgrades, ''])
  const updateUpgrade = (i, v) => set('upgrades', upgrades.map((u,idx)=>idx===i?v:u))
  const removeUpgrade = (i) => set('upgrades', upgrades.filter((_,idx)=>idx!==i))

  return (
    <div>
      <div style={row}>
        <Fld label="Назва" style={{flex:1,minWidth:200}}>
          <Inp form={form} set={set} k="name" placeholder="Назва…"/>
        </Fld>
        <Fld label="Тип">
          <select className="inv-input" value={form.type||'spell'} onChange={e=>set('type',e.target.value)}>
            <option value="spell">Закляття</option>
            <option value="ability">Здібність</option>
          </select>
        </Fld>
        <Fld label={form.type==='ability'?'Клас':'Школа'} style={{minWidth:140}}>
          <select className="inv-input" value={form.school||''} onChange={e=>set('school',e.target.value)}>
            <option value="">— без {form.type==='ability'?'класу':'школи'} —</option>
            {(form.type==='ability'?ABILITY_SCHOOLS:SPELL_SCHOOLS).map(sc => <option key={sc} value={sc}>{sc}</option>)}
          </select>
        </Fld>
        <Fld label="Рівень"><Inp form={form} set={set} k="level" type="number" w={60}/></Fld>
      </div>
      <div style={row}>
        <Fld label="Час каст."><Inp form={form} set={set} k="timeToCast" placeholder="1 дія"/></Fld>
        <Fld label="Мана">    <Inp form={form} set={set} k="manaCost"    type="number" w={70}/></Fld>
        <Fld label="Витрив."> <Inp form={form} set={set} k="enduranceCost" type="number" w={70}/></Fld>
        <Fld label="Перезарядка"><Inp form={form} set={set} k="coolDown" placeholder="1 хв"/></Fld>
        <Fld label="Радіус (м)"><Inp form={form} set={set} k="radiusCast" type="number" w={70}/></Fld>
        <Fld label="Тип атаки"><Inp form={form} set={set} k="attackType" placeholder="Дальня"/></Fld>
        <Fld label="Сила">     <Inp form={form} set={set} k="power"      type="number" w={70}/></Fld>
      </div>
      <Fld label="Опис">
        <textarea className="inv-input" rows={3} style={{width:'100%',resize:'vertical',textAlign:'left'}}
          placeholder="Опис закляття/здібності…"
          value={form.description||''} onChange={e=>set('description',e.target.value)}/>
      </Fld>

      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:6}}>
        <SectionTitle>Покращення за рівнями</SectionTitle>
        <button type="button" className={s.miniBtn} onClick={addUpgrade}>+ Покращення</button>
      </div>
      {upgrades.length===0 && (
        <div className={s.hint} style={{marginTop:4}}>Покращень нема. Натисни «+ Покращення» щоб додати.</div>
      )}
      {upgrades.map((u,i)=>(
        <div key={i} style={{display:'flex',gap:6,alignItems:'flex-start',marginTop:5}}>
          <span style={{fontFamily:"'Cinzel',serif",fontSize:'.7rem',color:'var(--gold3)',paddingTop:8,whiteSpace:'nowrap'}}>Рів.{i+2}</span>
          <textarea className="inv-input" rows={2} style={{flex:1,resize:'vertical',textAlign:'left'}}
            placeholder={`Ефект на ${i+2} рівні…`}
            value={u} onChange={e=>updateUpgrade(i,e.target.value)}/>
          <button type="button" title="Видалити покращення" onClick={()=>removeUpgrade(i)}
            style={{background:'none',border:'none',cursor:'pointer',fontSize:'.95rem',color:'var(--ember2)',paddingTop:6}}>✕</button>
        </div>
      ))}
    </div>
  )
}

function ItemCard({item,onEdit,onDelete,onGive}) {
  const [open,setOpen] = useState(false)
  const isSpell = item.type==='spell'||item.type==='ability'
  const d = isSpell ? normalizeSpellData(item.data||{}) : normalizeItemData(item.data||{})
  // Іконка типу — як у фільтрах бази, зі своїм кольором
  const TYPE_ICO = {
    spell:   { I: Flame,    color: '#c05a2a', title: 'Закляття'  },
    ability: { I: Sparkles, color: '#a87fe8', title: 'Здібність' },
    armor:   { I: Shield,   color: '#6f93b5', title: 'Броня'     },
    weapon:  { I: Swords,   color: '#c98445', title: 'Зброя'     },
    other:   { I: Package,  color: 'var(--gold3)', title: 'Предмет' },
  }
  const T = TYPE_ICO[item.type] || TYPE_ICO.other
  const effects  = Array.isArray(d.effects)  ? d.effects  : []
  const upgrades = Array.isArray(d.upgrades) ? d.upgrades : []
  return (
    <div style={{background:'var(--s2)',border:'1px solid var(--br)',borderLeft:`3px solid ${T.color}`,borderRadius:7,padding:'10px 14px',marginBottom:7}}>
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        <span title={T.title} style={{color:T.color,display:'inline-flex',flexShrink:0,filter:'drop-shadow(0 0 3px rgba(212,176,72,.25))'}}>
          <T.I size={16} strokeWidth={1.8} aria-hidden />
        </span>
        <div style={{flex:1}}>
          <span style={{fontFamily:"'Cinzel',serif",fontSize:'.92rem',fontWeight:700,color:'var(--ivory)'}}>{item.name}</span>
          {d.isMagic&&<span style={{marginLeft:6,fontSize:'.62rem',color:'#a060f0',fontFamily:"'Cinzel',serif"}}>маг.</span>}
          {d.isCursed&&<span style={{marginLeft:3,fontSize:'.6rem',color:'#b02020',fontFamily:"'Cinzel',serif",fontWeight:700}}>П</span>}
          {d.isBlessed&&<span style={{marginLeft:3,fontSize:'.68rem',color:'#60b060'}}>✝</span>}
          {isSpell&&d.school&&<span style={{marginLeft:8,fontSize:'.72rem',color:'var(--muted)',fontStyle:'italic'}}>{d.school}</span>}
          {isSpell&&d.level&&<span style={{marginLeft:6,fontSize:'.72rem',color:'var(--gold3)'}}>Рів.{d.level}</span>}
          {item.description&&<div style={{fontSize:'.82rem',color:'var(--muted)',marginTop:2}}>
            {item.description.slice(0,100)}{item.description.length>100?'…':''}
          </div>}
        </div>
        <button className="pip-btn" style={{width:28,height:28}} onClick={()=>setOpen(o=>!o)}>{open?'▲':'▼'}</button>
        {onGive &&
          <button className="pip-btn" style={{width:28,height:28}} title="Видати гравцю" onClick={onGive}>Дати</button>}
        <button className="pip-btn" style={{width:28,height:28}} onClick={onEdit}>✏</button>
        <button className="pip-btn" style={{width:28,height:28,color:'var(--ember2)'}} onClick={onDelete}>✕</button>
      </div>
      {open&&(
        <div style={{marginTop:8,paddingTop:8,borderTop:'1px solid var(--br)'}}>
          {!isSpell&&(
            <div style={{display:'flex',flexWrap:'wrap',gap:'4px 14px',fontSize:'.82rem',color:'var(--iv3)'}}>
              {d.weightPerOne>0&&<span>Вага/шт: <b>{d.weightPerOne}</b></span>}
              {d.amount>1&&<span>К-сть: <b>{d.amount}</b></span>}
              {d.physicalDamage>0&&<span>Фіз.шкода: <b style={{color:'var(--ember2)'}}>{d.physicalDamage}</b></span>}
              {d.magicalDamage>0&&<span>Маг.шкода: <b style={{color:'#a060f0'}}>{d.magicalDamage}</b></span>}
              {d.physicalResistance>0&&<span>Фіз.захист: <b>{d.physicalResistance}</b></span>}
              {d.magicalResistance>0&&<span>Маг.захист: <b>{d.magicalResistance}</b></span>}
            </div>
          )}
          {isSpell&&(
            <div style={{display:'flex',flexWrap:'wrap',gap:'4px 14px',fontSize:'.82rem',color:'var(--iv3)'}}>
              {d.timeToCast&&<span>Час: <b>{d.timeToCast}</b></span>}
              {d.manaCost>0&&<span>Мана: <b style={{color:'var(--mp-color)'}}>{d.manaCost}</b></span>}
              {d.enduranceCost>0&&<span>Витрив: <b style={{color:'var(--ed-color)'}}>{d.enduranceCost}</b></span>}
              {d.coolDown&&<span>КД: <b>{d.coolDown}</b></span>}
              {d.radiusCast>0&&<span>Радіус: <b>{d.radiusCast}м</b></span>}
              {d.attackType&&<span>Атака: <b>{d.attackType}</b></span>}
              {d.power>0&&<span>Сила: <b style={{color:'var(--gold2)'}}>{d.power}</b></span>}
            </div>
          )}
          {effects.filter(e=>e&&String(e.text||'').trim()).map((e,i)=>(
            <div key={i} style={{marginTop:5,fontSize:'.84rem',color:e.isHidden?'var(--muted)':'var(--iv2)'}}>
              <b>Ефект {i+1}{e.isHidden?' (прихований)':''}:</b> {e.text}
            </div>
          ))}
          {isSpell&&upgrades.filter(u=>String(u||'').trim()).map((u,i)=>(
            <div key={i} style={{marginTop:4,fontSize:'.82rem',color:'var(--iv3)'}}>
              <b>Рів.{i+2}:</b> {u}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
