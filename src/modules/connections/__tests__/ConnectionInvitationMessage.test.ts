import { JsonTransformer } from '../../../utils/JsonTransformer'
import { MessageValidator } from '../../../utils/MessageValidator'
import { ConnectionInvitationMessage } from '../messages/ConnectionInvitationMessage'

describe('ConnectionInvitationMessage', () => {
  it('should allow routingKeys to be left out of inline invitation', async () => {
    const json = {
      '@type': ConnectionInvitationMessage.type,
      '@id': '04a2c382-999e-4de9-a1d2-9dec0b2fa5e4',
      recipientKeys: ['recipientKeyOne', 'recipientKeyTwo'],
      serviceEndpoint: 'https://example.com',
      label: 'test',
    }
    const invitation = JsonTransformer.fromJSON(json, ConnectionInvitationMessage)
    await expect(MessageValidator.validate(invitation)).resolves.toBeUndefined()
  })

  it('should throw error if both did and inline keys / endpoint are missing', async () => {
    const json = {
      '@type': ConnectionInvitationMessage.type,
      '@id': '04a2c382-999e-4de9-a1d2-9dec0b2fa5e4',
      label: 'test',
    }
    const invitation = JsonTransformer.fromJSON(json, ConnectionInvitationMessage)
    await expect(MessageValidator.validate(invitation)).rejects.not.toBeNull()
  })

  it('should replace legacy did:sov:BzCbsNYhMrjHiqZDTUASHg;spec prefix with https://didcomm.org in message type', async () => {
    const json = {
      '@type': 'did:sov:BzCbsNYhMrjHiqZDTUASHg;spec/connections/1.0/invitation',
      '@id': '04a2c382-999e-4de9-a1d2-9dec0b2fa5e4',
      recipientKeys: ['recipientKeyOne', 'recipientKeyTwo'],
      serviceEndpoint: 'https://example.com',
      label: 'test',
    }
    const invitation = JsonTransformer.fromJSON(json, ConnectionInvitationMessage)

    // Assert type
    expect(invitation.type).toBe('https://didcomm.org/connections/1.0/invitation')

    // Assert validation also works with the transformation
    await expect(MessageValidator.validate(invitation)).resolves.toBeUndefined()
  })
})
