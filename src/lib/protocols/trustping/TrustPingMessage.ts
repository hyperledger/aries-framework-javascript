import { Equals, IsString, IsBoolean } from 'class-validator';
import { Expose } from 'class-transformer';

import { AgentMessage } from '../../agent/AgentMessage';
import { MessageType } from './messages';
import { Default } from '../../utils/class-transformer/Default';
import { TimingDecorator } from '../../decorators/timing/TimingDecorator';

export interface TrustPingMessageOptions {
  comment?: string;
  id?: string;
  responseRequested?: boolean;
  timing?: Pick<TimingDecorator, 'outTime' | 'expiresTime' | 'delayMilli'>;
}

/**
 * Message to initiate trust ping interaction
 *
 * @see https://github.com/hyperledger/aries-rfcs/blob/master/features/0048-trust-ping/README.md#messages
 */
export class TrustPingMessage extends AgentMessage {
  /**
   * Create new TrustPingMessage instance.
   * responseRequested will be true if not passed
   * @param options
   */
  constructor(options?: TrustPingMessageOptions) {
    super();

    if (options) {
      this.id = options.id || this.generateId();
      this.comment = options.comment;
      this.responseRequested = options.responseRequested !== undefined ? options.responseRequested : true;

      if (options.timing) {
        this.setTiming({
          outTime: options.timing.outTime,
          expiresTime: options.timing.expiresTime,
          delayMilli: options.timing.delayMilli,
        });
      }
    }
  }

  @Equals(TrustPingMessage.type)
  readonly type = TrustPingMessage.type;
  static readonly type = MessageType.TrustPingMessage;

  @IsString()
  comment?: string;

  @Default(true)
  @IsBoolean()
  @Expose({ name: 'response_requested' })
  responseRequested!: boolean;
}
