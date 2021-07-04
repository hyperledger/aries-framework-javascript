import { Expose, Type } from 'class-transformer'
import { Equals, IsArray, IsString, ValidateNested, IsOptional, IsInstance } from 'class-validator'

import { AgentMessage } from '../../../agent/AgentMessage'
import { Attachment } from '../../../decorators/attachment/Attachment'
import { JsonEncoder } from '../../../utils/JsonEncoder'
import { JsonTransformer } from '../../../utils/JsonTransformer'
import { ProofRequest } from '../models'

import { PresentProofMessageType } from './PresentProofMessageType'

export interface RequestPresentationOptions {
  id?: string
  comment?: string
  requestPresentationAttachments: Attachment[]
}

export const INDY_PROOF_REQUEST_ATTACHMENT_ID = 'libindy-request-presentation-0'

/**
 * Request Presentation Message part of Present Proof Protocol used to initiate request from verifier to prover.
 *
 * @see https://github.com/hyperledger/aries-rfcs/blob/master/features/0037-present-proof/README.md#request-presentation
 */
export class RequestPresentationMessage extends AgentMessage {
  public constructor(options: RequestPresentationOptions) {
    super()

    if (options) {
      this.id = options.id ?? this.generateId()
      this.comment = options.comment
      this.requestPresentationAttachments = options.requestPresentationAttachments
    }
  }

  @Equals(RequestPresentationMessage.type)
  public readonly type = RequestPresentationMessage.type
  public static readonly type = PresentProofMessageType.RequestPresentation

  /**
   *  Provides some human readable information about this request for a presentation.
   */
  @IsOptional()
  @IsString()
  public comment?: string

  /**
   * An array of attachments defining the acceptable formats for the presentation.
   */
  @Expose({ name: 'request_presentations~attach' })
  @Type(() => Attachment)
  @IsArray()
  @ValidateNested({
    each: true,
  })
  @IsInstance(Attachment, { each: true })
  public requestPresentationAttachments!: Attachment[]

  public get indyProofRequest(): ProofRequest | null {
    const attachment = this.requestPresentationAttachments.find(
      (attachment) => attachment.id === INDY_PROOF_REQUEST_ATTACHMENT_ID
    )

    // Return null if attachment is not found
    if (!attachment?.data?.base64) {
      return null
    }

    // Extract proof request from attachment
    const proofRequestJson = JsonEncoder.fromBase64(attachment.data.base64)
    const proofRequest = JsonTransformer.fromJSON(proofRequestJson, ProofRequest)

    return proofRequest
  }
}
