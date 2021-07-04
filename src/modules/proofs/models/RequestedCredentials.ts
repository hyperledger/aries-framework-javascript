import type { IndyRequestedCredentials } from 'indy-sdk'

import { Expose, Type } from 'class-transformer'
import { IsInstance, IsObject, IsString, ValidateNested } from 'class-validator'

import { JsonTransformer } from '../../../utils/JsonTransformer'

import { RequestedAttribute } from './RequestedAttribute'
import { RequestedPredicate } from './RequestedPredicate'

interface RequestedCredentialsOptions {
  requestedAttributes?: Record<string, RequestedAttribute>
  requestedPredicates?: Record<string, RequestedPredicate>
  selfAttestedAttributes?: Record<string, string>
}

/**
 * Requested Credentials for Indy proof creation
 *
 * @see https://github.com/hyperledger/indy-sdk/blob/57dcdae74164d1c7aa06f2cccecaae121cefac25/libindy/src/api/anoncreds.rs#L1433-L1445
 */
export class RequestedCredentials {
  public constructor(options: RequestedCredentialsOptions = {}) {
    if (options) {
      // For convenience we allow records to be passed instead of maps
      this.requestedAttributes = options.requestedAttributes
        ? new Map(Object.entries(options.requestedAttributes))
        : new Map()
      this.requestedPredicates = options.requestedPredicates
        ? new Map(Object.entries(options.requestedPredicates))
        : new Map()
      this.selfAttestedAttributes = options.selfAttestedAttributes
        ? new Map(Object.entries(options.selfAttestedAttributes))
        : new Map()
    }
  }

  @Expose({ name: 'requested_attributes' })
  @ValidateNested({ each: true })
  @Type(() => RequestedAttribute)
  @IsInstance(RequestedAttribute, { each: true })
  public requestedAttributes!: Map<string, RequestedAttribute>

  @Expose({ name: 'requested_predicates' })
  @ValidateNested({ each: true })
  @Type(() => RequestedPredicate)
  @IsInstance(RequestedPredicate, { each: true })
  public requestedPredicates!: Map<string, RequestedPredicate>

  @Expose({ name: 'self_attested_attributes' })
  @IsString({ each: true })
  @IsObject()
  public selfAttestedAttributes!: Map<string, string>

  public toJSON() {
    // IndyRequestedCredentials is indy-sdk json type
    return JsonTransformer.toJSON(this) as unknown as IndyRequestedCredentials
  }

  public getCredentialIdentifiers(): string[] {
    const credIds = new Set<string>()

    this.requestedAttributes.forEach((attr) => {
      credIds.add(attr.credentialId)
    })

    this.requestedPredicates.forEach((pred) => {
      credIds.add(pred.credentialId)
    })

    return Array.from(credIds)
  }
}
