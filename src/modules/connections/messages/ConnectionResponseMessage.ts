import { Type, Expose } from 'class-transformer'
import { Equals, IsInstance, ValidateNested } from 'class-validator'

import { AgentMessage } from '../../../agent/AgentMessage'
import { SignatureDecorator } from '../../../decorators/signature/SignatureDecorator'

import { ConnectionMessageType } from './ConnectionMessageType'

export interface ConnectionResponseMessageOptions {
  id?: string
  threadId: string
  connectionSig: SignatureDecorator
}

/**
 * Message part of connection protocol used to complete the connection
 *
 * @see https://github.com/hyperledger/aries-rfcs/blob/master/features/0160-connection-protocol/README.md#2-connection-response
 */
export class ConnectionResponseMessage extends AgentMessage {
  /**
   * Create new ConnectionResponseMessage instance.
   * @param options
   */
  public constructor(options: ConnectionResponseMessageOptions) {
    super()

    if (options) {
      this.id = options.id || this.generateId()
      this.connectionSig = options.connectionSig

      this.setThread({ threadId: options.threadId })
    }
  }

  @Equals(ConnectionResponseMessage.type)
  public readonly type = ConnectionResponseMessage.type
  public static readonly type = ConnectionMessageType.ConnectionResponse

  @Type(() => SignatureDecorator)
  @ValidateNested()
  @IsInstance(SignatureDecorator)
  @Expose({ name: 'connection~sig' })
  public connectionSig!: SignatureDecorator
}
