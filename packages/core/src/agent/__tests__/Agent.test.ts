import type { Wallet } from '../../wallet/Wallet'

import { getBaseConfig } from '../../../tests/helpers'
import { InjectionSymbols } from '../../constants'
import { BasicMessageRepository, BasicMessageService } from '../../modules/basic-messages'
import { BasicMessagesModule } from '../../modules/basic-messages/BasicMessagesModule'
import { ConnectionsModule } from '../../modules/connections/ConnectionsModule'
import { ConnectionRepository } from '../../modules/connections/repository/ConnectionRepository'
import { ConnectionService } from '../../modules/connections/services/ConnectionService'
import { TrustPingService } from '../../modules/connections/services/TrustPingService'
import { CredentialRepository, CredentialService } from '../../modules/credentials'
import { CredentialsModule } from '../../modules/credentials/CredentialsModule'
import { IndyLedgerService } from '../../modules/ledger'
import { LedgerModule } from '../../modules/ledger/LedgerModule'
import { ProofRepository, ProofService } from '../../modules/proofs'
import { ProofsModule } from '../../modules/proofs/ProofsModule'
import {
  MediatorModule,
  RecipientModule,
  MediationRepository,
  MediatorService,
  MediationRecipientService,
} from '../../modules/routing'
import { InMemoryMessageRepository } from '../../storage/InMemoryMessageRepository'
import { IndyStorageService } from '../../storage/IndyStorageService'
import { IndyWallet } from '../../wallet/IndyWallet'
import { WalletError } from '../../wallet/error'
import { Agent } from '../Agent'
import { Dispatcher } from '../Dispatcher'
import { EnvelopeService } from '../EnvelopeService'
import { MessageReceiver } from '../MessageReceiver'
import { MessageSender } from '../MessageSender'

const { config, agentDependencies: dependencies } = getBaseConfig('Agent Class Test')

describe('Agent', () => {
  describe('Initialization', () => {
    let agent: Agent

    afterEach(async () => {
      const wallet = agent.injectionContainer.resolve<Wallet>(InjectionSymbols.Wallet)

      if (wallet.isInitialized) {
        await wallet.delete()
      }
    })

    it('isInitialized should only return true after initialization', async () => {
      expect.assertions(2)

      agent = new Agent(config, dependencies)

      expect(agent.isInitialized).toBe(false)
      await agent.initialize()
      expect(agent.isInitialized).toBe(true)
    })

    it('wallet isInitialized should return true after agent initialization if wallet config is set in agent constructor', async () => {
      expect.assertions(4)

      agent = new Agent(config, dependencies)
      const wallet = agent.injectionContainer.resolve<Wallet>(InjectionSymbols.Wallet)

      expect(agent.isInitialized).toBe(false)
      expect(wallet.isInitialized).toBe(false)
      await agent.initialize()
      expect(agent.isInitialized).toBe(true)
      expect(wallet.isInitialized).toBe(true)
    })

    it('wallet must be initialized if wallet config is not set before agent can be initialized', async () => {
      expect.assertions(9)

      const { walletConfig, ...withoutWalletConfig } = config
      agent = new Agent(withoutWalletConfig, dependencies)

      const wallet = agent.injectionContainer.resolve<Wallet>(InjectionSymbols.Wallet)

      expect(agent.isInitialized).toBe(false)
      expect(wallet.isInitialized).toBe(false)

      expect(agent.initialize()).rejects.toThrowError(WalletError)
      expect(agent.isInitialized).toBe(false)
      expect(wallet.isInitialized).toBe(false)

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      await wallet.initialize(walletConfig!)
      expect(agent.isInitialized).toBe(false)
      expect(wallet.isInitialized).toBe(true)

      await agent.initialize()
      expect(wallet.isInitialized).toBe(true)
      expect(agent.isInitialized).toBe(true)
    })
  })

  describe('Dependency Injection', () => {
    it('should be able to resolve registered instances', () => {
      const agent = new Agent(config, dependencies)
      const container = agent.injectionContainer

      // Modules
      expect(container.resolve(ConnectionsModule)).toBeInstanceOf(ConnectionsModule)
      expect(container.resolve(ConnectionService)).toBeInstanceOf(ConnectionService)
      expect(container.resolve(ConnectionRepository)).toBeInstanceOf(ConnectionRepository)
      expect(container.resolve(TrustPingService)).toBeInstanceOf(TrustPingService)

      expect(container.resolve(ProofsModule)).toBeInstanceOf(ProofsModule)
      expect(container.resolve(ProofService)).toBeInstanceOf(ProofService)
      expect(container.resolve(ProofRepository)).toBeInstanceOf(ProofRepository)

      expect(container.resolve(CredentialsModule)).toBeInstanceOf(CredentialsModule)
      expect(container.resolve(CredentialService)).toBeInstanceOf(CredentialService)
      expect(container.resolve(CredentialRepository)).toBeInstanceOf(CredentialRepository)

      expect(container.resolve(BasicMessagesModule)).toBeInstanceOf(BasicMessagesModule)
      expect(container.resolve(BasicMessageService)).toBeInstanceOf(BasicMessageService)
      expect(container.resolve(BasicMessageRepository)).toBeInstanceOf(BasicMessageRepository)

      expect(container.resolve(MediatorModule)).toBeInstanceOf(MediatorModule)
      expect(container.resolve(RecipientModule)).toBeInstanceOf(RecipientModule)
      expect(container.resolve(MediationRepository)).toBeInstanceOf(MediationRepository)
      expect(container.resolve(MediatorService)).toBeInstanceOf(MediatorService)
      expect(container.resolve(MediationRecipientService)).toBeInstanceOf(MediationRecipientService)

      expect(container.resolve(LedgerModule)).toBeInstanceOf(LedgerModule)
      expect(container.resolve(IndyLedgerService)).toBeInstanceOf(IndyLedgerService)

      // Symbols, interface based
      expect(container.resolve(InjectionSymbols.Wallet)).toBeInstanceOf(IndyWallet)
      expect(container.resolve(InjectionSymbols.Logger)).toBe(config.logger)
      expect(container.resolve(InjectionSymbols.MessageRepository)).toBeInstanceOf(InMemoryMessageRepository)
      expect(container.resolve(InjectionSymbols.StorageService)).toBeInstanceOf(IndyStorageService)

      // Agent
      expect(container.resolve(MessageSender)).toBeInstanceOf(MessageSender)
      expect(container.resolve(MessageReceiver)).toBeInstanceOf(MessageReceiver)
      expect(container.resolve(Dispatcher)).toBeInstanceOf(Dispatcher)
      expect(container.resolve(EnvelopeService)).toBeInstanceOf(EnvelopeService)
    })

    it('should return the same instance for consequent resolves', () => {
      const agent = new Agent(config, dependencies)
      const container = agent.injectionContainer

      // Modules
      expect(container.resolve(ConnectionsModule)).toBe(container.resolve(ConnectionsModule))
      expect(container.resolve(ConnectionService)).toBe(container.resolve(ConnectionService))
      expect(container.resolve(ConnectionRepository)).toBe(container.resolve(ConnectionRepository))
      expect(container.resolve(TrustPingService)).toBe(container.resolve(TrustPingService))

      expect(container.resolve(ProofsModule)).toBe(container.resolve(ProofsModule))
      expect(container.resolve(ProofService)).toBe(container.resolve(ProofService))
      expect(container.resolve(ProofRepository)).toBe(container.resolve(ProofRepository))

      expect(container.resolve(CredentialsModule)).toBe(container.resolve(CredentialsModule))
      expect(container.resolve(CredentialService)).toBe(container.resolve(CredentialService))
      expect(container.resolve(CredentialRepository)).toBe(container.resolve(CredentialRepository))

      expect(container.resolve(BasicMessagesModule)).toBe(container.resolve(BasicMessagesModule))
      expect(container.resolve(BasicMessageService)).toBe(container.resolve(BasicMessageService))
      expect(container.resolve(BasicMessageRepository)).toBe(container.resolve(BasicMessageRepository))

      expect(container.resolve(MediatorModule)).toBe(container.resolve(MediatorModule))
      expect(container.resolve(RecipientModule)).toBe(container.resolve(RecipientModule))
      expect(container.resolve(MediationRepository)).toBe(container.resolve(MediationRepository))
      expect(container.resolve(MediatorService)).toBe(container.resolve(MediatorService))
      expect(container.resolve(MediationRecipientService)).toBe(container.resolve(MediationRecipientService))

      expect(container.resolve(LedgerModule)).toBe(container.resolve(LedgerModule))
      expect(container.resolve(IndyLedgerService)).toBe(container.resolve(IndyLedgerService))

      // Symbols, interface based
      expect(container.resolve(InjectionSymbols.Wallet)).toBe(container.resolve(InjectionSymbols.Wallet))
      expect(container.resolve(InjectionSymbols.Logger)).toBe(container.resolve(InjectionSymbols.Logger))
      expect(container.resolve(InjectionSymbols.MessageRepository)).toBe(
        container.resolve(InjectionSymbols.MessageRepository)
      )
      expect(container.resolve(InjectionSymbols.StorageService)).toBe(
        container.resolve(InjectionSymbols.StorageService)
      )

      // Agent
      expect(container.resolve(MessageSender)).toBe(container.resolve(MessageSender))
      expect(container.resolve(MessageReceiver)).toBe(container.resolve(MessageReceiver))
      expect(container.resolve(Dispatcher)).toBe(container.resolve(Dispatcher))
      expect(container.resolve(EnvelopeService)).toBe(container.resolve(EnvelopeService))
    })
  })
})
