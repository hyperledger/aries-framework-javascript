import { Expose, Type } from 'class-transformer'
import { IsString, IsOptional, IsArray, ValidateNested, IsInstance } from 'class-validator'

import { RevocationInterval } from '../../credentials'

import { AttributeFilter } from './AttributeFilter'

export class ProofAttributeInfo {
  public constructor(options: ProofAttributeInfo) {
    if (options) {
      this.name = options.name
      this.names = options.names
      this.nonRevoked = options.nonRevoked
      this.restrictions = options.restrictions
    }
  }

  @IsString()
  @IsOptional()
  public name?: string

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  public names?: string[]

  @Expose({ name: 'non_revoked' })
  @ValidateNested()
  @IsInstance(RevocationInterval)
  @Type(() => RevocationInterval)
  @IsOptional()
  public nonRevoked?: RevocationInterval

  @ValidateNested({ each: true })
  @Type(() => AttributeFilter)
  @IsOptional()
  @IsInstance(AttributeFilter, { each: true })
  public restrictions?: AttributeFilter[]
}
