/* eslint-disable @typescript-eslint/no-unused-vars */

import type { PackedMessage, UnpackedMessageContext, WalletConfig } from '../../../types'
import type { Buffer } from '../../../utils/buffer'
import type { DidConfig, DidInfo, Wallet } from '../../../wallet/Wallet'

export class StubWallet implements Wallet {
  public get isInitialized() {
    return true
  }

  public get walletHandle() {
    return 0
  }
  public get publicDid() {
    return undefined
  }
  public initialize(walletConfig: WalletConfig): Promise<void> {
    return Promise.resolve()
  }
  public close(): Promise<void> {
    throw new Error('Method not implemented.')
  }

  public delete(): Promise<void> {
    throw new Error('Method not implemented.')
  }
  public initPublicDid(didConfig: DidConfig): Promise<void> {
    throw new Error('Method not implemented.')
  }
  public createDid(didConfig?: DidConfig | undefined): Promise<DidInfo> {
    throw new Error('Method not implemented.')
  }

  public pack(
    payload: Record<string, unknown>,
    recipientKeys: string[],
    senderVerkey?: string | null
  ): Promise<PackedMessage> {
    throw new Error('Method not implemented.')
  }
  public unpack(messagePackage: PackedMessage): Promise<UnpackedMessageContext> {
    throw new Error('Method not implemented.')
  }
  public sign(data: Buffer, verkey: string): Promise<Buffer> {
    throw new Error('Method not implemented.')
  }
  public verify(signerVerkey: string, data: Buffer, signature: Buffer): Promise<boolean> {
    throw new Error('Method not implemented.')
  }

  public async generateNonce(): Promise<string> {
    throw new Error('Method not implemented')
  }
}
