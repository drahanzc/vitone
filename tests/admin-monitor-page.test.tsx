import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { AdminSidebar } from '../src/admin/AdminLayout'
import { AdminMonitorPage } from '../src/admin/AdminMonitorPage'
import { CenterAuthContext } from '../src/admin/center-auth-context'

const session = { accessToken: 'token', refreshToken: 'refresh', expiresAt: Date.now() + 60_000 }
const auth = { session, updateSession: () => {}, signIn: async () => {}, signOut: async () => {} }

test('admin sidebar exposes the dedicated Monitor workspace route', () => {
  const html = renderToStaticMarkup(<MemoryRouter><AdminSidebar collapsed={false} onToggle={() => {}}
    displayName="Center" initials="C" onSignOut={() => {}} /></MemoryRouter>)
  expect(html).toContain('href="/admin/monitor"')
  expect(html).toContain('<span>Monitor</span>')
})

test('monitor workspace describes the investigation queue and loads center context', () => {
  const html = renderToStaticMarkup(<MemoryRouter><CenterAuthContext.Provider value={auth}>
    <AdminMonitorPage />
  </CenterAuthContext.Provider></MemoryRouter>)
  expect(html).toContain('<h1>Monitor</h1>')
  expect(html).toContain('Track assessment processing, find failures')
  expect(html).toContain('Loading assessment links…')
})
