import type * as Indy from 'indy-sdk'

import { Lifecycle, scoped } from 'tsyringe'

import { AgentConfig } from '../../../agent/AgentConfig'
import { IndySdkError } from '../../../error'
import { isIndyError } from '../../../utils/indyError'
import { IndyWallet } from '../../../wallet/IndyWallet'

@scoped(Lifecycle.ContainerScoped)
export class IndyHolderService {
  private indy: typeof Indy
  private indyWallet: IndyWallet

  public constructor(agentConfig: AgentConfig, indyWallet: IndyWallet) {
    this.indy = agentConfig.agentDependencies.indy
    this.indyWallet = indyWallet
  }

  public async createProof({
    proofRequest,
    requestedCredentials,
    schemas,
    credentialDefinitions,
    revocationStates = {},
  }: CreateProofOptions) {
    try {
      return await this.indy.proverCreateProof(
        this.indyWallet.walletHandle,
        proofRequest,
        requestedCredentials,
        this.indyWallet.masterSecretId,
        schemas,
        credentialDefinitions,
        revocationStates
      )
    } catch (error) {
      throw new IndySdkError(error)
    }
  }

  /**
   * Store a credential in the wallet.
   *
   * @returns The credential id
   */
  public async storeCredential({
    credentialRequestMetadata,
    credential,
    credentialDefinition,
    credentialId,
    revocationRegistryDefinitions,
  }: StoreCredentialOptions): Promise<Indy.CredentialId> {
    try {
      return await this.indy.proverStoreCredential(
        this.indyWallet.walletHandle,
        credentialId ?? null,
        credentialRequestMetadata,
        credential,
        credentialDefinition,
        revocationRegistryDefinitions ?? null
      )
    } catch (error) {
      throw new IndySdkError(error)
    }
  }

  /**
   * Get a credential stored in the wallet by id.
   *
   * @param credentialId the id (referent) of the credential
   * @throws {Error} if the credential is not found
   * @returns the credential
   *
   * @todo handle record not found
   */
  public async getCredential(credentialId: Indy.CredentialId): Promise<Indy.IndyCredentialInfo> {
    try {
      return await this.indy.proverGetCredential(this.indyWallet.walletHandle, credentialId)
    } catch (error) {
      throw new IndySdkError(error)
    }
  }

  /**
   * Create a credential request for the given credential offer.
   *
   * @returns The credential request and the credential request metadata
   */
  public async createCredentialRequest({
    holderDid,
    credentialOffer,
    credentialDefinition,
  }: CreateCredentialRequestOptions): Promise<[Indy.CredReq, Indy.CredReqMetadata]> {
    try {
      return await this.indy.proverCreateCredentialReq(
        this.indyWallet.walletHandle,
        holderDid,
        credentialOffer,
        credentialDefinition,
        this.indyWallet.masterSecretId
      )
    } catch (error) {
      throw new IndySdkError(error)
    }
  }

  /**
   * Retrieve the credentials that are available for an attribute referent in the proof request.
   *
   * @param proofRequest The proof request to retrieve the credentials for
   * @param attributeReferent An attribute referent from the proof request to retrieve the credentials for
   * @param start Starting index
   * @param limit Maximum number of records to return
   *
   * @returns List of credentials that are available for building a proof for the given proof request
   *
   */
  public async getCredentialsForProofRequest({
    proofRequest,
    attributeReferent,
    start = 0,
    limit = 256,
    extraQuery,
  }: GetCredentialForProofRequestOptions): Promise<Indy.IndyCredential[]> {
    try {
      // Open indy credential search
      const searchHandle = await this.indy.proverSearchCredentialsForProofReq(
        this.indyWallet.walletHandle,
        proofRequest,
        extraQuery ?? null
      )

      try {
        // Make sure database cursors start at 'start' (bit ugly, but no way around in indy)
        if (start > 0) {
          await this.fetchCredentialsForReferent(searchHandle, attributeReferent, start)
        }

        // Fetch the credentials
        const credentials = await this.fetchCredentialsForReferent(searchHandle, attributeReferent, limit)

        // TODO: sort the credentials (irrevocable first)
        return credentials
      } finally {
        // Always close search
        await this.indy.proverCloseCredentialsSearchForProofReq(searchHandle)
      }
    } catch (error) {
      if (isIndyError(error)) {
        throw new IndySdkError(error)
      }

      throw error
    }
  }

  private async fetchCredentialsForReferent(searchHandle: number, referent: string, limit?: number) {
    try {
      let credentials: Indy.IndyCredential[] = []

      // Allow max of 256 per fetch operation
      const chunk = limit ? Math.min(256, limit) : 256

      // Loop while limit not reached (or no limit specified)
      while (!limit || credentials.length < limit) {
        // Retrieve credentials
        const credentialsJson = await this.indy.proverFetchCredentialsForProofReq(searchHandle, referent, chunk)
        credentials = [...credentials, ...credentialsJson]

        // If the number of credentials returned is less than chunk
        // It means we reached the end of the iterator (no more credentials)
        if (credentialsJson.length < chunk) {
          return credentials
        }
      }

      return credentials
    } catch (error) {
      throw new IndySdkError(error)
    }
  }
}

export interface GetCredentialForProofRequestOptions {
  proofRequest: Indy.IndyProofRequest
  attributeReferent: string
  start?: number
  limit?: number
  extraQuery?: Indy.ReferentWalletQuery
}

export interface CreateCredentialRequestOptions {
  holderDid: string
  credentialOffer: Indy.CredOffer
  credentialDefinition: Indy.CredDef
}

export interface StoreCredentialOptions {
  credentialRequestMetadata: Indy.CredReqMetadata
  credential: Indy.Cred
  credentialDefinition: Indy.CredDef
  credentialId?: Indy.CredentialId
  revocationRegistryDefinitions?: Indy.RevRegsDefs
}

export interface CreateProofOptions {
  proofRequest: Indy.IndyProofRequest
  requestedCredentials: Indy.IndyRequestedCredentials
  schemas: Indy.Schemas
  credentialDefinitions: Indy.CredentialDefs
  revocationStates?: Indy.RevStates
}
