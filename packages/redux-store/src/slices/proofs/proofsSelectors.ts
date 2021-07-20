import type { ProofsState } from './proofsSlice'
import type { ProofState } from '@aries-framework/core'

interface PartialProofsState {
  proofs: ProofsState
}

/**
 * Namespace that holds all ProofRecords related selectors.
 */
const ProofsSelectors = {
  /**
   * Selector that retrieves the entire **proofs** store object.
   */
  proofsStateSelector: (state: PartialProofsState) => state.proofs.proofs,

  /**
   * Selector that retrieves all ProofRecords from the state.
   */
  proofRecordsSelector: (state: PartialProofsState) => state.proofs.proofs.records,

  /**
   * Selector that retrieves all ProofRecords from the store by specified state.
   */
  proofRecordsByStateSelector: (proofState: ProofState) => (state: PartialProofsState) =>
    state.proofs.proofs.records.filter((record) => record.state === proofState),

  /**
   * Selector that fetches a ProofRecord by id from the state.
   */
  connectionRecordByIdSelector: (proofRecordId: string) => (state: PartialProofsState) =>
    state.proofs.proofs.records.find((x) => x.id === proofRecordId),
}

export { ProofsSelectors }
