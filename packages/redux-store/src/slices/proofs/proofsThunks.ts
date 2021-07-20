import type { ClassMethodParameters } from '../../utils'
import type { RequestedCredentials, ProofsModule, RetrievedCredentials } from '@aries-framework/core'

import { createAsyncAgentThunk } from '../../utils'

/**
 * Namespace containing all **proof** related actions.
 */
const ProofsThunks = {
  /**
   * Retrieve all ProofRecords
   */
  getAllProofs: createAsyncAgentThunk('proofs/getAll', async (_, thunkApi) => {
    return thunkApi.extra.agent.proofs.getAll()
  }),

  /**
   * Initiate a new presentation exchange as prover by sending a presentation proposal message
   * to the connection with the specified connection id.
   */
  proposeProof: createAsyncAgentThunk(
    'proofs/proposeProof',
    async (
      {
        connectionId,
        presentationProposal,
        config,
      }: {
        connectionId: string
        presentationProposal: ClassMethodParameters<typeof ProofsModule, 'proposeProof'>[1]
        config?: ClassMethodParameters<typeof ProofsModule, 'proposeProof'>[2]
      },
      thunkApi
    ) => {
      return thunkApi.extra.agent.proofs.proposeProof(connectionId, presentationProposal, config)
    }
  ),
  /**
   * Accept a presentation proposal as verifier (by sending a presentation request message) to the connection
   * associated with the proof record.
   */
  acceptProposal: createAsyncAgentThunk(
    'proofs/acceptProposal',
    async (
      {
        proofRecordId,
        config,
      }: {
        proofRecordId: string
        config?: ClassMethodParameters<typeof ProofsModule, 'acceptProposal'>[1]
      },
      thunkApi
    ) => {
      return thunkApi.extra.agent.proofs.acceptProposal(proofRecordId, config)
    }
  ),
  /**
   * Initiate a new presentation exchange as verifier by sending a presentation request message
   * to the connection with the specified connection id.
   */
  requestProof: createAsyncAgentThunk(
    'proofs/requestProof',
    async (
      {
        connectionId,
        proofRequestOptions,
        config,
      }: {
        connectionId: string
        proofRequestOptions: ClassMethodParameters<typeof ProofsModule, 'requestProof'>[1]
        config?: ClassMethodParameters<typeof ProofsModule, 'requestProof'>[2]
      },
      thunkApi
    ) => {
      return thunkApi.extra.agent.proofs.requestProof(connectionId, proofRequestOptions, config)
    }
  ),

  /**
   * Accept a presentation request as prover (by sending a presentation message) to the connection
   * associated with the proof record.
   */
  acceptRequest: createAsyncAgentThunk(
    'proofs/acceptRequest',
    async (
      {
        proofRecordId,
        requestedCredentials,
        config,
      }: {
        proofRecordId: string
        requestedCredentials: ClassMethodParameters<typeof ProofsModule, 'acceptRequest'>[1]
        config?: ClassMethodParameters<typeof ProofsModule, 'acceptRequest'>[2]
      },
      thunkApi
    ) => {
      return thunkApi.extra.agent.proofs.acceptRequest(proofRecordId, requestedCredentials, config)
    }
  ),

  /**
   * Accept a presentation as prover (by sending a presentation acknowledgement message) to the connection
   * associated with the proof record.
   */
  acceptPresentation: createAsyncAgentThunk('proofs/acceptPresentation', async (proofRecordId: string, thunkApi) => {
    return thunkApi.extra.agent.proofs.acceptPresentation(proofRecordId)
  }),

  /**
   * Create a {@link RetrievedCredentials} object. Given input proof request and presentation proposal,
   * use credentials in the wallet to build indy requested credentials object for input to proof creation.
   * If restrictions allow, self attested attributes will be used.
   */
  getRequestedCredentialsForProofRequest: createAsyncAgentThunk(
    'proofs/getRequestedCredentialsForProofRequest',
    async (
      {
        proofRequest,
        presentationProposal,
      }: {
        proofRequest: ClassMethodParameters<typeof ProofsModule, 'getRequestedCredentialsForProofRequest'>[0]
        presentationProposal?: ClassMethodParameters<typeof ProofsModule, 'getRequestedCredentialsForProofRequest'>[1]
      },
      thunkApi
    ): Promise<RetrievedCredentials> => {
      return thunkApi.extra.agent.proofs.getRequestedCredentialsForProofRequest(proofRequest, presentationProposal)
    }
  ),

  /**
   * Create a RequestedCredentials object. Given input proof request and presentation proposal,
   * use credentials in the wallet to build indy requested credentials object for input to proof creation.
   * If restrictions allow, self attested attributes will be used.
   */
  autoSelectCredentialsForProofRequest: createAsyncAgentThunk(
    'proofs/autoSelectCredentialsForProofRequest',
    async (
      retrievedCredentials: ClassMethodParameters<typeof ProofsModule, 'autoSelectCredentialsForProofRequest'>[0],

      thunkApi
    ): Promise<RequestedCredentials> => {
      return thunkApi.extra.agent.proofs.autoSelectCredentialsForProofRequest(retrievedCredentials)
    }
  ),
}

export { ProofsThunks }
