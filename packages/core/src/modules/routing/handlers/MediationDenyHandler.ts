import type { Handler, HandlerInboundMessage } from '../../../agent/Handler'
import type { RecipientService } from '../services'

import { MediationDenyMessage } from '../messages'

export class MediationDenyHandler implements Handler {
  private recipientService: RecipientService
  public supportedMessages = [MediationDenyMessage]

  public constructor(recipientService: RecipientService) {
    this.recipientService = recipientService
  }

  public async handle(messageContext: HandlerInboundMessage<MediationDenyHandler>) {
    if (!messageContext.connection) {
      throw new Error(`Connection for verkey ${messageContext.recipientVerkey} not found!`)
    }
    await this.recipientService.processMediationDeny(messageContext)
  }
}
