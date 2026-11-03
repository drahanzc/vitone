import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createServer as createHttpServer, type Server } from 'node:http'
import { createServer as createViteServer, type ViteDevServer } from 'vite'

let backend: Server
let vite: ViteDevServer
let baseUrl: string
const originalTarget = process.env.API_PROXY_TARGET

beforeAll(async () => {
  backend = createHttpServer((request, response) => {
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify({ path: request.url, authorization: request.headers.authorization }))
  })
  await new Promise<void>(resolve => backend.listen(0, '127.0.0.1', resolve))
  const backendAddress = backend.address()
  if (!backendAddress || typeof backendAddress === 'string') throw new Error('Backend did not start')
  process.env.API_PROXY_TARGET = `http://127.0.0.1:${backendAddress.port}`
  vite = await createViteServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'silent' })
  await vite.listen()
  const viteAddress = vite.httpServer?.address()
  if (!viteAddress || typeof viteAddress === 'string') throw new Error('Vite did not start')
  baseUrl = `http://127.0.0.1:${viteAddress.port}`
})

afterAll(async () => {
  await vite?.close()
  if (backend) await new Promise<void>((resolve, reject) => backend.close(error => error ? reject(error) : resolve()))
  if (originalTarget === undefined) delete process.env.API_PROXY_TARGET
  else process.env.API_PROXY_TARGET = originalTarget
})

describe('admin development proxy', () => {
  for (const path of ['/assessments/example-id', '/assessments/example-id/report.pdf']) {
    test(`forwards ${path} to the backend`, async () => {
      const response = await fetch(`${baseUrl}${path}`, { headers: { Authorization: 'Bearer test-token' } })
      expect(response.headers.get('content-type')).toContain('application/json')
      expect(await response.json()).toEqual({ path, authorization: 'Bearer test-token' })
    })
  }
})
