export type RerunState = { confirming: boolean; busy: boolean; error: string }

export const initialRerunState: RerunState = { confirming: false, busy: false, error: '' }

type RerunAction = { type: 'confirm' | 'cancel' | 'start' | 'queued' } | { type: 'failed'; message: string }

export function rerunStateReducer(state: RerunState, action: RerunAction): RerunState {
  switch (action.type) {
    case 'confirm': return { ...state, confirming: true }
    case 'cancel': return { ...state, confirming: false, error: '' }
    case 'start': return { ...state, busy: true, error: '' }
    case 'queued': return { confirming: false, busy: false, error: '' }
    case 'failed': return { ...state, busy: false, error: action.message }
  }
}
