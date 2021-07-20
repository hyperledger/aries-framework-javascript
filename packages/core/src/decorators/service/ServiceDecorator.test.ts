import { BaseMessage } from '../../agent/BaseMessage'
import { JsonTransformer } from '../../utils/JsonTransformer'
import { Compose } from '../../utils/mixins'

import { ServiceDecorated } from './ServiceDecoratorExtension'

describe('Decorators | ServiceDecoratorExtension', () => {
  class TestMessage extends Compose(BaseMessage, [ServiceDecorated]) {
    public toJSON(): Record<string, unknown> {
      return JsonTransformer.toJSON(this)
    }
  }

  const service = {
    recipientKeys: ['test', 'test'],
    routingKeys: ['test', 'test'],
    serviceEndpoint: 'https://example.com',
  }

  test('transforms ServiceDecorator class to JSON', () => {
    const message = new TestMessage()

    message.setService(service)
    expect(message.toJSON()).toEqual({ '~service': service })
  })

  test('transforms Json to ServiceDecorator class', () => {
    const transformed = JsonTransformer.fromJSON({ '~service': service }, TestMessage)

    expect(transformed.service).toEqual(service)
    expect(transformed).toBeInstanceOf(TestMessage)
  })
})
