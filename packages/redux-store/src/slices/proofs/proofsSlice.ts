import type { ProofRecord } from '@aries-framework/core'
import type { PayloadAction, SerializedError } from '@reduxjs/toolkit'

import { createSlice } from '@reduxjs/toolkit'

import { ProofsThunks } from './proofsThunks'

interface ProofsState {
  proofs: {
    records: ProofRecord[]
    isLoading: boolean
  }
  error: null | SerializedError
}

const initialState: ProofsState = {
  proofs: {
    records: [],
    isLoading: false,
  },
  error: null,
}

const proofsSlice = createSlice({
  name: 'proofs',
  initialState,
  reducers: {
    updateOrAdd: (state, action: PayloadAction<ProofRecord>) => {
      const index = state.proofs.records.findIndex((record) => record.id == action.payload.id)

      if (index == -1) {
        // records doesn't exist, add it
        state.proofs.records.push(action.payload)
        return state
      }

      // record does exist, update it
      state.proofs.records[index] = action.payload
      return state
    },
  },
  extraReducers: (builder) => {
    builder
      // getAllProofs
      .addCase(ProofsThunks.getAllProofs.pending, (state) => {
        state.proofs.isLoading = true
      })
      .addCase(ProofsThunks.getAllProofs.rejected, (state, action) => {
        state.proofs.isLoading = false
        state.error = action.error
      })
      .addCase(ProofsThunks.getAllProofs.fulfilled, (state, action) => {
        state.proofs.isLoading = false
        state.proofs.records = action.payload
      })
      // proposeProof
      .addCase(ProofsThunks.proposeProof.rejected, (state, action) => {
        state.error = action.error
      })
      // acceptProposal
      .addCase(ProofsThunks.acceptProposal.rejected, (state, action) => {
        state.error = action.error
      })
      // requestProof
      .addCase(ProofsThunks.requestProof.rejected, (state, action) => {
        state.error = action.error
      })
      // acceptRequest
      .addCase(ProofsThunks.acceptRequest.rejected, (state, action) => {
        state.error = action.error
      })
      // acceptPresentation
      .addCase(ProofsThunks.acceptPresentation.rejected, (state, action) => {
        state.error = action.error
      })
      // getRequestedCredentialsForProofRequest
      .addCase(ProofsThunks.getRequestedCredentialsForProofRequest.rejected, (state, action) => {
        state.error = action.error
      })
      // autoSelectCredentialsForProofRequest
      .addCase(ProofsThunks.autoSelectCredentialsForProofRequest.rejected, (state, action) => {
        state.error = action.error
      })
  },
})

export { proofsSlice }

export type { ProofsState }
