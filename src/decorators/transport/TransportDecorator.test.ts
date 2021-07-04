import { JsonTransformer } from '../../utils/JsonTransformer'
import { MessageValidator } from '../../utils/MessageValidator'

import { TransportDecorator, ReturnRouteTypes } from './TransportDecorator'

const validTransport = (obj: Record<string, unknown>) =>
  MessageValidator.validate(JsonTransformer.fromJSON(obj, TransportDecorator))
const expectValid = (obj: Record<string, unknown>) => expect(validTransport(obj)).resolves.toBeUndefined()
const expectInvalid = (obj: Record<string, unknown>) => expect(validTransport(obj)).rejects.not.toBeNull()

const valid = {
  all: {
    return_route: 'all',
  },
  none: {
    return_route: 'none',
  },
  thread: {
    return_route: 'thread',
    return_route_thread: '7d5d797c-db60-489f-8787-87bbd1acdb7e',
  },
}

const invalid = {
  random: {
    return_route: 'random',
  },
  invalidThreadId: {
    return_route: 'thread',
    return_route_thread: 'invalid',
  },
  missingThreadId: {
    return_route: 'thread',
  },
}

describe('Decorators | TransportDecorator', () => {
  it('should correctly transform Json to TransportDecorator class', () => {
    const decorator = JsonTransformer.fromJSON(valid.thread, TransportDecorator)

    expect(decorator.returnRoute).toBe(valid.thread.return_route)
    expect(decorator.returnRouteThread).toBe(valid.thread.return_route_thread)
  })

  it('should correctly transform TransportDecorator class to Json', () => {
    const id = 'f6ce6225-087b-46c1-834a-3e7e24116a00'
    const decorator = new TransportDecorator({
      returnRoute: ReturnRouteTypes.thread,
      returnRouteThread: id,
    })

    const json = JsonTransformer.toJSON(decorator)
    const transformed = {
      return_route: 'thread',
      return_route_thread: id,
    }

    expect(json).toEqual(transformed)
  })

  it('should only allow correct return_route values', async () => {
    expect.assertions(4)
    await expectValid(valid.all)
    await expectValid(valid.none)
    await expectValid(valid.thread)
    await expectInvalid(invalid.random)
  })

  it('should require return_route_thread when return_route is thread', async () => {
    expect.assertions(3)
    await expectValid(valid.thread)
    await expectInvalid(invalid.invalidThreadId)
    await expectInvalid(invalid.missingThreadId)
  })
})
