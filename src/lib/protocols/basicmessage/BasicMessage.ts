import { Equals, IsDate, IsString } from 'class-validator';
import { Expose, Type } from 'class-transformer';

import { AgentMessage } from '../../agent/AgentMessage';
import { MessageType } from './messages';

export class BasicMessage extends AgentMessage {
  /**
   * Create new BasicMessage instance.
   * sentTime will be assigned to new Date if not passed, id will be assigned to uuid/v4 if not passed
   * @param options
   */
  constructor(options: { content: string; sentTime?: Date; id?: string; locale?: string }) {
    super();

    if (options) {
      this.id = options.id || this.generateId();
      this.sentTime = options.sentTime || new Date();
      this.content = options.content;
      this.addLocale(options.locale || 'en');
    }
  }

  @Equals(BasicMessage.type)
  readonly type = BasicMessage.type;
  static readonly type = MessageType.BasicMessage;

  @Expose({ name: 'sent_time' })
  @Type(() => Date)
  @IsDate()
  sentTime!: Date;

  @Expose({ name: 'content' })
  @IsString()
  content!: string;
}
