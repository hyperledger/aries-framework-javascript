import type { Handler, HandlerInboundMessage } from '../../../agent/Handler'
import type { DiscoverFeaturesService } from '../services/DiscoverFeaturesService'

import { createOutboundMessage } from '../../../agent/helpers'
import { DiscoverFeaturesQueryMessage } from '../messages'

export class QueryMessageHandler implements Handler {
  private discoverFeaturesService: DiscoverFeaturesService
  public supportedMessages = [DiscoverFeaturesQueryMessage]

  public constructor(discoverFeaturesService: DiscoverFeaturesService) {
    this.discoverFeaturesService = discoverFeaturesService
  }

  public async handle(inboundMessage: HandlerInboundMessage<QueryMessageHandler>) {
    const connection = inboundMessage.assertReadyConnection()

    const discloseMessage = await this.discoverFeaturesService.createDisclose(inboundMessage.message)

    return createOutboundMessage(connection, discloseMessage)
  }
}
