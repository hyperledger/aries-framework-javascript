import type { UnpackedMessageContext } from '../types'
import type { DidConfig, Did, Verkey } from 'indy-sdk'

export interface Wallet {
  publicDid: DidInfo | undefined

  init(): Promise<void>
  close(): Promise<void>
  delete(): Promise<void>
  initPublicDid(didConfig: DidConfig): Promise<void>
  createDid(didConfig?: DidConfig): Promise<[Did, Verkey]>
  pack(payload: Record<string, unknown>, recipientKeys: Verkey[], senderVk: Verkey | null): Promise<JsonWebKey>
  unpack(messagePackage: JsonWebKey): Promise<UnpackedMessageContext>
  sign(data: Buffer, verkey: Verkey): Promise<Buffer>
  verify(signerVerkey: Verkey, data: Buffer, signature: Buffer): Promise<boolean>
  generateNonce(): Promise<string>
}

export interface DidInfo {
  did: Did
  verkey: Verkey
}
