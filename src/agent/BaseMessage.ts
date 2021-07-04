import type { Constructor } from '../utils/mixins'

import { Expose } from 'class-transformer'
import { Matches } from 'class-validator'

import { uuid } from '../utils/uuid'

export const MessageIdRegExp = /[-_./a-zA-Z0-9]{8,64}/
export const MessageTypeRegExp = /(.*?)([a-zA-Z0-9._-]+)\/(\d[^/]*)\/([a-zA-Z0-9._-]+)$/

export type BaseMessageConstructor = Constructor<BaseMessage>

export class BaseMessage {
  @Matches(MessageIdRegExp)
  @Expose({ name: '@id' })
  public id!: string

  @Expose({ name: '@type' })
  @Matches(MessageTypeRegExp)
  public readonly type!: string
  public static readonly type: string

  public generateId() {
    return uuid()
  }
}
