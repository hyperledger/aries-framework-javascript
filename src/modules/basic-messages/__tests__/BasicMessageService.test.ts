import type { StorageService } from '../../../storage/StorageService'
import type { BasicMessageReceivedEvent } from '../BasicMessageEvents'

import { getBaseConfig, getMockConnection } from '../../../__tests__/helpers'
import { AgentConfig } from '../../../agent/AgentConfig'
import { EventEmitter } from '../../../agent/EventEmitter'
import { InboundMessageContext } from '../../../agent/models/InboundMessageContext'
import { IndyStorageService } from '../../../storage/IndyStorageService'
import { Repository } from '../../../storage/Repository'
import { IndyWallet } from '../../../wallet/IndyWallet'
import { BasicMessageEventTypes } from '../BasicMessageEvents'
import { BasicMessageRole } from '../BasicMessageRole'
import { BasicMessage } from '../messages'
import { BasicMessageRecord } from '../repository/BasicMessageRecord'
import { BasicMessageService } from '../services'

describe('BasicMessageService', () => {
  const mockConnectionRecord = getMockConnection({
    id: 'd3849ac3-c981-455b-a1aa-a10bea6cead8',
    verkey: '71X9Y1aSPK11ariWUYQCYMjSewf2Kw2JFGeygEf9uZd9',
    did: 'did:sov:C2SsBf5QUQpqSAQfhu3sd2',
  })

  let wallet: IndyWallet
  let storageService: StorageService<BasicMessageRecord>

  beforeAll(async () => {
    const config = getBaseConfig('BasicMessageServiceTest')
    wallet = new IndyWallet(new AgentConfig(config))
    await wallet.init()
    storageService = new IndyStorageService(wallet, config.indy)
  })

  afterAll(async () => {
    await wallet.close()
    await wallet.delete()
  })

  describe('save', () => {
    let basicMessageRepository: Repository<BasicMessageRecord>
    let basicMessageService: BasicMessageService
    let eventEmitter: EventEmitter

    beforeEach(() => {
      basicMessageRepository = new Repository<BasicMessageRecord>(BasicMessageRecord, storageService)
      eventEmitter = new EventEmitter()
      basicMessageService = new BasicMessageService(basicMessageRepository, eventEmitter)
    })

    it(`emits newMessage with message and basic message record`, async () => {
      const eventListenerMock = jest.fn()
      eventEmitter.on<BasicMessageReceivedEvent>(BasicMessageEventTypes.BasicMessageReceived, eventListenerMock)

      const basicMessage = new BasicMessage({
        id: '123',
        content: 'message',
      })

      const messageContext = new InboundMessageContext(basicMessage, {
        senderVerkey: 'senderKey',
        recipientVerkey: 'recipientKey',
      })

      await basicMessageService.save(messageContext, mockConnectionRecord)

      expect(eventListenerMock).toHaveBeenCalledWith({
        type: 'BasicMessageReceived',
        payload: {
          basicMessageRecord: expect.objectContaining({
            connectionId: mockConnectionRecord.id,
            id: basicMessage.id,
            sentTime: basicMessage.sentTime.toISOString(),
            content: basicMessage.content,
            role: BasicMessageRole.Receiver,
          }),
          message: messageContext.message,
        },
      })
    })
  })
})
