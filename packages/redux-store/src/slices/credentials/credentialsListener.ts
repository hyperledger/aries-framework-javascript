import type { CredentialStateChangedEvent, Agent } from '@aries-framework/core'
import type { EnhancedStore } from '@reduxjs/toolkit'

import { CredentialEventTypes } from '@aries-framework/core'

import { credentialsSlice } from './credentialsSlice'

/**
 * Starts an EventListener that listens for CredentialRecord state changes
 * and updates the store accordingly.
 *
 * This function **must** be called if you're working with CredentialRecords.
 * If you don't, the store won't be updated.
 */
const startCredentialsListener = (agent: Agent, store: EnhancedStore) => {
  const listener = (event: CredentialStateChangedEvent) => {
    const record = event.payload.credentialRecord
    store.dispatch(credentialsSlice.actions.updateOrAdd(record))
  }

  agent.events.on(CredentialEventTypes.CredentialStateChanged, listener)

  return () => {
    agent.events.off(CredentialEventTypes.CredentialStateChanged, listener)
  }
}

export { startCredentialsListener }
