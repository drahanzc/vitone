import type { ReactNode } from 'react'

type IconName =
  | 'dashboard'
  | 'assessment'
  | 'search'
  | 'folder'
  | 'clock'
  | 'check'
  | 'arrow'
  | 'link'
  | 'close'
  | 'eye'
  | 'star'
  | 'bell'
  | 'info'
  | 'sidebar'
  | 'plus'
  | 'settings'
  | 'chevron'
  | 'users'

export function Icon({ name }: { name: IconName }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: name === 'link' ? 1.5 : 1.7,
  }

  const paths: Record<IconName, ReactNode> = {
    dashboard: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.4" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.4" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.4" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.4" /></>,
    assessment: <><path d="M4 5.5h16a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 19V7A1.5 1.5 0 0 1 4 5.5Z" /><path d="M7 3.5h10M7 10h10M7 14h6" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.4" /><path d="m15.5 15.5 5 5" /></>,
    folder: <><path d="M3 7.5a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M3 10h18" /></>,
    clock: <><circle cx="12" cy="12" r="8.8" /><path d="M12 7v5l3.3 2" /></>,
    check: <path d="m5 12.5 4.3 4.3L19.5 6.8" />,
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    link: <path transform="translate(1.333 4)" d="M4.6667 4 8.6667 4M8.6667 0 9.3333 0C10.3942 0 11.4116 0.4214 12.1618 1.1716 12.9119 1.9217 13.3333 2.9391 13.3333 4s-.4214 2.0783-1.1715 2.8284C11.4116 7.5786 10.3942 8 9.3333 8h-.6666M4.6667 8H4C2.9391 8 1.9217 7.5786 1.1716 6.8284.4214 6.0783 0 5.0609 0 4s.4214-2.0783 1.1716-2.8284C1.9217.4214 2.9391 0 4 0h.6667" />,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    eye: <><path d="M2.5 12s3.4-5.5 9.5-5.5 9.5 5.5 9.5 5.5-3.4 5.5-9.5 5.5S2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.5" /></>,
    star: <path d="m12 3 2.7 5.7 6.3.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.3-.9L12 3Z" />,
    bell: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
    sidebar: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    settings: <><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" /><path d="m19.4 15 .1.1 1.1.9-1.2 2-1.3-.5a7.8 7.8 0 0 1-1.5.9l-.2 1.4h-2.4l-.3-1.4a7.8 7.8 0 0 1-1.5-.9l-1.3.5-1.2-2 1.1-.9a7.7 7.7 0 0 1 0-1.8l-1.1-.9 1.2-2 1.3.5a7.8 7.8 0 0 1 1.5-.9l.3-1.4h2.4l.2 1.4a7.8 7.8 0 0 1 1.5.9l1.3-.5 1.2 2-1.1.9a7.7 7.7 0 0 1 0 1.8Z" transform="translate(-1 -1)" /></>,
    chevron: <path d="m6 9 6 6 6-6" />,
    users: <><path d="M16 20v-1.5a4.5 4.5 0 0 0-4.5-4.5h-4A4.5 4.5 0 0 0 3 18.5V20" /><circle cx="9.5" cy="7.5" r="3.5" /><path d="M17 11a3.5 3.5 0 1 0-1.2-6.8M21 20v-1.5a4.5 4.5 0 0 0-3.2-4.3" /></>,
  }

  return <svg aria-hidden="true" viewBox={name === 'link' ? '0 0 16 16' : '0 0 24 24'} {...common}>{paths[name]}</svg>
}

export function BrandMark() {
  return <span className="admin-brand-mark" aria-hidden="true"><img src="/assets/vitone-mark.png" alt="" /></span>
}

