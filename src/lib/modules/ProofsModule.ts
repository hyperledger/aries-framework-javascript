import { ConnectionRecord } from '../storage/ConnectionRecord';
import { createOutboundMessage } from '../protocols/helpers';
import { MessageSender } from '../agent/MessageSender';
import { ProofService, ProofRequestTemplate } from '../protocols/proof/ProofService';
import { ProofRecord } from '../storage/ProofRecord';
/**
 * The fuctionalities of this Class is used to Send proof request
 */
export class ProofsModule {
  private proofService: ProofService;
  private messageSender: MessageSender;

  public constructor(proofService: ProofService, messageSender: MessageSender) {
    this.proofService = proofService;
    this.messageSender = messageSender;
  }

  /**
   * This method is used to send proof request
   * @param connection : Connection to which issuer wants to issue a credential
   * @param ProofRequestTemplate : Template used to send proof request
   */
  public async sendProofRequest(connection: ConnectionRecord, proofRequestTemplate: ProofRequestTemplate) {
    const proofOfferMessage = await this.proofService.createProofRequest(connection, proofRequestTemplate);
    const outboundMessage = createOutboundMessage(connection, proofOfferMessage);
    await this.messageSender.sendMessage(outboundMessage);
  }

  public async getProofs(): Promise<ProofRecord[]> {
    return this.proofService.getAll();
  }

  public async find(id: string) {
    return this.proofService.find(id);
  }
}
