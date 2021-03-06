import type { AgentConfig } from '../../../agent/AgentConfig'
import type { Handler, HandlerInboundMessage } from '../../../agent/Handler'
import type { ConnectionService } from '../services/ConnectionService'

import { createOutboundMessage } from '../../../agent/helpers'
import { AriesFrameworkError } from '../../../error'
import { ConnectionRequestMessage } from '../messages'

export class ConnectionRequestHandler implements Handler {
  private connectionService: ConnectionService
  private agentConfig: AgentConfig
  public supportedMessages = [ConnectionRequestMessage]

  public constructor(connectionService: ConnectionService, agentConfig: AgentConfig) {
    this.connectionService = connectionService
    this.agentConfig = agentConfig
  }

  public async handle(messageContext: HandlerInboundMessage<ConnectionRequestHandler>) {
    if (!messageContext.connection) {
      throw new AriesFrameworkError(`Connection for verkey ${messageContext.recipientVerkey} not found!`)
    }

    await this.connectionService.processRequest(messageContext)

    if (messageContext.connection?.autoAcceptConnection ?? this.agentConfig.autoAcceptConnections) {
      const { message } = await this.connectionService.createResponse(messageContext.connection.id)
      return createOutboundMessage(messageContext.connection, message)
    }
  }
}
