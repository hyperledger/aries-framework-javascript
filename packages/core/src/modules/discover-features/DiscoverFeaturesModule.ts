import { Lifecycle, scoped } from 'tsyringe'

import { Dispatcher } from '../../agent/Dispatcher'
import { MessageSender } from '../../agent/MessageSender'
import { createOutboundMessage } from '../../agent/helpers'
import { ConnectionService } from '../connections/services'

import { DiscloseMessageHandler, QueryMessageHandler } from './handlers'
import { DiscoverFeaturesService } from './services'

@scoped(Lifecycle.ContainerScoped)
export class DiscoverFeaturesModule {
  private connectionService: ConnectionService
  private messageSender: MessageSender
  private discoverFeaturesService: DiscoverFeaturesService

  public constructor(
    dispatcher: Dispatcher,
    connectionService: ConnectionService,
    messageSender: MessageSender,
    discoverFeaturesService: DiscoverFeaturesService
  ) {
    this.connectionService = connectionService
    this.messageSender = messageSender
    this.discoverFeaturesService = discoverFeaturesService
    this.registerHandlers(dispatcher)
  }

  public async queryFeatures(connectionId: string, options: { query: string; comment?: string }) {
    const connection = await this.connectionService.getById(connectionId)

    const queryMessage = await this.discoverFeaturesService.createQuery(options)

    const outbound = createOutboundMessage(connection, queryMessage)
    await this.messageSender.sendMessage(outbound)
  }

  private registerHandlers(dispatcher: Dispatcher) {
    dispatcher.registerHandler(new DiscloseMessageHandler())
    dispatcher.registerHandler(new QueryMessageHandler(this.discoverFeaturesService))
  }
}
