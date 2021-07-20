import type { ConnectionRecord } from '../../modules/connections'
import type { MessageRepository } from '../../storage/MessageRepository'
import type { OutboundTransporter } from '../../transport'
import type { OutboundMessage, WireMessage } from '../../types'

import { getAgentConfig, getMockConnection, mockFunction } from '../../../tests/helpers'
import testLogger from '../../../tests/logger'
import { ReturnRouteTypes } from '../../decorators/transport/TransportDecorator'
import { DidCommService } from '../../modules/connections'
import { InMemoryMessageRepository } from '../../storage/InMemoryMessageRepository'
import { AgentMessage } from '../AgentMessage'
import { EnvelopeService as EnvelopeServiceImpl } from '../EnvelopeService'
import { MessageSender } from '../MessageSender'
import { TransportService } from '../TransportService'
import { createOutboundMessage } from '../helpers'

import { DummyTransportSession } from './stubs'

jest.mock('../TransportService')
jest.mock('../EnvelopeService')

const TransportServiceMock = TransportService as jest.MockedClass<typeof TransportService>
const logger = testLogger

class DummyOutboundTransporter implements OutboundTransporter {
  public start(): Promise<void> {
    throw new Error('Method not implemented.')
  }

  public stop(): Promise<void> {
    throw new Error('Method not implemented.')
  }

  public supportedSchemes: string[] = []

  public sendMessage() {
    return Promise.resolve()
  }
}

describe('MessageSender', () => {
  const EnvelopeService = <jest.Mock<EnvelopeServiceImpl>>(<unknown>EnvelopeServiceImpl)

  const wireMessage: WireMessage = {
    protected: 'base64url',
    iv: 'base64url',
    ciphertext: 'base64url',
    tag: 'base64url',
  }

  const enveloperService = new EnvelopeService()
  const envelopeServicePackMessageMock = mockFunction(enveloperService.packMessage)

  const inboundMessage = new AgentMessage()
  inboundMessage.setReturnRouting(ReturnRouteTypes.all)

  const session = new DummyTransportSession('session-123')
  session.keys = {
    recipientKeys: ['verkey'],
    routingKeys: [],
    senderKey: 'senderKey',
  }
  session.inboundMessage = inboundMessage
  session.send = jest.fn()

  const sessionWithoutKeys = new DummyTransportSession('sessionWithoutKeys-123')
  sessionWithoutKeys.inboundMessage = inboundMessage
  sessionWithoutKeys.send = jest.fn()

  const transportService = new TransportService()
  const transportServiceFindSessionMock = mockFunction(transportService.findSessionByConnectionId)
  const transportServiceHasInboundEndpoint = mockFunction(transportService.hasInboundEndpoint)

  const firstDidCommService = new DidCommService({
    id: `<did>;indy`,
    serviceEndpoint: 'https://www.first-endpoint.com',
    recipientKeys: ['verkey'],
  })
  const secondDidCommService = new DidCommService({
    id: `<did>;indy`,
    serviceEndpoint: 'https://www.second-endpoint.com',
    recipientKeys: ['verkey'],
  })
  const transportServiceFindServicesMock = mockFunction(transportService.findDidCommServices)

  let messageSender: MessageSender
  let outboundTransporter: OutboundTransporter
  let messageRepository: MessageRepository
  let connection: ConnectionRecord
  let outboundMessage: OutboundMessage

  describe('sendMessage', () => {
    beforeEach(() => {
      TransportServiceMock.mockClear()
      transportServiceHasInboundEndpoint.mockReturnValue(true)
      outboundTransporter = new DummyOutboundTransporter()
      messageRepository = new InMemoryMessageRepository(getAgentConfig('MessageSender'))
      messageSender = new MessageSender(enveloperService, transportService, messageRepository, logger)
      connection = getMockConnection({ id: 'test-123', theirLabel: 'Test 123' })

      outboundMessage = createOutboundMessage(connection, new AgentMessage())

      envelopeServicePackMessageMock.mockReturnValue(Promise.resolve(wireMessage))
      transportServiceFindServicesMock.mockReturnValue([firstDidCommService, secondDidCommService])
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    test('throw error when there is no outbound transport', async () => {
      await expect(messageSender.sendMessage(outboundMessage)).rejects.toThrow(`Agent has no outbound transporter!`)
    })

    test('throw error when there is no service or queue', async () => {
      messageSender.setOutboundTransporter(outboundTransporter)
      transportServiceFindServicesMock.mockReturnValue([])

      await expect(messageSender.sendMessage(outboundMessage)).rejects.toThrow(
        `Message is undeliverable to connection test-123 (Test 123)`
      )
    })

    test('call send message when session send method fails', async () => {
      messageSender.setOutboundTransporter(outboundTransporter)
      transportServiceFindSessionMock.mockReturnValue(session)
      session.send = jest.fn().mockRejectedValue(new Error('some error'))

      messageSender.setOutboundTransporter(outboundTransporter)
      const sendMessageSpy = jest.spyOn(outboundTransporter, 'sendMessage')

      await messageSender.sendMessage(outboundMessage)

      expect(sendMessageSpy).toHaveBeenCalledWith({
        payload: wireMessage,
        endpoint: firstDidCommService.serviceEndpoint,
        responseRequested: false,
      })
      expect(sendMessageSpy).toHaveBeenCalledTimes(1)
    })

    test('call send message when session send method fails with missing keys', async () => {
      messageSender.setOutboundTransporter(outboundTransporter)
      transportServiceFindSessionMock.mockReturnValue(sessionWithoutKeys)

      messageSender.setOutboundTransporter(outboundTransporter)
      const sendMessageSpy = jest.spyOn(outboundTransporter, 'sendMessage')

      await messageSender.sendMessage(outboundMessage)

      expect(sendMessageSpy).toHaveBeenCalledWith({
        payload: wireMessage,
        endpoint: firstDidCommService.serviceEndpoint,
        responseRequested: false,
      })
      expect(sendMessageSpy).toHaveBeenCalledTimes(1)
    })

    test('call send message on session when there is a session for a given connection', async () => {
      messageSender.setOutboundTransporter(outboundTransporter)
      const sendMessageSpy = jest.spyOn(outboundTransporter, 'sendMessage')
      const sendMessageToServiceSpy = jest.spyOn(messageSender, 'sendMessageToService')

      await messageSender.sendMessage(outboundMessage)

      expect(sendMessageToServiceSpy).toHaveBeenCalledWith({
        message: outboundMessage.payload,
        senderKey: connection.verkey,
        service: firstDidCommService,
        returnRoute: false,
      })
      expect(sendMessageToServiceSpy).toHaveBeenCalledTimes(1)
      expect(sendMessageSpy).toHaveBeenCalledTimes(1)
    })

    test('calls sendMessageToService with payload and endpoint from second DidComm service when the first fails', async () => {
      messageSender.setOutboundTransporter(outboundTransporter)
      const sendMessageSpy = jest.spyOn(outboundTransporter, 'sendMessage')
      const sendMessageToServiceSpy = jest.spyOn(messageSender, 'sendMessageToService')

      // Simulate the case when the first call fails
      sendMessageSpy.mockRejectedValueOnce(new Error())

      await messageSender.sendMessage(outboundMessage)

      expect(sendMessageToServiceSpy).toHaveBeenNthCalledWith(2, {
        message: outboundMessage.payload,
        senderKey: connection.verkey,
        service: secondDidCommService,
        returnRoute: false,
      })
      expect(sendMessageToServiceSpy).toHaveBeenCalledTimes(2)
      expect(sendMessageSpy).toHaveBeenCalledTimes(2)
    })
  })

  describe('sendMessageToService', () => {
    const service = new DidCommService({
      id: 'out-of-band',
      recipientKeys: ['someKey'],
      serviceEndpoint: 'https://example.com',
    })
    const senderKey = 'someVerkey'

    beforeEach(() => {
      outboundTransporter = new DummyOutboundTransporter()
      messageSender = new MessageSender(
        enveloperService,
        transportService,
        new InMemoryMessageRepository(getAgentConfig('MessageSenderTest')),
        logger
      )

      envelopeServicePackMessageMock.mockReturnValue(Promise.resolve(wireMessage))
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    test('throws error when there is no outbound transport', async () => {
      await expect(
        messageSender.sendMessageToService({
          message: new AgentMessage(),
          senderKey,
          service,
        })
      ).rejects.toThrow(`Agent has no outbound transporter!`)
    })

    test('calls send message with payload and endpoint from DIDComm service', async () => {
      messageSender.setOutboundTransporter(outboundTransporter)
      const sendMessageSpy = jest.spyOn(outboundTransporter, 'sendMessage')

      await messageSender.sendMessageToService({
        message: new AgentMessage(),
        senderKey,
        service,
      })

      expect(sendMessageSpy).toHaveBeenCalledWith({
        payload: wireMessage,
        endpoint: service.serviceEndpoint,
        responseRequested: false,
      })
      expect(sendMessageSpy).toHaveBeenCalledTimes(1)
    })

    test('call send message with responseRequested when message has return route', async () => {
      messageSender.setOutboundTransporter(outboundTransporter)
      const sendMessageSpy = jest.spyOn(outboundTransporter, 'sendMessage')

      const message = new AgentMessage()
      message.setReturnRouting(ReturnRouteTypes.all)

      await messageSender.sendMessageToService({
        message,
        senderKey,
        service,
      })

      expect(sendMessageSpy).toHaveBeenCalledWith({
        payload: wireMessage,
        endpoint: service.serviceEndpoint,
        responseRequested: true,
      })
      expect(sendMessageSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('packMessage', () => {
    beforeEach(() => {
      outboundTransporter = new DummyOutboundTransporter()
      messageRepository = new InMemoryMessageRepository(getAgentConfig('PackMessage'))
      messageSender = new MessageSender(enveloperService, transportService, messageRepository, logger)
      connection = getMockConnection({ id: 'test-123' })

      envelopeServicePackMessageMock.mockReturnValue(Promise.resolve(wireMessage))
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    test('return outbound message context with connection, payload and endpoint', async () => {
      const message = new AgentMessage()
      const endpoint = 'https://example.com'

      const keys = {
        recipientKeys: ['service.recipientKeys'],
        routingKeys: [],
        senderKey: connection.verkey,
      }
      const result = await messageSender.packMessage({ message, keys, endpoint })

      expect(result).toEqual({
        payload: wireMessage,
        responseRequested: message.hasAnyReturnRoute(),
        endpoint,
      })
    })
  })
})
