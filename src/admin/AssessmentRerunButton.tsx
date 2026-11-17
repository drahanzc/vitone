import { useEffect, useReducer, useRef } from 'react'
import { rerunAssessment, type AssessmentListItem, type CenterSession } from './admin-api'
import { initialRerunState, rerunStateReducer } from './rerun-state'

export function AssessmentRerunButton({ item, session, updateSession, onQueued }: {
  item: AssessmentListItem
  session: CenterSession
  updateSession: (session: CenterSession | null) => void
  onQueued: () => void
}) {
  const [{ confirming, busy, error, rebuildWordAlignment }, dispatch] = useReducer(rerunStateReducer, initialRerunState)
  const inFlight = useRef(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  if (item.status !== 'COMPLETED' && item.status !== 'FAILED') return null

  async function rerun() {
    if (inFlight.current) return
    inFlight.current = true
    dispatch({ type: 'start' })
    try {
      await rerunAssessment(item.id, session, updateSession, { rebuild_word_alignment: rebuildWordAlignment })
      if (mounted.current) {
        dispatch({ type: 'queued' })
        onQueued()
      }
    } catch (cause) {
      if (mounted.current) dispatch({ type: 'failed', message: cause instanceof Error ? cause.message : 'The assessment could not be queued. Please try again.' })
    } finally {
      inFlight.current = false
    }
  }

  return <div className="admin-rerun-action">
    {confirming ? <RerunConfirmation busy={busy} rebuildWordAlignment={rebuildWordAlignment}
      onRebuildChange={value => dispatch({ type: 'set-rebuild', value })}
      onConfirm={() => void rerun()} onCancel={() => dispatch({ type: 'cancel' })}
    /> : <button className="admin-rerun-trigger" type="button" aria-label={`Rerun assessment for ${item.learner_reference}`} onClick={() => dispatch({ type: 'confirm' })}>Rerun assessment</button>}
    {error ? <p className="admin-form-error" role="alert">{error}</p> : null}
  </div>
}

export function RerunConfirmation({ busy, onConfirm, onCancel }: {
  busy: boolean
  rebuildWordAlignment: boolean
  onRebuildChange: (value: boolean) => void
  onConfirm: () => void
  onCancel: () => void
}) {
  return <div className="admin-rerun-confirm">
    <p>Recalculate scoring using the saved Azure results? This replaces the report without calling Azure again.</p>
    {/* <label className="admin-rerun-option">
      <input type="checkbox" checked={rebuildWordAlignment} disabled={busy} onChange={event => onRebuildChange(event.currentTarget.checked)} />
      Rebuild word alignment
    </label>
    <p className="admin-rerun-warning">If selected, rebuilds word alignment and keeps valid saved pitch from the same reading. Missing pitch cannot be restored by rerunning. Synthetic or incompatible evidence cannot be reused. No audio is processed.</p> */}
    <div className="admin-rerun-buttons">
      <button className="admin-rerun-confirm-button" type="button" disabled={busy} onClick={onConfirm}>{busy ? 'Queueing…' : 'Confirm rerun'}</button>
      <button className="admin-rerun-cancel" type="button" disabled={busy} onClick={onCancel}>Cancel</button>
    </div>
  </div>
}
