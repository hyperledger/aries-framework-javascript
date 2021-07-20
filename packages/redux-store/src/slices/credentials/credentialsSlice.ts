import type { CredentialRecord } from '@aries-framework/core'
import type { PayloadAction, SerializedError } from '@reduxjs/toolkit'

import { createSlice } from '@reduxjs/toolkit'

import { CredentialsThunks } from './credentialsThunks'

interface CredentialsState {
  credentials: {
    records: CredentialRecord[]
    isLoading: boolean
  }
  error: null | SerializedError
}

const initialState: CredentialsState = {
  credentials: {
    records: [],
    isLoading: false,
  },
  error: null,
}

const credentialsSlice = createSlice({
  name: 'credentials',
  initialState,
  reducers: {
    updateOrAdd: (state, action: PayloadAction<CredentialRecord>) => {
      const index = state.credentials.records.findIndex((record) => record.id == action.payload.id)

      if (index == -1) {
        // records doesn't exist, add it
        state.credentials.records.push(action.payload)
        return state
      }

      // record does exist, update it
      state.credentials.records[index] = action.payload
      return state
    },
  },
  extraReducers: (builder) => {
    builder
      // getAllCredentials
      .addCase(CredentialsThunks.getAllCredentials.pending, (state) => {
        state.credentials.isLoading = true
      })
      .addCase(CredentialsThunks.getAllCredentials.rejected, (state, action) => {
        state.credentials.isLoading = false
        state.error = action.error
      })
      .addCase(CredentialsThunks.getAllCredentials.fulfilled, (state, action) => {
        state.credentials.isLoading = false
        state.credentials.records = action.payload
      })
      // proposeCredential
      .addCase(CredentialsThunks.proposeCredential.rejected, (state, action) => {
        state.error = action.error
      })
      // acceptProposal
      .addCase(CredentialsThunks.acceptProposal.rejected, (state, action) => {
        state.error = action.error
      })
      // offerCredential
      .addCase(CredentialsThunks.offerCredential.rejected, (state, action) => {
        state.error = action.error
      })
      // acceptOffer
      .addCase(CredentialsThunks.acceptOffer.rejected, (state, action) => {
        state.error = action.error
      })
      // acceptRequest
      .addCase(CredentialsThunks.acceptRequest.rejected, (state, action) => {
        state.error = action.error
      })
      // acceptCredential
      .addCase(CredentialsThunks.acceptCredential.rejected, (state, action) => {
        state.error = action.error
      })
  },
})

export { credentialsSlice }
export type { CredentialsState }
