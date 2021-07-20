import type { ProofStateChangedEvent, Agent } from '@aries-framework/core'
import type { EnhancedStore } from '@reduxjs/toolkit'

import { ProofEventTypes } from '@aries-framework/core'

import { proofsSlice } from './proofsSlice'

/**
 * Starts an EventListener that listens for ProofRecords state changes
 * and updates the store accordingly.
 *
 * This function **must** be called if you're working with ProofRecords.
 * If you don't, the store won't be updated.
 */
const startProofsListener = (agent: Agent, store: EnhancedStore) => {
  const listener = (event: ProofStateChangedEvent) => {
    const record = event.payload.proofRecord
    store.dispatch(proofsSlice.actions.updateOrAdd(record))
  }

  agent.events.on(ProofEventTypes.ProofStateChanged, listener)

  return () => {
    agent.events.off(ProofEventTypes.ProofStateChanged, listener)
  }
}

export { startProofsListener }
