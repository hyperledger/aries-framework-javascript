import type { CredentialsState } from './credentialsSlice'
import type { CredentialState } from '@aries-framework/core'

interface PartialCredentialState {
  credentials: CredentialsState
}

/**
 * Namespace that holds all CredentialRecord related selectors.
 */
const CredentialsSelectors = {
  /**
   * Selector that retrieves the entire **credentials** store object.
   */
  credentialsStateSelector: (state: PartialCredentialState) => state.credentials.credentials,

  /**
   * Selector that retrieves all CredentialRecords from the store.
   */
  credentialRecordsSelector: (state: PartialCredentialState) => state.credentials.credentials.records,

  /**
   * Selector that retrieves all CredentialRecords from the store by specified credential state.
   */
  credentialsRecordsByStateSelector: (credentialState: CredentialState) => (state: PartialCredentialState) =>
    state.credentials.credentials.records.filter((record) => record.state === credentialState),

  /**
   * Selector that fetches a CredentialRecord by id from the state.
   */
  connectionRecordByIdSelector: (credentialRecordId: string) => (state: PartialCredentialState) =>
    state.credentials.credentials.records.find((x) => x.id === credentialRecordId),
}

export { CredentialsSelectors }
