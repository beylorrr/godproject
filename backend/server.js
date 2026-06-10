// server.js
import 'dotenv/config'
import Fastify   from 'fastify'
import cors      from '@fastify/cors'
import jwt       from '@fastify/jwt'
import fstatic   from '@fastify/static'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync }    from 'node:fs'
import { initDB }          from './db.js'
import authRoutes          from './routes/auth.js'
import characterRoutes     from './routes/characters.js'
import partyRoutes         from './routes/parties.js'
import gmRoutes            from './routes/gm.js'
import eventsRoute         from './routes/events.js'

const isProd = process.env.NODE_ENV === 'production'

// pino-pretty працює у воркер-треді й інколи валить процес у dev.
// Вмикаємо його лише якщо явно попросили (LOG_PRETTY=1), інакше — звичайний JSON-лог.
const prettyLog = !isProd && process.env.LOG_PRETTY === '1'

const fastify = Fastify({
  trustProxy: true,
  bodyLimit:  1_048_576,
  logger: prettyLog
    ? { level: 'debug', transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } }
    : { level: isProd ? 'info' : 'debug' },
})

const allowed = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
  : ['http://localhost:5173', 'http://localhost:4173', 'http://localhost:3001']

await fastify.register(cors, {
  origin: (origin, cb) => {
    if (!origin || allowed.includes(origin)) return cb(null, true)
    cb(new Error('Not allowed by CORS'))
  },
  methods:        ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
  credentials:    true,
})

const jwtSecret = process.env.JWT_SECRET
if (!jwtSecret && isProd) { console.error('❌ JWT_SECRET required'); process.exit(1) }
await fastify.register(jwt, { secret: jwtSecret || 'dev_secret_please_change' })

fastify.decorate('authenticate', async (req, reply) => {
  try   { await req.jwtVerify() }
  catch { return reply.code(401).send({ error: 'Не авторизовано' }) }
})

fastify.setErrorHandler((err, req, reply) => {
  if (err.validation) return reply.code(400).send({ error: 'Невірні дані', details: err.message })
  if (err.message?.includes('UNIQUE')) return reply.code(409).send({ error: 'Такий запис вже існує' })
  req.log.error(err)
  return reply.code(err.statusCode || 500).send({ error: isProd ? 'Внутрішня помилка' : err.message })
})

await fastify.register(authRoutes,      { prefix: '/api/auth' })
await fastify.register(characterRoutes, { prefix: '/api/characters' })
await fastify.register(partyRoutes,     { prefix: '/api/parties' })
await fastify.register(gmRoutes,        { prefix: '/api/gm' })
await fastify.register(eventsRoute,     { prefix: '/api' })

fastify.get('/api/health', async () => ({ ok: true, time: new Date().toISOString() }))

// ── Обслуговування зібраного фронту (SPA) ───────────────
// Якщо поряд є зібраний фронт (../dist), бекенд віддає його сам.
// Тоді все працює на одному порту/домені — без CORS і без vite-проксі.
const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir   = join(__dirname, '..', 'dist')
const hasDist   = existsSync(join(distDir, 'index.html'))

if (hasDist) {
  await fastify.register(fstatic, { root: distDir, prefix: '/' })

  // SPA-fallback: усе що НЕ /api/* і не знайдено як файл → index.html (для React Router)
  fastify.setNotFoundHandler((req, reply) => {
    if (req.raw.url?.startsWith('/api/')) {
      return reply.code(404).send({ error: 'Не знайдено' })
    }
    return reply.sendFile('index.html')
  })
  fastify.log?.info?.(`📦 Роздаю фронт із ${distDir}`)
} else {
  // Фронту немає поряд (dev-режим: фронт окремо на vite :5173)
  fastify.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: 'Не знайдено' }))
}

async function start() {
  try {
    await initDB()
    const port = Number(process.env.PORT) || 3000
    await fastify.listen({ port, host: '0.0.0.0' })
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

for (const sig of ['SIGINT','SIGTERM']) {
  process.on(sig, async () => { await fastify.close(); process.exit(0) })
}

start()
