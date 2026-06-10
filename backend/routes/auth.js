// routes/auth.js
import bcrypt from 'bcryptjs'
import { getDB, dbGet, dbRun, saveToDB } from '../db.js'

const XP_THRESHOLDS = lvl => (lvl + 1) * 50  // XP до наступного рівня

export default async function authRoutes(fastify) {

  function signToken(user) {
    return fastify.jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      { expiresIn: '30d' }
    )
  }

  // ── POST /api/auth/register ──────────────────────────
  fastify.post('/register', {
    schema: {
      body: {
        type: 'object',
        required: ['username', 'password'],
        additionalProperties: false,
        properties: {
          username: { type: 'string', minLength: 3, maxLength: 30 },
          password: { type: 'string', minLength: 4, maxLength: 100 },
          role:     { type: 'string', enum: ['player', 'gm'] },
          gmCode:   { type: 'string', maxLength: 200 },
        },
      },
    },
  }, async (req, reply) => {
    const username = req.body.username.trim()

    // Роль gm дозволена ЛИШЕ з правильним секретним кодом (GM_REGISTER_CODE у env).
    // Без коду/невірний — 403, щоб ніхто не міг самопризначитись Майстром.
    let role = 'player'
    if (req.body.role === 'gm') {
      const expected = process.env.GM_REGISTER_CODE
      if (expected && req.body.gmCode === expected) {
        role = 'gm'
      } else {
        return reply.code(403).send({ error: 'Невірний код Майстра' })
      }
    }

    if (dbGet('SELECT id FROM users WHERE username = ?', [username])) {
      return reply.code(409).send({ error: 'Логін вже зайнятий' })
    }

    const hash = await bcrypt.hash(req.body.password, 12)
    dbRun('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', [username, hash, role])
    const user = dbGet('SELECT id, username, role FROM users WHERE username = ?', [username])

    // Гравцям — перший персонаж
    if (role === 'player') {
      dbRun(`INSERT INTO characters (user_id, slot_name, is_active, sheet_data)
             VALUES (?, 'Персонаж 1', 1, '{}')`, [user.id])
    }
    saveToDB()

    return reply.code(201).send({
      token:    signToken(user),
      username: user.username,
      userId:   user.id,
      role:     user.role,
    })
  })

  // ── POST /api/auth/login ─────────────────────────────
  fastify.post('/login', {
    schema: {
      body: {
        type: 'object',
        required: ['username', 'password'],
        additionalProperties: false,
        properties: {
          username: { type: 'string' },
          password: { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const user = dbGet(
      'SELECT id, username, password_hash, role FROM users WHERE username = ?',
      [req.body.username.trim()]
    )
    if (!user || !(await bcrypt.compare(req.body.password, user.password_hash))) {
      return reply.code(401).send({ error: 'Невірний логін або пароль' })
    }
    return reply.send({
      token:    signToken(user),
      username: user.username,
      userId:   user.id,
      role:     user.role,
    })
  })

  // ── GET /api/auth/me ─────────────────────────────────
  fastify.get('/me', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const user = dbGet('SELECT id, username, role FROM users WHERE id = ?', [req.user.userId])
    return reply.send({ userId: user.id, username: user.username, role: user.role })
  })
}
