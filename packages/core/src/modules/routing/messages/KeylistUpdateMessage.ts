import { Expose, Type } from 'class-transformer'
import { Equals, IsArray, ValidateNested, IsString, IsEnum } from 'class-validator'

import { AgentMessage } from '../../../agent/AgentMessage'

export interface KeylistUpdateMessageOptions {
  id?: string
  updates: KeylistUpdate[]
}

/**
 * Used to notify the mediator of keys in use by the recipient.
 *
 * @see https://github.com/hyperledger/aries-rfcs/blob/master/features/0211-route-coordination/README.md#keylist-update
 */
export class KeylistUpdateMessage extends AgentMessage {
  public constructor(options: KeylistUpdateMessageOptions) {
    super()

    if (options) {
      this.id = options.id || this.generateId()
      this.updates = options.updates
    }
  }

  @Equals(KeylistUpdateMessage.type)
  public readonly type = KeylistUpdateMessage.type
  public static readonly type = 'https://didcomm.org/coordinatemediation/1.0/keylist-update'

  @Type(() => KeylistUpdate)
  @IsArray()
  @ValidateNested()
  public updates!: KeylistUpdate[]
}

export enum KeylistUpdateAction {
  add = 'add',
  remove = 'remove',
}

export class KeylistUpdate {
  public constructor(options: { recipientKey: string; action: KeylistUpdateAction }) {
    if (options) {
      this.recipientKey = options.recipientKey
      this.action = options.action
    }
  }

  @IsString()
  @Expose({ name: 'recipient_key' })
  public recipientKey!: string

  @IsEnum(KeylistUpdateAction)
  public action!: KeylistUpdateAction
}
