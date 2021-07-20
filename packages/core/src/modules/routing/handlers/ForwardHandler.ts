import type { Handler, HandlerInboundMessage } from '../../../agent/Handler'
import type { MessageSender } from '../../../agent/MessageSender'
import type { ConnectionService } from '../../connections/services'
import type { MediatorService } from '../services'

import { ForwardMessage } from '../messages'

export class ForwardHandler implements Handler {
  private mediatorService: MediatorService
  private connectionService: ConnectionService
  private messageSender: MessageSender

  public supportedMessages = [ForwardMessage]

  public constructor(
    mediatorService: MediatorService,
    connectionService: ConnectionService,
    messageSender: MessageSender
  ) {
    this.mediatorService = mediatorService
    this.connectionService = connectionService
    this.messageSender = messageSender
  }

  public async handle(messageContext: HandlerInboundMessage<ForwardHandler>) {
    const { packedMessage, mediationRecord } = await this.mediatorService.processForwardMessage(messageContext)

    const connectionRecord = await this.connectionService.getById(mediationRecord.connectionId)

    // The message inside the forward message is packed so we just send the packed
    // message to the connection associated with it
    await this.messageSender.sendPackage({ connection: connectionRecord, packedMessage })
  }
}
