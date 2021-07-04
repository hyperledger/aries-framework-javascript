import type { Handler, HandlerInboundMessage } from '../../../agent/Handler'
import type { MessagePickupService } from '../services'

import { AriesFrameworkError } from '../../../error'
import { BatchPickupMessage } from '../messages'

export class BatchPickupHandler implements Handler {
  private messagePickupService: MessagePickupService
  public supportedMessages = [BatchPickupMessage]

  public constructor(messagePickupService: MessagePickupService) {
    this.messagePickupService = messagePickupService
  }

  public async handle(messageContext: HandlerInboundMessage<BatchPickupHandler>) {
    const { message, connection } = messageContext

    if (!connection) {
      throw new AriesFrameworkError(`No connection associated with incoming message with id ${message.id}`)
    }

    return this.messagePickupService.batch(connection)
  }
}
