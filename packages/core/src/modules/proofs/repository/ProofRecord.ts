import type { TagsBase } from '../../../storage/BaseRecord'
import type { AutoAcceptProof } from '../ProofAutoAcceptType'
import type { ProofState } from '../ProofState'

import { Type } from 'class-transformer'

import { AriesFrameworkError } from '../../../error'
import { BaseRecord } from '../../../storage/BaseRecord'
import { uuid } from '../../../utils/uuid'
import { ProposePresentationMessage, RequestPresentationMessage, PresentationMessage } from '../messages'

export interface ProofRecordProps {
  id?: string
  createdAt?: Date

  isVerified?: boolean
  state: ProofState
  connectionId?: string
  threadId: string
  presentationId?: string
  tags?: CustomProofTags
  autoAcceptProof?: AutoAcceptProof

  // message data
  proposalMessage?: ProposePresentationMessage
  requestMessage?: RequestPresentationMessage
  presentationMessage?: PresentationMessage
}

export type CustomProofTags = TagsBase
export type DefaultProofTags = {
  threadId: string
  connectionId?: string
  state: ProofState
}

export class ProofRecord extends BaseRecord<DefaultProofTags, CustomProofTags> {
  public connectionId?: string
  public threadId!: string
  public isVerified?: boolean
  public presentationId?: string
  public state!: ProofState
  public autoAcceptProof?: AutoAcceptProof

  // message data
  @Type(() => ProposePresentationMessage)
  public proposalMessage?: ProposePresentationMessage
  @Type(() => RequestPresentationMessage)
  public requestMessage?: RequestPresentationMessage
  @Type(() => PresentationMessage)
  public presentationMessage?: PresentationMessage

  public static readonly type = 'ProofRecord'
  public readonly type = ProofRecord.type

  public constructor(props: ProofRecordProps) {
    super()

    if (props) {
      this.id = props.id ?? uuid()
      this.createdAt = props.createdAt ?? new Date()
      this.proposalMessage = props.proposalMessage
      this.requestMessage = props.requestMessage
      this.presentationMessage = props.presentationMessage
      this.isVerified = props.isVerified
      this.state = props.state
      this.connectionId = props.connectionId
      this.threadId = props.threadId
      this.presentationId = props.presentationId
      this.autoAcceptProof = props.autoAcceptProof
      this._tags = props.tags ?? {}
    }
  }

  public getTags() {
    return {
      ...this._tags,
      threadId: this.threadId,
      connectionId: this.connectionId,
      state: this.state,
    }
  }

  public assertState(expectedStates: ProofState | ProofState[]) {
    if (!Array.isArray(expectedStates)) {
      expectedStates = [expectedStates]
    }

    if (!expectedStates.includes(this.state)) {
      throw new AriesFrameworkError(
        `Proof record is in invalid state ${this.state}. Valid states are: ${expectedStates.join(', ')}.`
      )
    }
  }

  public assertConnection(currentConnectionId: string) {
    if (!this.connectionId) {
      throw new AriesFrameworkError(
        `Proof record is not associated with any connection. This is often the case with connection-less presentation exchange`
      )
    } else if (this.connectionId !== currentConnectionId) {
      throw new AriesFrameworkError(
        `Proof record is associated with connection '${this.connectionId}'. Current connection is '${currentConnectionId}'`
      )
    }
  }
}
