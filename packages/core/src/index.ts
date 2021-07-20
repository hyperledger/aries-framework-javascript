// reflect-metadata used for class-transformer + class-validator
import 'reflect-metadata'

export { Agent } from './agent/Agent'
export { AgentConfig } from './agent/AgentConfig'
export type { AgentDependencies } from './agent/AgentDependencies'
export type { InitConfig, OutboundPackage, WireMessage } from './types'
export { DidCommMimeType } from './types'
export type { FileSystem } from './storage/FileSystem'
export { InMemoryMessageRepository } from './storage/InMemoryMessageRepository'
export { getDirFromFilePath } from './utils/path'
export { InjectionSymbols } from './constants'
export type { Wallet } from './wallet/Wallet'
export type { TransportSession } from './agent/TransportService'
export { TransportService } from './agent/TransportService'

import { uuid } from './utils/uuid'

export * from './transport'
export * from './modules/basic-messages'
export * from './modules/credentials'
export * from './modules/proofs'
export * from './modules/connections'
export * from './modules/ledger'
export * from './modules/routing'
export * from './utils/JsonTransformer'
export * from './logger'
export * from './error'

const utils = {
  uuid,
}

export { utils }
