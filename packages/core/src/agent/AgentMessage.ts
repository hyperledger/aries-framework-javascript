import { AckDecorated } from '../decorators/ack/AckDecoratorExtension'
import { AttachmentDecorated } from '../decorators/attachment/AttachmentExtension'
import { L10nDecorated } from '../decorators/l10n/L10nDecoratorExtension'
import { ServiceDecorated } from '../decorators/service/ServiceDecoratorExtension'
import { ThreadDecorated } from '../decorators/thread/ThreadDecoratorExtension'
import { TimingDecorated } from '../decorators/timing/TimingDecoratorExtension'
import { TransportDecorated } from '../decorators/transport/TransportDecoratorExtension'
import { JsonTransformer } from '../utils/JsonTransformer'
import { Compose } from '../utils/mixins'

import { BaseMessage } from './BaseMessage'

const DefaultDecorators = [
  ThreadDecorated,
  L10nDecorated,
  TransportDecorated,
  TimingDecorated,
  AckDecorated,
  AttachmentDecorated,
  ServiceDecorated,
]

export class AgentMessage extends Compose(BaseMessage, DefaultDecorators) {
  public toJSON(): Record<string, unknown> {
    return JsonTransformer.toJSON(this)
  }

  public is<C extends typeof AgentMessage>(Class: C): this is InstanceType<C> {
    return this.type === Class.type
  }
}
