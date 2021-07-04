import type { IndyProof } from 'indy-sdk'

import { Expose, Type } from 'class-transformer'
import { Equals, IsArray, IsString, ValidateNested, IsOptional, IsInstance } from 'class-validator'

import { AgentMessage } from '../../../agent/AgentMessage'
import { Attachment } from '../../../decorators/attachment/Attachment'
import { JsonEncoder } from '../../../utils/JsonEncoder'

import { PresentProofMessageType } from './PresentProofMessageType'

export const INDY_PROOF_ATTACHMENT_ID = 'libindy-presentation-0'

export interface PresentationOptions {
  id?: string
  comment?: string
  presentationAttachments: Attachment[]
}

/**
 * Presentation Message part of Present Proof Protocol used as a response to a {@link PresentationRequestMessage | Presentation Request Message} from prover to verifier.
 * Contains signed presentations.
 *
 * @see https://github.com/hyperledger/aries-rfcs/blob/master/features/0037-present-proof/README.md#presentation
 */
export class PresentationMessage extends AgentMessage {
  public constructor(options: PresentationOptions) {
    super()

    if (options) {
      this.id = options.id ?? this.generateId()
      this.comment = options.comment
      this.presentationAttachments = options.presentationAttachments
    }
  }

  @Equals(PresentationMessage.type)
  public readonly type = PresentationMessage.type
  public static readonly type = PresentProofMessageType.Presentation

  /**
   *  Provides some human readable information about this request for a presentation.
   */
  @IsOptional()
  @IsString()
  public comment?: string

  /**
   * An array of attachments containing the presentation in the requested format(s).
   */
  @Expose({ name: 'presentations~attach' })
  @Type(() => Attachment)
  @IsArray()
  @ValidateNested({
    each: true,
  })
  @IsInstance(Attachment, { each: true })
  public presentationAttachments!: Attachment[]

  public get indyProof(): IndyProof | null {
    const attachment = this.presentationAttachments.find((attachment) => attachment.id === INDY_PROOF_ATTACHMENT_ID)

    // Return null if attachment is not found
    if (!attachment?.data?.base64) {
      return null
    }

    const proofJson = JsonEncoder.fromBase64(attachment.data.base64)

    return proofJson
  }
}
