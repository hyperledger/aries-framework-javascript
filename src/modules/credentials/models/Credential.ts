import type { IndyCredential } from 'indy-sdk'

import { Expose, Type } from 'class-transformer'
import { IsInstance, IsOptional, ValidateNested } from 'class-validator'

import { JsonTransformer } from '../../../utils/JsonTransformer'

import { IndyCredentialInfo } from './IndyCredentialInfo'
import { RevocationInterval } from './RevocationInterval'

export class Credential {
  public constructor(options: Credential) {
    if (options) {
      this.credentialInfo = options.credentialInfo
      this.interval = options.interval
    }
  }

  @Expose({ name: 'cred_info' })
  @Type(() => IndyCredentialInfo)
  @ValidateNested()
  @IsInstance(IndyCredentialInfo)
  public credentialInfo!: IndyCredentialInfo

  @IsOptional()
  @Type(() => RevocationInterval)
  @ValidateNested()
  @IsInstance(RevocationInterval)
  public interval?: RevocationInterval

  public toJSON(): IndyCredential {
    return JsonTransformer.toJSON(this) as unknown as IndyCredential
  }
}
