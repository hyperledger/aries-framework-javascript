import type { AgentMessage } from './agent/AgentMessage'
import type { Logger } from './logger'
import type { ConnectionRecord, DidCommService } from './modules/connections'
import type { AutoAcceptCredential } from './modules/credentials/CredentialAutoAcceptType'
import type { AutoAcceptProof } from './modules/proofs'
import type { MediatorPickupStrategy } from './modules/routing'
import type { Verkey, WalletConfig, WalletCredentials } from 'indy-sdk'

export type WireMessage = {
  protected: unknown
  iv: unknown
  ciphertext: unknown
  tag: unknown
}

export enum DidCommMimeType {
  V0 = 'application/ssi-agent-wire',
  V1 = 'application/didcomm-envelope-enc',
}

export interface InitConfig {
  endpoint?: string
  label: string
  publicDidSeed?: string
  mediatorRecordId?: string
  walletConfig?: WalletConfig
  walletCredentials?: WalletCredentials
  autoAcceptConnections?: boolean
  autoAcceptProofs?: AutoAcceptProof
  autoAcceptCredentials?: AutoAcceptCredential
  poolName?: string
  logger?: Logger
  didCommMimeType?: DidCommMimeType

  // Either path or transactions string can be provided
  genesisPath?: string
  genesisTransactions?: string

  autoAcceptMediationRequests?: boolean
  mediatorConnectionsInvite?: string
  defaultMediatorId?: string
  clearDefaultMediator?: boolean
  mediatorPollingInterval?: number
  mediatorPickupStrategy?: MediatorPickupStrategy
}

export interface UnpackedMessage {
  '@type': string
  [key: string]: unknown
}

export interface UnpackedMessageContext {
  message: UnpackedMessage
  senderVerkey?: Verkey
  recipientVerkey?: Verkey
}

export interface OutboundMessage<T extends AgentMessage = AgentMessage> {
  payload: T
  connection: ConnectionRecord
}

export interface OutboundServiceMessage<T extends AgentMessage = AgentMessage> {
  payload: T
  service: DidCommService
  senderKey: string
}

export interface OutboundPackage {
  payload: WireMessage
  responseRequested?: boolean
  endpoint?: string
}

export interface InboundConnection {
  verkey: Verkey
  connection: ConnectionRecord
}
