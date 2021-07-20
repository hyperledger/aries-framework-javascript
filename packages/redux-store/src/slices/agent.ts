import type { AgentThunkApiConfig } from '../utils'
import type { SerializedError } from '@reduxjs/toolkit'

import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'

export interface AgentState {
  isInitializing: boolean
  isInitialized: boolean
  error: null | SerializedError
}

const initialState: AgentState = {
  isInitializing: false,
  isInitialized: false,
  error: null,
}

const AgentThunks = {
  initializeAgent: createAsyncThunk<boolean, void, AgentThunkApiConfig>('agent/initialize', async (_, thunkApi) => {
    await thunkApi.extra.agent.initialize()
    return true
  }),
}
const agentSlice = createSlice({
  name: 'agent',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(AgentThunks.initializeAgent.pending, (state) => {
        state.isInitializing = true
      })
      .addCase(AgentThunks.initializeAgent.rejected, (state, action) => {
        state.isInitializing = false
        state.isInitialized = false
        state.error = action.error
      })
      .addCase(AgentThunks.initializeAgent.fulfilled, (state) => {
        state.isInitializing = false
        state.isInitialized = true
      })
  },
})

export { agentSlice, AgentThunks }
