import { InboundMessage } from '../../types';
import { Handler } from '../Handler';
import { ConnectionService } from '../../protocols/connections/ConnectionService';
import { ProviderRoutingService } from '../../protocols/routing/ProviderRoutingService';
import { MessageType } from '../../protocols/routing/messages';

export class RouteUpdateHandler implements Handler {
  connectionService: ConnectionService;
  routingService: ProviderRoutingService;

  constructor(connectionService: ConnectionService, routingService: ProviderRoutingService) {
    this.connectionService = connectionService;
    this.routingService = routingService;
  }

  get supportedMessageTypes(): [MessageType.RouteUpdateMessage] {
    return [MessageType.RouteUpdateMessage];
  }

  async handle(inboundMessage: InboundMessage) {
    const { recipient_verkey } = inboundMessage;
    const connection = await this.connectionService.findByVerkey(recipient_verkey);

    if (!connection) {
      throw new Error(`Connection for verkey ${recipient_verkey} not found!`);
    }

    const outboundMessage = this.routingService.updateRoutes(inboundMessage, connection);
    return outboundMessage;
  }
}
