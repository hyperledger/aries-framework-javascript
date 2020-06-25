import { Equals, IsEnum } from 'class-validator';

import { AgentMessage } from '../../agent/AgentMessage';
import { MessageType } from './messages';

/**
 * Ack message status types
 */
export enum AckStatus {
  OK = 'OK',
  FAIL = 'FAIL',
  PENDING = 'PENDING',
}

export interface AckMessageOptions {
  id?: string;
  threadId: string;
  status: AckStatus;
}

/**
 * @see https://github.com/hyperledger/aries-rfcs/blob/master/features/0015-acks/README.md#explicit-acks
 */
export class AckMessage extends AgentMessage {
  /**
   * Create new AckMessage instance.
   * @param options
   */
  constructor(options: AckMessageOptions) {
    super();

    if (options) {
      this.id = options.id || this.generateId();
      this.status = options.status;

      this.setThread({
        threadId: options.threadId,
      });
    }
  }

  @Equals(AckMessage.type)
  readonly type = AckMessage.type;
  static readonly type = MessageType.Ack;

  @IsEnum(AckStatus)
  status!: AckStatus;
}
