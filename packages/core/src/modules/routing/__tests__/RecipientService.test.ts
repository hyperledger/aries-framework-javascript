import type { Wallet } from '../../../wallet/Wallet'

import { assert } from 'console'

import { getBaseConfig } from '../../../../tests/helpers'
import { AgentConfig } from '../../../agent/AgentConfig'
import { EventEmitter } from '../../../agent/EventEmitter'
import { MessageSender as MessageSenderImpl } from '../../../agent/MessageSender'
import { IndyWallet } from '../../../wallet/IndyWallet'
import { ConnectionService as ConnectionServiceImpl } from '../../connections/services/ConnectionService'
import { MediationRole, MediationState } from '../models'
import { MediationRecord } from '../repository'
import { MediationRepository } from '../repository/MediationRepository'
import { MediationRecipientService } from '../services/MediationRecipientService'
jest.mock('../services/MediationRecipientService')
jest.mock('./../../../storage/Repository')
const MediationRepositoryMock = MediationRepository as jest.Mock<MediationRepository>

describe('Recipient', () => {
  const ConnectionService = <jest.Mock<ConnectionServiceImpl>>(<unknown>ConnectionServiceImpl)
  const MessageSender = <jest.Mock<MessageSenderImpl>>(<unknown>MessageSenderImpl)
  const initConfig = getBaseConfig('MediationRecipientService')

  let wallet: Wallet
  let agentConfig: AgentConfig
  let mediationRepository: MediationRepository
  let mediationRecipientService: MediationRecipientService
  let eventEmitter: EventEmitter

  beforeAll(async () => {
    agentConfig = new AgentConfig(initConfig.config, initConfig.agentDependencies)
    wallet = new IndyWallet(agentConfig)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await wallet.initialize(initConfig.config.walletConfig!)
  })

  afterAll(async () => {
    await wallet.delete()
  })

  beforeEach(() => {
    mediationRepository = new MediationRepositoryMock()
    eventEmitter = new EventEmitter(agentConfig)
    mediationRecipientService = new MediationRecipientService(
      wallet,
      new ConnectionService(),
      new MessageSender(),
      agentConfig,
      mediationRepository,
      eventEmitter
    )
  })

  describe('MediationRecord test', () => {
    it('validates mediation record class', () => {
      const record = new MediationRecord({
        state: MediationState.Requested,
        role: MediationRole.Recipient,
        threadId: 'fakeThreadId',
        connectionId: 'fakeConnectionId',
        recipientKeys: ['fakeRecipientKey'],
        tags: {
          default: false,
        },
      })
      assert(record.state, 'Expected MediationRecord to have an `state` property')
      expect(record.state).toBeDefined()
      assert(record.role, 'Expected MediationRecord to have an `role` property')
      expect(record.role).toBeDefined()
      assert(record.getTags(), 'Expected MediationRecord to have an `tags` property')
      expect(record.getTags()).toBeDefined()
      assert(record.getTags().state, 'Expected MediationRecord to have an `tags.state` property')
      assert(record.getTags().role, 'Expected MediationRecord to have an `tags.role` property')
      assert(record.getTags().connectionId, 'Expected MediationRecord to have an `tags.connectionId` property')
      assert(record.connectionId, 'Expected MediationRecord to have an `connectionId` property')
      expect(record.connectionId).toBeDefined()
      assert(record.endpoint, 'Expected MediationRecord to have an `endpoint` property')
      assert(record.recipientKeys, 'Expected MediationRecord to have an `recipientKeys` property')
      expect(record.recipientKeys).toBeDefined()
      assert(record.routingKeys, 'Expected MediationRecord to have an `routingKeys` property')
      expect(record.routingKeys).toBeDefined()
    })
  })
  describe('Recipient service tests', () => {
    it('validate service class signiture', () => {
      assert(
        mediationRecipientService.setDefaultMediator,
        'Expected MediationRecipientService to have a `setDefaultMediator` method'
      )
      assert(
        mediationRecipientService.findDefaultMediator,
        'Expected MediationRecipientService to have a `getDefaultMediator` method'
      )
      assert(
        mediationRecipientService.getMediators,
        'Expected MediationRecipientService to have a `getMediators` method'
      )
      assert(
        mediationRecipientService.clearDefaultMediator,
        'Expected MediationRecipientService to have a `clearDefaultMediator` method'
      )
      assert(
        mediationRecipientService.findByConnectionId,
        'Expected MediationRecipientService to have a `findByConnectionId` method'
      )
      assert(
        mediationRecipientService.processMediationDeny,
        'Expected MediationRecipientService to have a `processMediationDeny` method'
      )
      assert(
        mediationRecipientService.processMediationGrant,
        'Expected MediationRecipientService to have a `processMediationGrant` method'
      )
      assert(
        mediationRecipientService.processKeylistUpdateResults,
        'Expected MediationRecipientService to have a `processKeylistUpdateResults` method'
      )
      assert(
        mediationRecipientService.createRequest,
        'Expected MediationRecipientService to have a `createRequest` method'
      )
      //assert(service.createRecord, 'Expected MediationRecipientService to have a `createRecord` method')
    })
    it.todo('setDefaultMediator adds changes tags on mediation records')
    it.todo('getDefaultMediator returns mediation record with default tag set to "true"')
    it.todo('getDefaultMediatorId returns id of the mediation record with default tag set to "true"')
    it.todo('getMediators returns all mediation records')
    it.todo('clearDefaultMediator sets all mediation record tags to "false"')
    it.todo('findByConnectionId returns mediation record given a connectionId')
    it.todo('findById returns mediation record given mediationId')
    it.todo('processMediationDeny...')
    it.todo('processMediationGrant...')
    it.todo('processKeylistUpdateResults...')
    it.todo('createKeylistQuery...')
    it.todo('createRequest...')
    it.todo('createRecord...')
  })
})
