import type Indy from 'indy-sdk'

import { inject, Lifecycle, scoped } from 'tsyringe'

import { InjectionSymbols } from '../../../constants'
import { IndySdkError } from '../../../error'

@scoped(Lifecycle.ContainerScoped)
export class IndyVerifierService {
  private indy: typeof Indy

  public constructor(@inject(InjectionSymbols.Indy) indy: typeof Indy) {
    this.indy = indy
  }

  public async verifyProof({
    proofRequest,
    proof,
    schemas,
    credentialDefinitions,
    revocationRegistryDefinitions = {},
    revocationStates = {},
  }: VerifyProofOptions): Promise<boolean> {
    try {
      return await this.indy.verifierVerifyProof(
        proofRequest,
        proof,
        schemas,
        credentialDefinitions,
        revocationRegistryDefinitions,
        revocationStates
      )
    } catch (error) {
      throw new IndySdkError(error)
    }
  }
}

export interface VerifyProofOptions {
  proofRequest: Indy.IndyProofRequest
  proof: Indy.IndyProof
  schemas: Indy.Schemas
  credentialDefinitions: Indy.CredentialDefs
  revocationRegistryDefinitions?: Indy.RevRegsDefs
  revocationStates?: Indy.RevStates
}
