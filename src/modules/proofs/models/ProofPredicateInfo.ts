import { Expose, Type } from 'class-transformer'
import { IsEnum, IsInstance, IsInt, IsOptional, IsString, ValidateNested } from 'class-validator'

import { RevocationInterval } from '../../credentials'

import { AttributeFilter } from './AttributeFilter'
import { PredicateType } from './PredicateType'

export class ProofPredicateInfo {
  public constructor(options: ProofPredicateInfo) {
    if (options) {
      this.name = options.name
      this.nonRevoked = options.nonRevoked
      this.restrictions = options.restrictions
      this.predicateType = options.predicateType
      this.predicateValue = options.predicateValue
    }
  }

  @IsString()
  public name!: string

  @Expose({ name: 'p_type' })
  @IsEnum(PredicateType)
  public predicateType!: PredicateType

  @Expose({ name: 'p_value' })
  @IsInt()
  public predicateValue!: number

  @Expose({ name: 'non_revoked' })
  @ValidateNested()
  @Type(() => RevocationInterval)
  @IsOptional()
  @IsInstance(RevocationInterval)
  public nonRevoked?: RevocationInterval

  @ValidateNested({ each: true })
  @Type(() => AttributeFilter)
  @IsOptional()
  @IsInstance(AttributeFilter, { each: true })
  public restrictions?: AttributeFilter[]
}
