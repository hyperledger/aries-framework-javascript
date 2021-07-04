import type { IndyProofRequest } from 'indy-sdk'

import { Expose, Type } from 'class-transformer'
import { IsString, ValidateNested, IsOptional, IsIn, IsInstance } from 'class-validator'

import { JsonTransformer } from '../../../utils/JsonTransformer'
import { RevocationInterval } from '../../credentials'

import { ProofAttributeInfo } from './ProofAttributeInfo'
import { ProofPredicateInfo } from './ProofPredicateInfo'

export interface ProofRequestOptions {
  name: string
  version: string
  nonce: string
  nonRevoked?: RevocationInterval
  ver?: '1.0' | '2.0'
  requestedAttributes?: Record<string, ProofAttributeInfo>
  requestedPredicates?: Record<string, ProofPredicateInfo>
}

/**
 * Proof Request for Indy based proof format
 *
 * @see https://github.com/hyperledger/indy-sdk/blob/57dcdae74164d1c7aa06f2cccecaae121cefac25/libindy/src/api/anoncreds.rs#L1222-L1239
 */
export class ProofRequest {
  public constructor(options: ProofRequestOptions) {
    if (options) {
      this.name = options.name
      this.version = options.version
      this.nonce = options.nonce
      this.nonRevoked = options.nonRevoked
      this.ver = options.ver

      // For convenience we allow records to be passed instead of maps
      this.requestedAttributes = options.requestedAttributes
        ? new Map(Object.entries(options.requestedAttributes))
        : new Map()
      this.requestedPredicates = options.requestedPredicates
        ? new Map(Object.entries(options.requestedPredicates))
        : new Map()
    }
  }

  @IsString()
  public name!: string

  @IsString()
  public version!: string

  @IsString()
  public nonce!: string

  @Expose({ name: 'requested_attributes' })
  @ValidateNested({ each: true })
  @Type(() => ProofAttributeInfo)
  @IsInstance(ProofAttributeInfo, { each: true })
  public requestedAttributes!: Map<string, ProofAttributeInfo>

  @Expose({ name: 'requested_predicates' })
  @ValidateNested({ each: true })
  @Type(() => ProofPredicateInfo)
  @IsInstance(ProofPredicateInfo, { each: true })
  public requestedPredicates!: Map<string, ProofPredicateInfo>

  @Expose({ name: 'non_revoked' })
  @ValidateNested()
  @Type(() => RevocationInterval)
  @IsOptional()
  @IsInstance(RevocationInterval)
  public nonRevoked?: RevocationInterval

  @IsIn(['1.0', '2.0'])
  @IsOptional()
  public ver?: '1.0' | '2.0'

  public toJSON() {
    // IndyProofRequest is indy-sdk json type
    return JsonTransformer.toJSON(this) as unknown as IndyProofRequest
  }
}
