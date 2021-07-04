import { Expose, Type } from 'class-transformer'
import {
  Equals,
  IsEnum,
  IsInstance,
  IsInt,
  IsMimeType,
  IsOptional,
  IsString,
  ValidateIf,
  ValidateNested,
} from 'class-validator'

import { JsonTransformer } from '../../../utils/JsonTransformer'
import { PredicateType } from '../models/PredicateType'

import { PresentProofMessageType } from './PresentProofMessageType'

export interface PresentationPreviewAttributeOptions {
  name: string
  credentialDefinitionId?: string
  mimeType?: string
  value?: string
  referent?: string
}

export class PresentationPreviewAttribute {
  public constructor(options: PresentationPreviewAttributeOptions) {
    if (options) {
      this.name = options.name
      this.credentialDefinitionId = options.credentialDefinitionId
      this.mimeType = options.mimeType
      this.value = options.value
      this.referent = options.referent
    }
  }

  public name!: string

  @Expose({ name: 'cred_def_id' })
  @IsString()
  @ValidateIf((o: PresentationPreviewAttribute) => o.referent !== undefined)
  public credentialDefinitionId?: string

  @Expose({ name: 'mime-type' })
  @IsOptional()
  @IsMimeType()
  public mimeType?: string

  @IsString()
  @IsOptional()
  public value?: string

  @IsString()
  @IsOptional()
  public referent?: string

  public toJSON(): Record<string, unknown> {
    return JsonTransformer.toJSON(this)
  }
}

export interface PresentationPreviewPredicateOptions {
  name: string
  credentialDefinitionId: string
  predicate: PredicateType
  threshold: number
}

export class PresentationPreviewPredicate {
  public constructor(options: PresentationPreviewPredicateOptions) {
    if (options) {
      this.name = options.name
      this.credentialDefinitionId = options.credentialDefinitionId
      this.predicate = options.predicate
      this.threshold = options.threshold
    }
  }

  @IsString()
  public name!: string

  @Expose({ name: 'cred_def_id' })
  @IsString()
  public credentialDefinitionId!: string

  @IsEnum(PredicateType)
  public predicate!: PredicateType

  @IsInt()
  public threshold!: number

  public toJSON(): Record<string, unknown> {
    return JsonTransformer.toJSON(this)
  }
}

export interface PresentationPreviewOptions {
  attributes?: PresentationPreviewAttribute[]
  predicates?: PresentationPreviewPredicate[]
}

/**
 * Presentation preview inner message class.
 *
 * This is not a message but an inner object for other messages in this protocol. It is used to construct a preview of the data for the presentation.
 *
 * @see https://github.com/hyperledger/aries-rfcs/blob/master/features/0037-present-proof/README.md#presentation-preview
 */
export class PresentationPreview {
  public constructor(options: PresentationPreviewOptions) {
    if (options) {
      this.attributes = options.attributes ?? []
      this.predicates = options.predicates ?? []
    }
  }

  @Expose({ name: '@type' })
  @Equals(PresentationPreview.type)
  public readonly type = PresentationPreview.type
  public static readonly type = PresentProofMessageType.PresentationPreview

  @Type(() => PresentationPreviewAttribute)
  @ValidateNested({ each: true })
  @IsInstance(PresentationPreviewAttribute, { each: true })
  public attributes!: PresentationPreviewAttribute[]

  @Type(() => PresentationPreviewPredicate)
  @ValidateNested({ each: true })
  @IsInstance(PresentationPreviewPredicate, { each: true })
  public predicates!: PresentationPreviewPredicate[]

  public toJSON(): Record<string, unknown> {
    return JsonTransformer.toJSON(this)
  }
}
