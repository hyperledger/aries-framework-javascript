import { Expose, Type } from 'class-transformer'
import {
  IsBase64,
  IsDate,
  IsHash,
  IsInstance,
  IsInt,
  IsMimeType,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator'

import { uuid } from '../../utils/uuid'

export interface AttachmentOptions {
  id?: string
  description?: string
  filename?: string
  mimeType?: string
  lastmodTime?: Date
  byteCount?: number
  data: AttachmentData
}

export interface AttachmentDataOptions {
  base64?: string
  json?: Record<string, unknown>
  links?: string[]
  jws?: Record<string, unknown>
  sha256?: string
}

/**
 * A JSON object that gives access to the actual content of the attachment
 */
export class AttachmentData {
  public constructor(options: AttachmentDataOptions) {
    if (options) {
      this.base64 = options.base64
      this.json = options.json
      this.links = options.links
      this.jws = options.jws
      this.sha256 = options.sha256
    }
  }

  /**
   * Base64-encoded data, when representing arbitrary content inline instead of via links. Optional.
   */
  @IsOptional()
  @IsBase64()
  public base64?: string

  /**
   *  Directly embedded JSON data, when representing content inline instead of via links, and when the content is natively conveyable as JSON. Optional.
   */
  @IsOptional()
  public json?: Record<string, unknown>

  /**
   * A list of zero or more locations at which the content may be fetched. Optional.
   */
  @IsOptional()
  @IsString({ each: true })
  public links?: string[]

  /**
   * A JSON Web Signature over the content of the attachment. Optional.
   */
  @IsOptional()
  public jws?: Record<string, unknown>

  /**
   * The hash of the content. Optional.
   */
  @IsOptional()
  @IsHash('sha256')
  public sha256?: string
}

/**
 * Represents DIDComm attachment
 * https://github.com/hyperledger/aries-rfcs/blob/master/concepts/0017-attachments/README.md
 */
export class Attachment {
  public constructor(options: AttachmentOptions) {
    if (options) {
      this.id = options.id ?? uuid()
      this.description = options.description
      this.filename = options.filename
      this.mimeType = options.mimeType
      this.lastmodTime = options.lastmodTime
      this.byteCount = options.byteCount
      this.data = options.data
    }
  }

  @Expose({ name: '@id' })
  public id!: string

  /**
   * An optional human-readable description of the content.
   */
  @IsOptional()
  @IsString()
  public description?: string

  /**
   * A hint about the name that might be used if this attachment is persisted as a file. It is not required, and need not be unique. If this field is present and mime-type is not, the extension on the filename may be used to infer a MIME type.
   */
  @IsOptional()
  @IsString()
  public filename?: string

  /**
   * Describes the MIME type of the attached content. Optional but recommended.
   */
  @Expose({ name: 'mime-type' })
  @IsOptional()
  @IsMimeType()
  public mimeType?: string

  /**
   * A hint about when the content in this attachment was last modified.
   */
  @Expose({ name: 'lastmod_time' })
  @Type(() => Date)
  @IsOptional()
  @IsDate()
  public lastmodTime?: Date

  /**
   * Optional, and mostly relevant when content is included by reference instead of by value. Lets the receiver guess how expensive it will be, in time, bandwidth, and storage, to fully fetch the attachment.
   */
  @Expose({ name: 'byte_count' })
  @IsOptional()
  @IsInt()
  public byteCount?: number

  @Type(() => AttachmentData)
  @ValidateNested()
  @IsInstance(AttachmentData)
  public data!: AttachmentData
}
