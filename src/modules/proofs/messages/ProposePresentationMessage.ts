import { Expose, Type } from 'class-transformer'
import { Equals, IsInstance, IsOptional, IsString, ValidateNested } from 'class-validator'

import { AgentMessage } from '../../../agent/AgentMessage'

import { PresentProofMessageType } from './PresentProofMessageType'
import { PresentationPreview } from './PresentationPreview'

export interface ProposePresentationMessageOptions {
  id?: string
  comment?: string
  presentationProposal: PresentationPreview
}

/**
 * Propose Presentation Message part of Present Proof Protocol used to initiate presentation exchange by holder.
 *
 * @see https://github.com/hyperledger/aries-rfcs/blob/master/features/0037-present-proof/README.md#propose-presentation
 */
export class ProposePresentationMessage extends AgentMessage {
  public constructor(options: ProposePresentationMessageOptions) {
    super()

    if (options) {
      this.id = options.id ?? this.generateId()
      this.comment = options.comment
      this.presentationProposal = options.presentationProposal
    }
  }

  @Equals(ProposePresentationMessage.type)
  public readonly type = ProposePresentationMessage.type
  public static readonly type = PresentProofMessageType.ProposePresentation

  /**
   * Provides some human readable information about the proposed presentation.
   */
  @IsString()
  @IsOptional()
  public comment?: string

  /**
   * Represents the presentation example that prover wants to provide.
   */
  @Expose({ name: 'presentation_proposal' })
  @Type(() => PresentationPreview)
  @ValidateNested()
  @IsInstance(PresentationPreview)
  public presentationProposal!: PresentationPreview
}
