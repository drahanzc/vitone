export type RerunState = { confirming: boolean; busy: boolean; error: string; rebuildWordAlignment: boolean }

export const initialRerunState: RerunState = { confirming: false, busy: false, error: '', rebuildWordAlignment: false }

type RerunAction = { type: 'confirm' | 'cancel' | 'start' | 'queued' } | { type: 'failed'; message: string } | { type: 'set-rebuild'; value: boolean }

export function rerunStateReducer(state: RerunState, action: RerunAction): RerunState {
  switch (action.type) {
    case 'confirm': return { ...state, confirming: true }
    case 'cancel': return state.busy ? state : initialRerunState
    case 'set-rebuild': return state.busy || !state.confirming ? state : { ...state, rebuildWordAlignment: action.value }
    case 'start': return { ...state, busy: true, error: '' }
    case 'queued': return initialRerunState
    case 'failed': return { ...state, busy: false, error: action.message }
  }
}
