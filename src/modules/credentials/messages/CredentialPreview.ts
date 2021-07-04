import { Expose, Type } from 'class-transformer'
import { Equals, IsInstance, IsMimeType, IsOptional, IsString, ValidateNested } from 'class-validator'

import { JsonTransformer } from '../../../utils/JsonTransformer'

import { IssueCredentialMessageType } from './IssueCredentialMessageType'

interface CredentialPreviewAttributeOptions {
  name: string
  mimeType?: string
  value: string
}

export class CredentialPreviewAttribute {
  public constructor(options: CredentialPreviewAttributeOptions) {
    if (options) {
      this.name = options.name
      this.mimeType = options.mimeType
      this.value = options.value
    }
  }

  @IsString()
  public name!: string

  @Expose({ name: 'mime-type' })
  @IsOptional()
  @IsMimeType()
  public mimeType?: string

  @IsString()
  public value!: string

  public toJSON(): Record<string, unknown> {
    return JsonTransformer.toJSON(this)
  }
}

export interface CredentialPreviewOptions {
  attributes: CredentialPreviewAttribute[]
}

/**
 * Credential preview inner message class.
 *
 * This is not a message but an inner object for other messages in this protocol. It is used construct a preview of the data for the credential.
 *
 * @see https://github.com/hyperledger/aries-rfcs/blob/master/features/0036-issue-credential/README.md#preview-credential
 */
export class CredentialPreview {
  public constructor(options: CredentialPreviewOptions) {
    if (options) {
      this.attributes = options.attributes
    }
  }

  @Expose({ name: '@type' })
  @Equals(CredentialPreview.type)
  public readonly type = CredentialPreview.type
  public static readonly type = IssueCredentialMessageType.CredentialPreview

  @Type(() => CredentialPreviewAttribute)
  @ValidateNested({ each: true })
  @IsInstance(CredentialPreviewAttribute, { each: true })
  public attributes!: CredentialPreviewAttribute[]

  public toJSON(): Record<string, unknown> {
    return JsonTransformer.toJSON(this)
  }
}
