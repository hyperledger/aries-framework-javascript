import { Type, Expose } from 'class-transformer'
import { Equals, Matches, IsArray, ValidateNested, IsObject, IsInstance } from 'class-validator'

import { AgentMessage } from '../../../agent/AgentMessage'
import { MessageIdRegExp } from '../../../agent/BaseMessage'
import { WireMessage } from '../../../types'
import { uuid } from '../../../utils/uuid'

import { RoutingMessageType as MessageType } from './RoutingMessageType'

export class BatchMessageMessage {
  public constructor(options: { id?: string; message: WireMessage }) {
    if (options) {
      this.id = options.id || uuid()
      this.message = options.message
    }
  }

  @Matches(MessageIdRegExp)
  public id!: string

  @IsObject()
  public message!: WireMessage
}

export interface BatchMessageOptions {
  id?: string
  messages: BatchMessageMessage[]
}

/**
 * A message that contains multiple waiting messages.
 *
 * @see https://github.com/hyperledger/aries-rfcs/blob/master/features/0212-pickup/README.md#batch
 */
export class BatchMessage extends AgentMessage {
  public constructor(options: BatchMessageOptions) {
    super()

    if (options) {
      this.id = options.id || this.generateId()
      this.messages = options.messages
    }
  }

  @Equals(BatchMessage.type)
  public readonly type = BatchMessage.type
  public static readonly type = MessageType.Batch

  @Type(() => BatchMessageMessage)
  @IsArray()
  @ValidateNested()
  @IsInstance(BatchMessageMessage, { each: true })
  @Expose({ name: 'messages~attach' })
  public messages!: BatchMessageMessage[]
}
