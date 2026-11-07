export type PdfPreview = {
  show: (pdf: Blob) => void
  close: () => void
}

// Open synchronously in the click handler, before authenticated fetching can
// consume the browser's user activation and trigger its popup blocker.
export function openPdfPreview(title: string): PdfPreview {
  const tab = window.open('about:blank', '_blank') as (Window & typeof globalThis) | null
  if (!tab) throw new Error('Allow pop-ups for this site, then try View PDF again.')

  let url: string | null = null
  const release = () => {
    if (url) tab.URL.revokeObjectURL(url)
    url = null
  }
  try {
    tab.opener = null
    tab.document.title = title
    tab.document.body.textContent = 'Loading PDF…'
    tab.document.body.style.margin = '0'
    tab.addEventListener('pagehide', release, { once: true })
  } catch (error) {
    tab.close()
    throw error
  }

  return {
    show(pdf) {
      if (tab.closed) throw new Error('The PDF tab was closed. Click View PDF to try again.')
      if (pdf.type !== 'application/pdf') throw new Error('The server did not return a PDF report.')
      release()
      // The preview document owns the URL, so it survives navigation/sign-out in
      // the admin tab and is released when the preview closes or navigates away.
      url = tab.URL.createObjectURL(pdf)
      const frame = tab.document.createElement('iframe')
      frame.title = title
      frame.src = url
      frame.style.cssText = 'display:block;width:100%;height:100dvh;border:0'
      tab.document.body.replaceChildren(frame)
    },
    close() {
      release()
      tab.close()
    },
  }
}
