# CharSheet — React + Redux

Повна версія листа персонажа RPG на React 18 + Redux Toolkit.

## Запуск (два термінали)

### Термінал 1 — Бекенд (Node.js + SQLite)
```bash
cd backend
cp .env.example .env       # вписати JWT_SECRET
npm install
npm start                  # http://localhost:3000
```

### Термінал 2 — Фронтенд (React + Vite)
```bash
# в корні проекту
npm install
npm run dev                # http://localhost:5173
```

## Структура

```
src/
  data/
    gameData.js            ← всі ігрові константи (навички, броня, ресурси)
  utils/
    formulas.js            ← ігрові формули (МОД, XP, урон, вага, PR/MR)
  store/
    index.js               ← Redux store + redux-persist
    slices/
      authSlice.js         ← авторизація (login/register/logout)
      sheetSlice.js        ← весь стан листа персонажа
  hooks/
    useAutoSave.js         ← автозбереження в БД (debounce 2s)
  components/
    ui/
      Field.jsx            ← базове поле вводу
      PipBtn.jsx           ← кнопка +/−
      SectionTitle.jsx     ← заголовок секції
      SaveIndicator.jsx    ← індикатор збереження
      SkillTooltip.jsx     ← тултіп опису вміння
    tabs/
      TabGeneral.jsx       ← ім'я, XP, fame, вага
      TabStats.jsx         ← характеристики + ресурси
      TabSkills.jsx        ← вміння з gate-системою
      TabCombat.jsx        ← зброя, урон, броня, ресурси
      TabInventory.jsx     ← інвентар, ефекти, риси, рецепти, мови, нотатки
      TabSpells.jsx        ← закляття та здатності
  pages/
    LoginPage.jsx          ← вхід / реєстрація
    CharactersPage.jsx     ← вибір персонажа
    SheetPage.jsx          ← лист з вкладками
```

## Архітектурні рішення

- **Стан листа** — плоска структура в `sheetSlice.data`, ідентична
  тому що ванільна версія зберігала в localStorage. Це дозволяє
  безшовно мігрувати дані між версіями.

- **Автозбереження** — `useAutoSave` відстежує будь-яку зміну `data`,
  через 2 секунди після останньої зміни відправляє PUT до бекенду.

- **Формули** — чисті функції в `utils/formulas.js`, не залежать від React.
  PR/MR перераховуються автоматично в reducers при кожній зміні броні.
  Авто-максимуми HP/MP/MT/ED — при кожній зміні характеристики.

- **Стилі** — глобальний `index.css` є точною копією оригінального
  `style.css` ванільної версії. CSS Modules використовуються тільки
  для layout сторінок (LoginPage, CharactersPage, SheetPage).

## Деплой

Бекенд → Railway:
1. Залити `backend/` на GitHub
2. Railway → New Project → Deploy from GitHub
3. Variables: `JWT_SECRET`, `NODE_ENV=production`, `PORT=3000`
4. Add Volume → mount на `/app/data`, додати `DB_PATH=/app/data/charsheet.db`

Фронтенд → GitHub Pages / Netlify:
1. Змінити `.env.production` → `VITE_API_URL=https://твій-бек.railway.app`
2. `npm run build` → задеплоїти папку `dist/`
