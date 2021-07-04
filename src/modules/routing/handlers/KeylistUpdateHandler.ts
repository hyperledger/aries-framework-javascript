import type { Handler, HandlerInboundMessage } from '../../../agent/Handler'
import type { ProviderRoutingService } from '../services'

import { createOutboundMessage } from '../../../agent/helpers'
import { AriesFrameworkError } from '../../../error'
import { KeylistUpdateMessage } from '../messages'

export class KeylistUpdateHandler implements Handler {
  private routingService: ProviderRoutingService
  public supportedMessages = [KeylistUpdateMessage]

  public constructor(routingService: ProviderRoutingService) {
    this.routingService = routingService
  }

  public async handle(messageContext: HandlerInboundMessage<KeylistUpdateHandler>) {
    const { message, connection } = messageContext

    if (!connection) {
      throw new AriesFrameworkError(`No connection associated with incoming message with id ${message.id}`)
    }

    const updateMessage = this.routingService.updateRoutes(messageContext)
    return createOutboundMessage(connection, updateMessage)
  }
}
