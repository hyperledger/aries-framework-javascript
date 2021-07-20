import type { AgentMessage } from './agent/AgentMessage'
import type { TransportSession } from './agent/TransportService'
import type { Logger } from './logger'
import type { ConnectionRecord } from './modules/connections'
import type { AutoAcceptCredential } from './modules/credentials/CredentialAutoAcceptType'
import type { AutoAcceptProof } from './modules/proofs'
import type { MediatorPickupStrategy } from './modules/routing'

export interface WalletConfig {
  walletId: string
  walletKey: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type $FixMe = any

export type WireMessage = $FixMe

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
  senderVerkey?: string
  recipientVerkey?: string
}

export type PackedMessage = Record<string, unknown>

export interface OutboundMessage<T extends AgentMessage = AgentMessage> {
  connection: ConnectionRecord
  payload: T
}

export interface OutboundPackage {
  connection: ConnectionRecord
  payload: WireMessage
  responseRequested?: boolean
  endpoint?: string
  session?: TransportSession
}
