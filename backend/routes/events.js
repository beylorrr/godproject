/**
 * routes/events.js — SSE endpoint.
 * GET /api/events  (Authorization: Bearer <token>)
 *
 * Клієнт підключається один раз після логіну і тримає з'єднання відкритим.
 * Fastify автентифікує JWT, потім передає reply до SSE-менеджера.
 */
import { addClient, removeClient } from '../sse.js'

export default async function eventsRoute(fastify) {
  fastify.get('/events', {
    // НЕ використовуємо preHandler: authenticate, бо EventSource не може надсилати заголовки.
    // Токен береться з query-параметра ?token=...
    config: { rawBody: false },
  }, async (req, reply) => {
    // Верифікуємо JWT вручну
    const rawToken = req.query.token
    if (!rawToken) return reply.code(401).send('Unauthorized')
    let user
    try { user = fastify.jwt.verify(rawToken) }
    catch { return reply.code(401).send('Unauthorized') }
    const userId = user.userId
    const role   = user.role || 'player'

    reply.raw.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',
    })

    reply.raw.write(': connected\n\n')

    addClient(userId, role, reply)

    // Регулярний keep-alive comment (кожні 25 сек) щоб проксі не вбивали idle-з'єднання
    const keepAlive = setInterval(() => {
      try { reply.raw.write(': ping\n\n') } catch { cleanup() }
    }, 25_000)

    function cleanup() {
      clearInterval(keepAlive)
      removeClient(userId, reply)
    }

    req.raw.on('close',   cleanup)
    req.raw.on('aborted', cleanup)
    req.raw.on('error',   cleanup)

    // Тримаємо promise незавершеним — Fastify не закриє відповідь
    await new Promise(resolve => req.raw.once('close', resolve))
  })
}
