import { afterEach, describe, expect, test } from 'bun:test'
import { openPdfPreview } from '../src/admin/pdf-preview'

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
afterEach(() => {
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
  else Reflect.deleteProperty(globalThis, 'window')
})

function setup(blocked = false) {
  const released: string[] = []
  const created: Blob[] = []
  const events = new Map<string, () => void>()
  const frame = { title: '', src: '', style: { cssText: '' } }
  let content: unknown = null
  const tab = {
    closed: false,
    opener: {} as unknown,
    document: {
      title: '',
      body: { textContent: '', style: { margin: '' }, replaceChildren(value: unknown) { content = value } },
      createElement(tag: string) { expect(tag).toBe('iframe'); return frame },
    },
    URL: { createObjectURL(blob: Blob) { created.push(blob); return 'blob:preview-owned' }, revokeObjectURL(url: string) { released.push(url) } },
    addEventListener(name: string, listener: () => void) { events.set(name, listener) },
    close() { tab.closed = true },
  }
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    open(url: string, target: string) { expect(url).toBe('about:blank'); expect(target).toBe('_blank'); return blocked ? null : tab },
  } })
  return { tab, frame, events, released, created, content: () => content }
}

describe('authenticated PDF preview tab', () => {
  test('opens the tab immediately and displays the PDF without a download link', () => {
    const state = setup()
    const preview = openPdfPreview('Report · <learner>')
    expect(state.tab.opener).toBeNull()
    expect(state.tab.document.title).toBe('Report · <learner>')
    expect(state.tab.document.body.textContent).toBe('Loading PDF…')
    expect(state.created).toHaveLength(0)
    const pdf = new Blob(['%PDF-1.7'], { type: 'application/pdf' })
    preview.show(pdf)
    expect(state.created).toEqual([pdf])
    expect(state.frame.src).toBe('blob:preview-owned')
    expect(state.frame.title).toBe('Report · <learner>')
    expect(state.content()).toBe(state.frame)
    expect(state.released).toHaveLength(0)
    state.events.get('pagehide')?.()
    expect(state.released).toEqual(['blob:preview-owned'])
  })

  test('reports blocked popups before fetching', () => {
    setup(true)
    expect(() => openPdfPreview('Report')).toThrow('Allow pop-ups')
  })

  test('closes the loading tab when the caller handles a failed fetch', () => {
    const state = setup()
    openPdfPreview('Report').close()
    expect(state.tab.closed).toBe(true)
    expect(state.released).toEqual([])
  })

  test('does not reopen a tab that the user closed while fetching', () => {
    const state = setup()
    const preview = openPdfPreview('Report')
    state.tab.closed = true
    expect(() => preview.show(new Blob([], { type: 'application/pdf' }))).toThrow('tab was closed')
    expect(state.created).toHaveLength(0)
  })

  test('rejects non-PDF responses and releases URLs on explicit close', () => {
    const state = setup()
    const preview = openPdfPreview('Report')
    expect(() => preview.show(new Blob(['<script>bad()</script>'], { type: 'text/html' }))).toThrow('did not return a PDF')
    expect(state.created).toHaveLength(0)
    preview.show(new Blob([], { type: 'application/pdf' }))
    preview.close()
    state.events.get('pagehide')?.()
    expect(state.released).toEqual(['blob:preview-owned'])
  })
})
