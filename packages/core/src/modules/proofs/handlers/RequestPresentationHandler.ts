import type { AgentConfig } from '../../../agent/AgentConfig'
import type { Handler, HandlerInboundMessage } from '../../../agent/Handler'
import type { MediationRecipientService } from '../../routing'
import type { ProofResponseCoordinator } from '../ProofResponseCoordinator'
import type { ProofRecord } from '../repository'
import type { ProofService } from '../services'

import { createOutboundMessage, createOutboundServiceMessage } from '../../../agent/helpers'
import { ServiceDecorator } from '../../../decorators/service/ServiceDecorator'
import { RequestPresentationMessage } from '../messages'

export class RequestPresentationHandler implements Handler {
  private proofService: ProofService
  private agentConfig: AgentConfig
  private proofResponseCoordinator: ProofResponseCoordinator
  private mediationRecipientService: MediationRecipientService
  public supportedMessages = [RequestPresentationMessage]

  public constructor(
    proofService: ProofService,
    agentConfig: AgentConfig,
    proofResponseCoordinator: ProofResponseCoordinator,
    mediationRecipientService: MediationRecipientService
  ) {
    this.proofService = proofService
    this.agentConfig = agentConfig
    this.proofResponseCoordinator = proofResponseCoordinator
    this.mediationRecipientService = mediationRecipientService
  }

  public async handle(messageContext: HandlerInboundMessage<RequestPresentationHandler>) {
    const proofRecord = await this.proofService.processRequest(messageContext)

    if (this.proofResponseCoordinator.shouldAutoRespondToRequest(proofRecord)) {
      return await this.createPresentation(proofRecord, messageContext)
    }
  }

  private async createPresentation(
    record: ProofRecord,
    messageContext: HandlerInboundMessage<RequestPresentationHandler>
  ) {
    const indyProofRequest = record.requestMessage?.indyProofRequest

    this.agentConfig.logger.info(
      `Automatically sending presentation with autoAccept on ${this.agentConfig.autoAcceptProofs}`
    )

    if (!indyProofRequest) {
      return
    }

    const retrievedCredentials = await this.proofService.getRequestedCredentialsForProofRequest(
      indyProofRequest,
      record.proposalMessage?.presentationProposal
    )

    const requestedCredentials = this.proofService.autoSelectCredentialsForProofRequest(retrievedCredentials)

    const { message, proofRecord } = await this.proofService.createPresentation(record, requestedCredentials)

    if (messageContext.connection) {
      return createOutboundMessage(messageContext.connection, message)
    } else if (proofRecord.requestMessage?.service) {
      // Create ~service decorator
      const routing = await this.mediationRecipientService.getRouting()
      const ourService = new ServiceDecorator({
        serviceEndpoint: routing.endpoint,
        recipientKeys: [routing.verkey],
        routingKeys: routing.routingKeys,
      })

      const recipientService = proofRecord.requestMessage.service

      // Set and save ~service decorator to record (to remember our verkey)
      message.service = ourService
      proofRecord.presentationMessage = message
      await this.proofService.update(proofRecord)

      return createOutboundServiceMessage({
        payload: message,
        service: recipientService.toDidCommService(),
        senderKey: ourService.recipientKeys[0],
      })
    }

    this.agentConfig.logger.error(`Could not automatically create presentation`)
  }
}
