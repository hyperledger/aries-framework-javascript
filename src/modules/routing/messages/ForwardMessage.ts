import { Expose } from 'class-transformer'
import { Equals, IsObject, IsString } from 'class-validator'

import { AgentMessage } from '../../../agent/AgentMessage'

import { RoutingMessageType as MessageType } from './RoutingMessageType'

export interface ForwardMessageOptions {
  id?: string
  to: string
  message: JsonWebKey
}

/**
 * @see https://github.com/hyperledger/aries-rfcs/blob/master/concepts/0094-cross-domain-messaging/README.md#corerouting10forward
 */
export class ForwardMessage extends AgentMessage {
  /**
   * Create new ForwardMessage instance.
   *
   * @param options
   */
  public constructor(options: ForwardMessageOptions) {
    super()

    if (options) {
      this.id = options.id || this.generateId()
      this.to = options.to
      this.message = options.message
    }
  }

  @Equals(ForwardMessage.type)
  public readonly type = ForwardMessage.type
  public static readonly type = MessageType.ForwardMessage

  @IsString()
  public to!: string

  @Expose({ name: 'msg' })
  @IsObject()
  public message!: JsonWebKey
}
