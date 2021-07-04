import { MessageValidator } from '../../../utils/MessageValidator'
import { ConnectionRequestMessage } from '../messages/ConnectionRequestMessage'

describe('ConnectionRequestMessage', () => {
  it('throws an error when the message does not contain a connection parameter', async () => {
    expect.assertions(1)

    const connectionRequest = new ConnectionRequestMessage({
      did: 'did',
      label: 'test-label',
    })

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    delete connectionRequest.connection

    return expect(MessageValidator.validate(connectionRequest)).rejects.not.toBeNull()
  })
})
