import type { AgentConfig } from '../../../agent/AgentConfig'
import type { Handler, HandlerInboundMessage } from '../../../agent/Handler'
import type { CredentialResponseCoordinator } from '../CredentialResponseCoordinator'
import type { CredentialRecord } from '../repository/CredentialRecord'
import type { CredentialService } from '../services'

import { createOutboundMessage, createOutboundServiceMessage } from '../../../agent/helpers'
import { RequestCredentialMessage } from '../messages'

export class RequestCredentialHandler implements Handler {
  private agentConfig: AgentConfig
  private credentialService: CredentialService
  private credentialResponseCoordinator: CredentialResponseCoordinator
  public supportedMessages = [RequestCredentialMessage]

  public constructor(
    credentialService: CredentialService,
    agentConfig: AgentConfig,
    credentialResponseCoordinator: CredentialResponseCoordinator
  ) {
    this.credentialService = credentialService
    this.agentConfig = agentConfig
    this.credentialResponseCoordinator = credentialResponseCoordinator
  }

  public async handle(messageContext: HandlerInboundMessage<RequestCredentialHandler>) {
    const credentialRecord = await this.credentialService.processRequest(messageContext)
    if (this.credentialResponseCoordinator.shouldAutoRespondToRequest(credentialRecord)) {
      return await this.createCredential(credentialRecord, messageContext)
    }
  }

  private async createCredential(
    record: CredentialRecord,
    messageContext: HandlerInboundMessage<RequestCredentialHandler>
  ) {
    this.agentConfig.logger.info(
      `Automatically sending credential with autoAccept on ${this.agentConfig.autoAcceptCredentials}`
    )

    const { message, credentialRecord } = await this.credentialService.createCredential(record)

    if (messageContext.connection) {
      return createOutboundMessage(messageContext.connection, message)
    } else if (credentialRecord.requestMessage?.service && credentialRecord.offerMessage?.service) {
      const recipientService = credentialRecord.requestMessage.service
      const ourService = credentialRecord.offerMessage.service

      // Set ~service, update message in record (for later use)
      message.setService(ourService)
      credentialRecord.credentialMessage = message
      await this.credentialService.update(credentialRecord)

      return createOutboundServiceMessage({
        payload: message,
        service: recipientService.toDidCommService(),
        senderKey: ourService.recipientKeys[0],
      })
    }

    this.agentConfig.logger.error(`Could not automatically create credential request`)
  }
}
