import type { Logger } from '../logger'
import type { FileSystem } from '../storage/FileSystem'
import type { InitConfig } from '../types'
import type { AgentDependencies } from './AgentDependencies'

import { Subject } from 'rxjs'

import { DID_COMM_TRANSPORT_QUEUE } from '../constants'
import { AriesFrameworkError } from '../error'
import { ConsoleLogger, LogLevel } from '../logger'
import { AutoAcceptCredential } from '../modules/credentials/CredentialAutoAcceptType'
import { AutoAcceptProof } from '../modules/proofs/ProofAutoAcceptType'
import { MediatorPickupStrategy } from '../modules/routing/MediatorPickupStrategy'
import { DidCommMimeType } from '../types'

export class AgentConfig {
  private initConfig: InitConfig
  public logger: Logger
  public readonly agentDependencies: AgentDependencies
  public readonly fileSystem: FileSystem

  // $stop is used for agent shutdown signal
  public readonly stop$ = new Subject<boolean>()

  public constructor(initConfig: InitConfig, agentDependencies: AgentDependencies) {
    this.initConfig = initConfig
    this.logger = initConfig.logger ?? new ConsoleLogger(LogLevel.off)
    this.agentDependencies = agentDependencies
    this.fileSystem = new agentDependencies.FileSystem()

    const { mediatorConnectionsInvite, clearDefaultMediator, defaultMediatorId } = this.initConfig

    const allowOne = [mediatorConnectionsInvite, clearDefaultMediator, defaultMediatorId].filter((e) => e !== undefined)
    if (allowOne.length > 1) {
      throw new AriesFrameworkError(
        `Only one of 'mediatorConnectionsInvite', 'clearDefaultMediator' and 'defaultMediatorId' can be set as they negate each other`
      )
    }
  }

  public get label() {
    return this.initConfig.label
  }

  public get publicDidSeed() {
    return this.initConfig.publicDidSeed
  }

  public get poolName() {
    return this.initConfig.poolName ?? 'default-pool'
  }

  public get genesisPath() {
    return this.initConfig.genesisPath
  }

  public get genesisTransactions() {
    return this.initConfig.genesisTransactions
  }

  public get walletConfig() {
    return this.initConfig.walletConfig
  }

  public get autoAcceptConnections() {
    return this.initConfig.autoAcceptConnections ?? false
  }

  public get autoAcceptProofs() {
    return this.initConfig.autoAcceptProofs ?? AutoAcceptProof.Never
  }

  public get autoAcceptCredentials() {
    return this.initConfig.autoAcceptCredentials ?? AutoAcceptCredential.Never
  }

  public get didCommMimeType() {
    return this.initConfig.didCommMimeType ?? DidCommMimeType.V0
  }

  public get mediatorPollingInterval() {
    return this.initConfig.mediatorPollingInterval ?? 5000
  }

  public get mediatorPickupStrategy() {
    return this.initConfig.mediatorPickupStrategy ?? MediatorPickupStrategy.Explicit
  }

  public getEndpoint() {
    // If we have an endpoint set, use it
    if (this.initConfig.endpoint) {
      return this.initConfig.endpoint
    }

    // Otherwise, return didcomm:transport/queue
    // https://github.com/hyperledger/aries-rfcs/issues/405#issuecomment-582612875
    return DID_COMM_TRANSPORT_QUEUE
  }

  public get mediatorConnectionsInvite() {
    return this.initConfig.mediatorConnectionsInvite
  }

  public get autoAcceptMediationRequests() {
    return this.initConfig.autoAcceptMediationRequests ?? false
  }

  public get defaultMediatorId() {
    return this.initConfig.defaultMediatorId
  }

  public get clearDefaultMediator() {
    return this.initConfig.clearDefaultMediator ?? false
  }
}
