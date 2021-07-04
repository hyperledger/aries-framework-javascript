import type { Wallet } from '../../../wallet/Wallet'

import { getBaseConfig, getMockConnection, mockFunction } from '../../../__tests__/helpers'
import { AgentConfig } from '../../../agent/AgentConfig'
import { EventEmitter } from '../../../agent/EventEmitter'
import { InboundMessageContext } from '../../../agent/models/InboundMessageContext'
import { SignatureDecorator } from '../../../decorators/signature/SignatureDecorator'
import { signData, unpackAndVerifySignatureDecorator } from '../../../decorators/signature/SignatureDecoratorUtils'
import { JsonTransformer } from '../../../utils/JsonTransformer'
import { uuid } from '../../../utils/uuid'
import { IndyWallet } from '../../../wallet/IndyWallet'
import { AckMessage, AckStatus } from '../../common'
import {
  ConnectionInvitationMessage,
  ConnectionRequestMessage,
  ConnectionResponseMessage,
  TrustPingMessage,
} from '../messages'
import { Connection, ConnectionState, ConnectionRole, DidDoc, DidCommService } from '../models'
import { ConnectionRecord } from '../repository/ConnectionRecord'
import { ConnectionRepository } from '../repository/ConnectionRepository'
import { ConnectionService } from '../services/ConnectionService'

jest.mock('../repository/ConnectionRepository')
const ConnectionRepositoryMock = ConnectionRepository as jest.Mock<ConnectionRepository>

describe('ConnectionService', () => {
  const initConfig = getBaseConfig('ConnectionServiceTest', {
    host: 'http://agent.com',
    port: 8080,
  })

  let wallet: Wallet
  let agentConfig: AgentConfig
  let connectionRepository: ConnectionRepository
  let connectionService: ConnectionService
  let eventEmitter: EventEmitter

  beforeAll(async () => {
    agentConfig = new AgentConfig(initConfig)
    wallet = new IndyWallet(agentConfig)
    await wallet.init()
  })

  afterAll(async () => {
    await wallet.close()
    await wallet.delete()
  })

  beforeEach(() => {
    eventEmitter = new EventEmitter()
    connectionRepository = new ConnectionRepositoryMock()
    connectionService = new ConnectionService(wallet, agentConfig, connectionRepository, eventEmitter)
  })

  describe('createConnectionWithInvitation', () => {
    it('returns a connection record with values set', async () => {
      expect.assertions(7)

      const { connectionRecord: connectionRecord } = await connectionService.createInvitation()

      expect(connectionRecord.type).toBe('ConnectionRecord')
      expect(connectionRecord.role).toBe(ConnectionRole.Inviter)
      expect(connectionRecord.state).toBe(ConnectionState.Invited)
      expect(connectionRecord.autoAcceptConnection).toBeUndefined()
      expect(connectionRecord.id).toEqual(expect.any(String))
      expect(connectionRecord.verkey).toEqual(expect.any(String))
      expect(connectionRecord.getTags()).toEqual(
        expect.objectContaining({
          verkey: connectionRecord.verkey,
        })
      )
    })

    it('returns a connection record with invitation', async () => {
      expect.assertions(1)

      const { message: invitation } = await connectionService.createInvitation()

      expect(invitation).toEqual(
        expect.objectContaining({
          label: initConfig.label,
          recipientKeys: [expect.any(String)],
          routingKeys: [],
          serviceEndpoint: `${initConfig.host}:${initConfig.port}/msg`,
        })
      )
    })

    it('saves the connection record in the connection repository', async () => {
      expect.assertions(1)

      const saveSpy = jest.spyOn(connectionRepository, 'save')

      await connectionService.createInvitation()

      expect(saveSpy).toHaveBeenCalledWith(expect.any(ConnectionRecord))
    })

    it('returns a connection record with the autoAcceptConnection parameter from the config', async () => {
      expect.assertions(3)

      const { connectionRecord: connectionTrue } = await connectionService.createInvitation({
        autoAcceptConnection: true,
      })
      const { connectionRecord: connectionFalse } = await connectionService.createInvitation({
        autoAcceptConnection: false,
      })
      const { connectionRecord: connectionUndefined } = await connectionService.createInvitation()

      expect(connectionTrue.autoAcceptConnection).toBe(true)
      expect(connectionFalse.autoAcceptConnection).toBe(false)
      expect(connectionUndefined.autoAcceptConnection).toBeUndefined()
    })

    it('returns a connection record with the alias parameter from the config', async () => {
      expect.assertions(2)

      const { connectionRecord: aliasDefined } = await connectionService.createInvitation({ alias: 'test-alias' })
      const { connectionRecord: aliasUndefined } = await connectionService.createInvitation()

      expect(aliasDefined.alias).toBe('test-alias')
      expect(aliasUndefined.alias).toBeUndefined()
    })
  })

  describe('processInvitation', () => {
    it('returns a connection record containing the information from the connection invitation', async () => {
      expect.assertions(9)

      const recipientKey = 'key-1'
      const invitation = new ConnectionInvitationMessage({
        label: 'test label',
        recipientKeys: [recipientKey],
        serviceEndpoint: 'https://test.com/msg',
      })

      const connection = await connectionService.processInvitation(invitation)
      const connectionAlias = await connectionService.processInvitation(invitation, { alias: 'test-alias' })

      expect(connection.role).toBe(ConnectionRole.Invitee)
      expect(connection.state).toBe(ConnectionState.Invited)
      expect(connection.autoAcceptConnection).toBeUndefined()
      expect(connection.id).toEqual(expect.any(String))
      expect(connection.verkey).toEqual(expect.any(String))
      expect(connection.getTags()).toEqual(
        expect.objectContaining({
          verkey: connection.verkey,
          invitationKey: recipientKey,
        })
      )
      expect(connection.invitation).toMatchObject(invitation)
      expect(connection.alias).toBeUndefined()
      expect(connectionAlias.alias).toBe('test-alias')
    })

    it('returns a connection record with the autoAcceptConnection parameter from the config', async () => {
      expect.assertions(3)

      const invitation = new ConnectionInvitationMessage({
        did: 'did:sov:test',
        label: 'test label',
      })

      const connectionTrue = await connectionService.processInvitation(invitation, { autoAcceptConnection: true })
      const connectionFalse = await connectionService.processInvitation(invitation, {
        autoAcceptConnection: false,
      })
      const connectionUndefined = await connectionService.processInvitation(invitation)

      expect(connectionTrue.autoAcceptConnection).toBe(true)
      expect(connectionFalse.autoAcceptConnection).toBe(false)
      expect(connectionUndefined.autoAcceptConnection).toBeUndefined()
    })

    it('returns a connection record with the alias parameter from the config', async () => {
      expect.assertions(2)

      const invitation = new ConnectionInvitationMessage({
        did: 'did:sov:test',
        label: 'test label',
      })

      const aliasDefined = await connectionService.processInvitation(invitation, { alias: 'test-alias' })
      const aliasUndefined = await connectionService.processInvitation(invitation)

      expect(aliasDefined.alias).toBe('test-alias')
      expect(aliasUndefined.alias).toBeUndefined()
    })
  })

  describe('createRequest', () => {
    it('returns a connection request message containing the information from the connection record', async () => {
      expect.assertions(4)

      const connection = getMockConnection()
      mockFunction(connectionRepository.getById).mockReturnValue(Promise.resolve(connection))

      const { connectionRecord: connectionRecord, message } = await connectionService.createRequest('test')

      expect(connectionRecord.state).toBe(ConnectionState.Requested)
      expect(message.label).toBe(initConfig.label)
      expect(message.connection.did).toBe('test-did')
      expect(message.connection.didDoc).toEqual(connection.didDoc)
    })

    it(`throws an error when connection role is ${ConnectionRole.Inviter} and not ${ConnectionRole.Invitee}`, async () => {
      expect.assertions(1)

      mockFunction(connectionRepository.getById).mockReturnValue(
        Promise.resolve(getMockConnection({ role: ConnectionRole.Inviter }))
      )
      return expect(connectionService.createRequest('test')).rejects.toThrowError(
        `Connection record has invalid role ${ConnectionRole.Inviter}. Expected role ${ConnectionRole.Invitee}.`
      )
    })

    const invalidConnectionStates = [
      ConnectionState.Init,
      ConnectionState.Requested,
      ConnectionState.Responded,
      ConnectionState.Complete,
    ]
    test.each(invalidConnectionStates)(
      `throws an error when connection state is %s and not ${ConnectionState.Invited}`,
      (state) => {
        expect.assertions(1)

        mockFunction(connectionRepository.getById).mockReturnValue(Promise.resolve(getMockConnection({ state })))
        return expect(connectionService.createRequest('test')).rejects.toThrowError(
          `Connection record is in invalid state ${state}. Valid states are: ${ConnectionState.Invited}.`
        )
      }
    )
  })

  describe('processRequest', () => {
    it('returns a connection record containing the information from the connection request', async () => {
      expect.assertions(5)

      const connectionRecord = getMockConnection({
        state: ConnectionState.Invited,
        verkey: 'my-key',
        role: ConnectionRole.Inviter,
      })
      mockFunction(connectionRepository.findSingleByQuery).mockReturnValue(Promise.resolve(connectionRecord))

      const theirDid = 'their-did'
      const theirVerkey = 'their-verkey'
      const theirDidDoc = new DidDoc({
        id: theirDid,
        publicKey: [],
        authentication: [],
        service: [
          new DidCommService({
            id: `${theirDid};indy`,
            serviceEndpoint: 'https://endpoint.com',
            recipientKeys: [theirVerkey],
          }),
        ],
      })

      const connectionRequest = new ConnectionRequestMessage({
        did: theirDid,
        didDoc: theirDidDoc,
        label: 'test-label',
      })

      const messageContext = new InboundMessageContext(connectionRequest, {
        senderVerkey: theirVerkey,
        recipientVerkey: 'my-key',
      })

      const processedConnection = await connectionService.processRequest(messageContext)

      expect(processedConnection.state).toBe(ConnectionState.Requested)
      expect(processedConnection.theirDid).toBe(theirDid)
      expect(processedConnection.theirDidDoc).toEqual(theirDidDoc)
      expect(processedConnection.theirKey).toBe(theirVerkey)
      expect(processedConnection.threadId).toBe(connectionRequest.id)
    })

    it('throws an error when the connection cannot be found by verkey', async () => {
      expect.assertions(1)

      const connectionRequest = new ConnectionRequestMessage({
        did: 'did',
        label: 'test-label',
      })

      const messageContext = new InboundMessageContext(connectionRequest, {
        recipientVerkey: 'test-verkey',
        senderVerkey: 'sender-verkey',
      })

      mockFunction(connectionRepository.findSingleByQuery).mockReturnValue(Promise.resolve(null))
      return expect(connectionService.processRequest(messageContext)).rejects.toThrowError(
        'Unable to process connection request: connection for verkey test-verkey not found'
      )
    })

    it(`throws an error when connection role is ${ConnectionRole.Invitee} and not ${ConnectionRole.Inviter}`, async () => {
      expect.assertions(1)

      mockFunction(connectionRepository.findSingleByQuery).mockReturnValue(
        Promise.resolve(getMockConnection({ role: ConnectionRole.Invitee }))
      )

      const inboundMessage = new InboundMessageContext(jest.fn()(), {
        senderVerkey: 'senderVerkey',
        recipientVerkey: 'recipientVerkey',
      })

      return expect(connectionService.processRequest(inboundMessage)).rejects.toThrowError(
        `Connection record has invalid role ${ConnectionRole.Invitee}. Expected role ${ConnectionRole.Inviter}.`
      )
    })

    it('throws an error when the message does not contain a did doc with any recipientKeys', async () => {
      expect.assertions(1)

      const recipientVerkey = 'test-verkey'

      const connection = getMockConnection({
        role: ConnectionRole.Inviter,
        verkey: recipientVerkey,
      })

      mockFunction(connectionRepository.findSingleByQuery).mockReturnValue(Promise.resolve(connection))

      const connectionRequest = new ConnectionRequestMessage({
        did: 'did',
        label: 'test-label',
        didDoc: new DidDoc({
          id: 'did:test',
          publicKey: [],
          service: [],
          authentication: [],
        }),
      })

      const messageContext = new InboundMessageContext(connectionRequest, {
        recipientVerkey,
        senderVerkey: 'sender-verkey',
      })

      return expect(connectionService.processRequest(messageContext)).rejects.toThrowError(
        `Connection with id ${connection.id} has no recipient keys.`
      )
    })
  })

  describe('createResponse', () => {
    it('returns a connection response message containing the information from the connection record', async () => {
      expect.assertions(2)

      // Needed for signing connection~sig
      const [did, verkey] = await wallet.createDid()
      const mockConnection = getMockConnection({
        did,
        verkey,
        state: ConnectionState.Requested,
        role: ConnectionRole.Inviter,
        tags: {
          threadId: 'test',
        },
      })
      mockFunction(connectionRepository.getById).mockReturnValue(Promise.resolve(mockConnection))

      const { message, connectionRecord: connectionRecord } = await connectionService.createResponse('test')

      const connection = new Connection({
        did: mockConnection.did,
        didDoc: mockConnection.didDoc,
      })
      const plainConnection = JsonTransformer.toJSON(connection)

      expect(connectionRecord.state).toBe(ConnectionState.Responded)
      expect(await unpackAndVerifySignatureDecorator(message.connectionSig, wallet)).toEqual(plainConnection)
    })

    it(`throws an error when connection role is ${ConnectionRole.Invitee} and not ${ConnectionRole.Inviter}`, async () => {
      expect.assertions(1)

      mockFunction(connectionRepository.getById).mockReturnValue(
        Promise.resolve(
          getMockConnection({
            role: ConnectionRole.Invitee,
            state: ConnectionState.Requested,
          })
        )
      )
      return expect(connectionService.createResponse('test')).rejects.toThrowError(
        `Connection record has invalid role ${ConnectionRole.Invitee}. Expected role ${ConnectionRole.Inviter}.`
      )
    })

    const invalidConnectionStates = [
      ConnectionState.Init,
      ConnectionState.Invited,
      ConnectionState.Responded,
      ConnectionState.Complete,
    ]
    test.each(invalidConnectionStates)(
      `throws an error when connection state is %s and not ${ConnectionState.Requested}`,
      async (state) => {
        expect.assertions(1)

        mockFunction(connectionRepository.getById).mockReturnValue(Promise.resolve(getMockConnection({ state })))

        return expect(connectionService.createResponse('test')).rejects.toThrowError(
          `Connection record is in invalid state ${state}. Valid states are: ${ConnectionState.Requested}.`
        )
      }
    )
  })

  describe('processResponse', () => {
    it('returns a connection record containing the information from the connection response', async () => {
      expect.assertions(3)

      const [did, verkey] = await wallet.createDid()
      const [theirDid, theirVerkey] = await wallet.createDid()

      const connectionRecord = getMockConnection({
        did,
        verkey,
        state: ConnectionState.Requested,
        role: ConnectionRole.Invitee,
        invitation: new ConnectionInvitationMessage({
          label: 'test',
          // processResponse checks wether invitation key is same as signing key for connetion~sig
          recipientKeys: [theirVerkey],
          serviceEndpoint: 'test',
        }),
      })
      mockFunction(connectionRepository.findSingleByQuery).mockReturnValue(Promise.resolve(connectionRecord))

      const otherPartyConnection = new Connection({
        did: theirDid,
        didDoc: new DidDoc({
          id: theirDid,
          publicKey: [],
          authentication: [],
          service: [
            new DidCommService({
              id: `${did};indy`,
              serviceEndpoint: 'https://endpoint.com',
              recipientKeys: [theirVerkey],
            }),
          ],
        }),
      })

      const plainConnection = JsonTransformer.toJSON(otherPartyConnection)
      const connectionSig = await signData(plainConnection, wallet, theirVerkey)

      const connectionResponse = new ConnectionResponseMessage({
        threadId: uuid(),
        connectionSig,
      })

      const messageContext = new InboundMessageContext(connectionResponse, {
        senderVerkey: connectionRecord.theirKey!,
        recipientVerkey: connectionRecord.myKey!,
      })

      const processedConnection = await connectionService.processResponse(messageContext)

      expect(processedConnection.state).toBe(ConnectionState.Responded)
      expect(processedConnection.theirDid).toBe(theirDid)
      expect(processedConnection.theirDidDoc).toEqual(otherPartyConnection.didDoc)
    })

    it(`throws an error when connection role is ${ConnectionRole.Inviter} and not ${ConnectionRole.Invitee}`, async () => {
      expect.assertions(1)

      const inboundMessage = new InboundMessageContext(jest.fn()(), {
        senderVerkey: 'senderVerkey',
        recipientVerkey: 'recipientVerkey',
      })

      mockFunction(connectionRepository.findSingleByQuery).mockReturnValue(
        Promise.resolve(
          getMockConnection({
            role: ConnectionRole.Inviter,
            state: ConnectionState.Requested,
          })
        )
      )

      return expect(connectionService.processResponse(inboundMessage)).rejects.toThrowError(
        `Connection record has invalid role ${ConnectionRole.Inviter}. Expected role ${ConnectionRole.Invitee}.`
      )
    })

    it('throws an error when the connection sig is not signed with the same key as the recipient key from the invitation', async () => {
      expect.assertions(1)

      const [did, verkey] = await wallet.createDid()
      const [theirDid, theirVerkey] = await wallet.createDid()
      const connectionRecord = getMockConnection({
        did,
        verkey,
        role: ConnectionRole.Invitee,
        state: ConnectionState.Requested,
      })
      mockFunction(connectionRepository.findSingleByQuery).mockReturnValue(Promise.resolve(connectionRecord))

      const otherPartyConnection = new Connection({
        did: theirDid,
        didDoc: new DidDoc({
          id: theirDid,
          publicKey: [],
          authentication: [],
          service: [
            new DidCommService({
              id: `${did};indy`,
              serviceEndpoint: 'https://endpoint.com',
              recipientKeys: [theirVerkey],
            }),
          ],
        }),
      })
      const plainConnection = JsonTransformer.toJSON(otherPartyConnection)
      const connectionSig = await signData(plainConnection, wallet, theirVerkey)

      const connectionResponse = new ConnectionResponseMessage({
        threadId: uuid(),
        connectionSig,
      })

      const messageContext = new InboundMessageContext(connectionResponse, {
        senderVerkey: 'senderVerkey',
        recipientVerkey: 'recipientVerkey',
      })

      return expect(connectionService.processResponse(messageContext)).rejects.toThrowError(
        'Connection object in connection response message is not signed with same key as recipient key in invitation'
      )
    })

    it('throws an error when the connection cannot be found by verkey', async () => {
      expect.assertions(1)

      const connectionResponse = new ConnectionResponseMessage({
        threadId: uuid(),
        connectionSig: new SignatureDecorator({
          signature: '',
          signatureData: '',
          signatureType: '',
          signer: '',
        }),
      })

      const messageContext = new InboundMessageContext(connectionResponse, {
        recipientVerkey: 'test-verkey',
        senderVerkey: 'sender-verkey',
      })
      mockFunction(connectionRepository.findSingleByQuery).mockReturnValue(Promise.resolve(null))

      return expect(connectionService.processResponse(messageContext)).rejects.toThrowError(
        'Unable to process connection response: connection for verkey test-verkey not found'
      )
    })

    it('throws an error when the message does not contain a did doc with any recipientKeys', async () => {
      expect.assertions(1)

      const [did, verkey] = await wallet.createDid()
      const [theirDid, theirVerkey] = await wallet.createDid()
      const connectionRecord = getMockConnection({
        did,
        verkey,
        state: ConnectionState.Requested,
        invitation: new ConnectionInvitationMessage({
          label: 'test',
          // processResponse checks wether invitation key is same as signing key for connetion~sig
          recipientKeys: [theirVerkey],
          serviceEndpoint: 'test',
        }),
        theirDid: undefined,
        theirDidDoc: undefined,
      })
      mockFunction(connectionRepository.findSingleByQuery).mockReturnValue(Promise.resolve(connectionRecord))

      const otherPartyConnection = new Connection({
        did: theirDid,
      })
      const plainConnection = JsonTransformer.toJSON(otherPartyConnection)
      const connectionSig = await signData(plainConnection, wallet, theirVerkey)

      const connectionResponse = new ConnectionResponseMessage({
        threadId: uuid(),
        connectionSig,
      })

      const messageContext = new InboundMessageContext(connectionResponse, {
        senderVerkey: 'senderVerkey',
        recipientVerkey: 'recipientVerkey',
      })

      return expect(connectionService.processResponse(messageContext)).rejects.toThrowError(
        `Connection with id ${connectionRecord.id} has no recipient keys.`
      )
    })
  })

  describe('createTrustPing', () => {
    it('returns a trust ping message', async () => {
      expect.assertions(2)

      const mockConnection = getMockConnection({
        state: ConnectionState.Responded,
      })
      mockFunction(connectionRepository.getById).mockReturnValue(Promise.resolve(mockConnection))

      const { message, connectionRecord: connectionRecord } = await connectionService.createTrustPing('test')

      expect(connectionRecord.state).toBe(ConnectionState.Complete)
      expect(message).toEqual(expect.any(TrustPingMessage))
    })

    const invalidConnectionStates = [ConnectionState.Init, ConnectionState.Invited, ConnectionState.Requested]
    test.each(invalidConnectionStates)(
      `throws an error when connection state is %s and not ${ConnectionState.Responded} or ${ConnectionState.Complete}`,
      (state) => {
        expect.assertions(1)

        mockFunction(connectionRepository.getById).mockReturnValue(Promise.resolve(getMockConnection({ state })))
        return expect(connectionService.createTrustPing('test')).rejects.toThrowError(
          `Connection record is in invalid state ${state}. Valid states are: ${ConnectionState.Responded}, ${ConnectionState.Complete}.`
        )
      }
    )
  })

  describe('processAck', () => {
    it('throws an error when the message context does not have a connection', async () => {
      expect.assertions(1)

      const ack = new AckMessage({
        status: AckStatus.OK,
        threadId: 'thread-id',
      })

      const messageContext = new InboundMessageContext(ack, {
        recipientVerkey: 'test-verkey',
      })

      return expect(connectionService.processAck(messageContext)).rejects.toThrowError(
        'Unable to process connection ack: connection for verkey test-verkey not found'
      )
    })

    it('updates the state to Completed when the state is Responded and role is Inviter', async () => {
      expect.assertions(1)

      const connection = getMockConnection({
        state: ConnectionState.Responded,
        role: ConnectionRole.Inviter,
      })

      const ack = new AckMessage({
        status: AckStatus.OK,
        threadId: 'thread-id',
      })

      const messageContext = new InboundMessageContext(ack, {
        recipientVerkey: 'test-verkey',
        connection,
      })

      const updatedConnection = await connectionService.processAck(messageContext)

      expect(updatedConnection.state).toBe(ConnectionState.Complete)
    })

    it('does not update the state when the state is not Responded or the role is not Inviter', async () => {
      expect.assertions(1)

      const connection = getMockConnection({
        state: ConnectionState.Responded,
        role: ConnectionRole.Invitee,
      })

      const ack = new AckMessage({
        status: AckStatus.OK,
        threadId: 'thread-id',
      })

      const messageContext = new InboundMessageContext(ack, {
        recipientVerkey: 'test-verkey',
        connection,
      })

      const updatedConnection = await connectionService.processAck(messageContext)

      expect(updatedConnection.state).toBe(ConnectionState.Responded)
    })
  })

  describe('repository methods', () => {
    it('getById should return value from connectionRepository.getById', async () => {
      const expected = getMockConnection()
      mockFunction(connectionRepository.getById).mockReturnValue(Promise.resolve(expected))
      const result = await connectionService.getById(expected.id)
      expect(connectionRepository.getById).toBeCalledWith(expected.id)

      expect(result).toBe(expected)
    })

    it('getById should return value from connectionRepository.getSingleByQuery', async () => {
      const expected = getMockConnection()
      mockFunction(connectionRepository.getSingleByQuery).mockReturnValue(Promise.resolve(expected))
      const result = await connectionService.getByThreadId('threadId')
      expect(connectionRepository.getSingleByQuery).toBeCalledWith({ threadId: 'threadId' })

      expect(result).toBe(expected)
    })

    it('findById should return value from connectionRepository.findById', async () => {
      const expected = getMockConnection()
      mockFunction(connectionRepository.findById).mockReturnValue(Promise.resolve(expected))
      const result = await connectionService.findById(expected.id)
      expect(connectionRepository.findById).toBeCalledWith(expected.id)

      expect(result).toBe(expected)
    })

    it('findByVerkey should return value from connectionRepository.findSingleByQuery', async () => {
      const expected = getMockConnection()
      mockFunction(connectionRepository.findSingleByQuery).mockReturnValue(Promise.resolve(expected))
      const result = await connectionService.findByVerkey('verkey')
      expect(connectionRepository.findSingleByQuery).toBeCalledWith({ verkey: 'verkey' })

      expect(result).toBe(expected)
    })

    it('findByTheirKey should return value from connectionRepository.findSingleByQuery', async () => {
      const expected = getMockConnection()
      mockFunction(connectionRepository.findSingleByQuery).mockReturnValue(Promise.resolve(expected))
      const result = await connectionService.findByTheirKey('theirKey')
      expect(connectionRepository.findSingleByQuery).toBeCalledWith({ theirKey: 'theirKey' })

      expect(result).toBe(expected)
    })

    it('getAll should return value from connectionRepository.getAll', async () => {
      const expected = [getMockConnection(), getMockConnection()]

      mockFunction(connectionRepository.getAll).mockReturnValue(Promise.resolve(expected))
      const result = await connectionService.getAll()
      expect(connectionRepository.getAll).toBeCalledWith()

      expect(result).toEqual(expect.arrayContaining(expected))
    })
  })
})
