import type { default as Indy, WalletConfig, WalletCredentials, Verkey } from 'indy-sdk'

import { AgentMessage } from './agent/AgentMessage'
import { TransportSession } from './agent/TransportService'
import { Logger } from './logger'
import { ConnectionRecord } from './modules/connections'
import { FileSystem } from './storage/fs/FileSystem'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type $FixMe = any

export type WireMessage = $FixMe

export enum DidCommMimeType {
  V0 = 'application/ssi-agent-wire',
  V1 = 'application/didcomm-envelope-enc',
}

export interface InitConfig {
  host?: string
  port?: string | number
  endpoint?: string
  label: string
  publicDidSeed?: string
  mediatorUrl?: string
  walletConfig: WalletConfig
  walletCredentials: WalletCredentials
  autoAcceptConnections?: boolean
  poolName?: string
  logger?: Logger
  indy: typeof Indy
  didCommMimeType?: DidCommMimeType
  fileSystem: FileSystem

  // Either path or transactions string can be provided
  genesisPath?: string
  genesisTransactions?: string
}

export interface UnpackedMessage {
  '@type': string
  [key: string]: unknown
}

export interface UnpackedMessageContext {
  message: UnpackedMessage
  sender_verkey?: Verkey
  recipient_verkey?: Verkey
}

export interface OutboundMessage<T extends AgentMessage = AgentMessage> {
  connection: ConnectionRecord
  endpoint?: string
  payload: T
  recipientKeys: Verkey[]
  routingKeys: Verkey[]
  senderVk: Verkey | null
}

export interface OutboundPackage {
  connection: ConnectionRecord
  payload: WireMessage
  responseRequested?: boolean
  endpoint?: string
  session?: TransportSession
}

export interface InboundConnection {
  verkey: Verkey
  connection: ConnectionRecord
}
