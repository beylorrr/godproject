/**
 * TabCombat — Зброя + таблиця урону + броня
 * Ліва частина: поля зброї + таблиця прямо під ними
 * Права частина: ресурси + PR/MR
 */
import { useSheetData } from '../../context/SheetDataContext'
import { useState } from 'react'
import { ARMOR_SLOTS, SHIELD_SLOT, RESOURCES } from '../../data/gameData'
import Field from '../ui/Field'
import SectionTitle from '../ui/SectionTitle'
import EquipModal from '../ui/EquipModal'
import ItemCard from '../ui/ItemCard'
import FormulaInput from '../ui/FormulaInput'
import DamageTable from '../ui/DamageTable'
import s from './TabCombat.module.css'

const AUTO_MAX   = { hp:'con', mp:'wis', mt:'will', ed:'end' }
const RES_COLORS = { hp:'#c94a1c', mp:'#4a70c8', pr:'#888', mr:'#9a4ac8', mt:'#4a9c6a', ed:'#6aaa2a' }


export default function TabCombat({ readOnly = false }) {
  const ctx = useSheetData()
  const { data:d, setField:sf, setArmorSlot, setShieldField,
          equipArmor, unequipArmor, equipWeapon, unequipWeapon,
          invAdd, invUpdate, invRemove } = ctx
  const upd = (k,v) => sf(k,v)

  // Модалка екіпірування: { kind:'armor'|'weapon', target:slot|hand, type:'armor'|'weapon' }
  const [equipPicker, setEquipPicker] = useState(null)
  const [beltAdded, setBeltAdded] = useState(null)
  const invItems = d['_inv_inv-main'] || []
  const pickerItems = equipPicker
    ? invItems.filter(it => (it.type || 'other') === equipPicker.type)
    : []
  const onPick = (item) => {
    if (!equipPicker) return
    if (equipPicker.kind === 'armor')  equipArmor(equipPicker.target, item)
    else                                equipWeapon(equipPicker.target, item)
    setEquipPicker(null)
  }

  return (
    <div>
      {readOnly && (
        <div style={{fontFamily:"'EB Garamond',serif",fontStyle:'italic',fontSize:'.85rem',
          color:'var(--muted)',marginBottom:10}}>
          Перегляд. Редагувати екіпірування — в Інвентарі, вкладка «Екіпірування».
        </div>
      )}
      {/* fieldset disabled вимикає всі поля та кнопки всередині */}
      <fieldset disabled={readOnly} style={{border:'none',margin:0,padding:0,minWidth:0}}>
      {/* ── БРОНЯ ── */}
      <SectionTitle>Обладунки</SectionTitle>
      <div className="armor-scroll">
        <div className="armor-grid">
          {['Слот','Вага','Фіз захист','Маг захист','Назва предмету','Дія'].map(h=>(
            <div key={h} className="armor-header">{h}</div>
          ))}
          {ARMOR_SLOTS.map(slot=>(
            <ArmorRow key={slot} slot={slot}
              data={d._armor?.[slot]||{}}
              onChange={(f,v)=>setArmorSlot({slot,field:f,value:v})}
              onEquip={()=>setEquipPicker({kind:'armor',target:slot,type:'armor'})}
              onUnequip={()=>unequipArmor(slot)}/>
          ))}
        </div>
      </div>

      <SectionTitle>Зброя — руки</SectionTitle>
      <div className={s.handsBlock}>
        {['wr','wl'].map(p=>(
          <div key={p} className={s.handCard}>
            <div className={s.handHead}>
              <span>{p==='wr'?'Права рука':'Ліва рука'}</span>
              {(d[`${p}-name`]||parseFloat(d[`${p}-phys`])||parseFloat(d[`${p}-mag`])||parseFloat(d[`${p}-weight`])||d[`${p}-equipped`])
                ? <button className="equip-btn equip-btn--off" onClick={()=>unequipWeapon(p)}>Зняти</button>
                : <button className="equip-btn" onClick={()=>setEquipPicker({kind:'weapon',target:p,type:'weapon'})}>Одягнути</button>}
            </div>
            <div className={s.handFields}>
              <div className="field"><label>Назва</label>
                <input value={d[`${p}-name`]||''} onChange={e=>upd(`${p}-name`,e.target.value)} placeholder="—"/></div>
              <div className="field"><label>Вага</label>
                <FormulaInput value={d[`${p}-weight`]||''} onChange={v=>upd(`${p}-weight`,v)}/></div>
              <div className="field"><label>Фіз. атака</label>
                <FormulaInput value={d[`${p}-phys`]||''} onChange={v=>upd(`${p}-phys`,v)}/></div>
              <div className="field"><label>Маг. атака</label>
                <FormulaInput value={d[`${p}-mag`]||''} onChange={v=>upd(`${p}-mag`,v)}/></div>
            </div>
          </div>
        ))}
      </div>

      {/* Зведення урону по руках (перенесено з вкладки "Загальне") */}
      <SectionTitle>Зброя та урон</SectionTitle>
      <div style={{overflowX:'auto'}}>
        <DamageTable d={d} />
      </div>

      <SectionTitle>Щит</SectionTitle>
      <div className="armor-scroll">
        <div className="armor-grid">
          {['Слот','Вага','Фіз захист','Маг захист','Назва','—'].map((h,idx)=>(
            <div key={idx} className="armor-header">{h}</div>
          ))}
          <div className="slot-name">{SHIELD_SLOT}</div>
          {['w','phys','mag','name'].map(f=>(
            <div key={f} className="armor-cell">
              <input type={f==='name'?'text':'number'} step={f==='w'?0.1:1}
                value={d._shield?.[f]||''}
                onChange={e=>setShieldField({field:f,value:e.target.value})}
                placeholder={f==='name'?'—':undefined}/>
            </div>
          ))}
          <div className="armor-equip-cell" />
        </div>
      </div>

      {/* ── ПОЯС (швидкий доступ) — доступний лише якщо в екіпіруванні є Пояс ── */}
      {(() => {
        const beltSlot = d._armor?.['Пояс']
        const beltEquipped = !!(beltSlot && (beltSlot.name || beltSlot.equipped))
        // Місткість пояса: число зі слота "на N слот", інакше 4
        const capMatch = beltEquipped ? String(beltSlot.name||'').match(/(\d+)\s*слот/i) : null
        const beltCap = capMatch ? parseInt(capMatch[1]) : 4
        if (!beltEquipped) {
          return <>
            <SectionTitle>Пояс</SectionTitle>
            <div className={s.beltBlock}>
              <span style={{fontFamily:"'Cinzel',serif",fontSize:'.7rem',color:'var(--muted)',opacity:.8}}>
                Спершу одягніть пояс у слот «Пояс» в екіпіруванні
              </span>
            </div>
          </>
        }
        return <>
          <SectionTitle>Пояс</SectionTitle>
          <div className={s.beltBlock}>
            {(d['_inv_inv-belt'] || []).map(it => (
              <ItemCard key={it._id} item={it}
                defaultEditing={it._id === beltAdded}
                onSave={patch => invUpdate('inv-belt', it._id, patch)}
                onRemove={() => invRemove('inv-belt', it._id)}/>
            ))}
            {(d['_inv_inv-belt'] || []).length < beltCap
              ? <button className="add-row-btn" onClick={() => setBeltAdded(invAdd('inv-belt'))}>
                  + Додати на пояс ({(d['_inv_inv-belt'] || []).length}/{beltCap})
                </button>
              : <span style={{fontFamily:"'Cinzel',serif",fontSize:'.65rem',color:'var(--muted)',opacity:.7}}>
                  Пояс заповнений ({beltCap}/{beltCap})
                </span>}
          </div>
        </>
      })()}

      {/* PR / MR */}
      <div className={s.prMr}>
        <div className={s.prMrChip}>
          <span className={s.prMrLabel}>PR — Фіз. захист</span>
          <span className={s.prMrVal}>{d['res-max-pr']||0}</span>
        </div>
        <div className={s.prMrChip}>
          <span className={s.prMrLabel}>MR — Маг. захист</span>
          <span className={s.prMrVal}>{d['res-max-mr']||0}</span>
        </div>
      </div>

      <EquipModal
        open={!!equipPicker}
        title={equipPicker?.kind === 'armor' ? 'Одягнути броню/одяг' : 'Одягнути зброю'}
        items={pickerItems}
        onPick={onPick}
        onClose={() => setEquipPicker(null)}/>
      </fieldset>
    </div>
  )
}

function ArmorRow({ slot, data, onChange, onEquip, onUnequip }) {
  const equipped = !!data.equipped
  const filled = !!(data.name || parseFloat(data.w) || parseFloat(data.phys) || parseFloat(data.mag) || equipped)
  return (
    <>
      <div className="slot-name">{slot.replace(/_/g,' ')}</div>
      {['w','phys','mag','name'].map(f=>(
        <div key={f} className="armor-cell">
          <input type={f==='name'?'text':'number'} step={f==='w'?0.1:1}
            value={data[f]||''} onChange={e=>onChange(f,e.target.value)}
            readOnly={equipped}
            style={equipped?{opacity:.75,cursor:'default'}:undefined}
            placeholder={f==='name'?'—':undefined}/>
        </div>
      ))}
      <div className="armor-equip-cell">
        {filled
          ? <button className="equip-btn equip-btn--off" onClick={onUnequip}>Зняти</button>
          : <button className="equip-btn" onClick={onEquip}>Одягти</button>}
      </div>
    </>
  )
}
