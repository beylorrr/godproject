import { configureStore, combineReducers } from '@reduxjs/toolkit'
import { persistStore, persistReducer, FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER } from 'redux-persist'
import storage from 'redux-persist/lib/storage'
import authReducer  from './slices/authSlice'
import sheetReducer from './slices/sheetSlice'
import gmReducer    from './slices/gmSlice'

const rootReducer = combineReducers({
  auth:  authReducer,
  sheet: sheetReducer,
  gm:    gmReducer,
})

const PERSIST_VERSION = 4

const persistConfig = {
  key: 'charsheet_v2',
  version: PERSIST_VERSION,
  storage,
  whitelist: ['auth'],       // зберігаємо ТІЛЬКИ токен; лист завжди свіжий із сервера
  // Будь-який стан зі старою версією просто відкидаємо (повертаємо undefined).
  // redux-persist сам почистить невідповідні ключі — користувачу нічого робити не треба.
  migrate: (state) => {
    if (!state || state._persist?.version !== PERSIST_VERSION) {
      // лишаємо тільки токен, якщо він є — щоб не розлогінювати при апдейті версії
      const token = state?.auth?.token
      if (token) return Promise.resolve({ auth: { ...state.auth }, _persist: state._persist })
      return Promise.resolve(undefined)
    }
    return Promise.resolve(state)
  },
}

export const store = configureStore({
  reducer: persistReducer(persistConfig, rootReducer),
  middleware: gd => gd({ serializableCheck: { ignoredActions: [FLUSH,REHYDRATE,PAUSE,PERSIST,PURGE,REGISTER] } }),
})

export const persistor = persistStore(store)

// Повне скидання локального стану (на випадок зламаного кешу зі старих версій).
export async function hardResetLocalState() {
  try {
    await persistor.purge()
    localStorage.removeItem('persist:charsheet_v2')
    localStorage.removeItem('charsheet_v2')
  } catch (e) { /* ignore */ }
  location.reload()
}
