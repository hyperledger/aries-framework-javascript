import { Equals, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

import { AgentMessage } from '../../../agent/AgentMessage';
import { RoutingMessageType as MessageType } from './RoutingMessageType';
import { Term } from '../models/Term';

export interface MediationDenyMessageOptions {
  id?: string;
  mediator_terms: Term[];
  recipient_terms: Term[];
}

/**
 * This message serves as a request from the recipient to the mediator, asking for the permission (and routing information)
 * to publish the endpoint as a mediator.
 *
 * @see https://github.com/hyperledger/aries-rfcs/blob/master/features/0211-route-coordination/README.md#mediation-grant
 */
export class MediationDenyMessage extends AgentMessage {
  public constructor(options: MediationDenyMessageOptions) {
    super();

    if (options) {
      this.id = options.id || this.generateId();
      this.mediator_terms = options.mediator_terms;
      this.recipient_terms = options.recipient_terms;
    }
  }

  @Equals(MediationDenyMessage.type)
  public readonly type = MediationDenyMessage.type;
  public static readonly type = MessageType.MediationDeny;

  @Type(() => Term)
  @IsArray()
  @ValidateNested()
  public mediator_terms!: Term[];

  @Type(() => Term)
  @IsArray()
  @ValidateNested()
  public recipient_terms!: Term[];
}
