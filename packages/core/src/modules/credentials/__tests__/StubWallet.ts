/* eslint-disable @typescript-eslint/no-unused-vars */

import type { UnpackedMessageContext, WireMessage } from '../../../types'
import type { Buffer } from '../../../utils/buffer'
import type { Wallet } from '../../../wallet/Wallet'
import type {
  DidConfig,
  WalletRecordOptions,
  WalletRecord,
  WalletQuery,
  LedgerRequest,
  WalletConfig,
  WalletCredentials,
} from 'indy-sdk'

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
  public initialize(walletConfig: WalletConfig, walletCredentials: WalletCredentials): Promise<void> {
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
  public createDid(didConfig?: DidConfig | undefined): Promise<[string, string]> {
    throw new Error('Method not implemented.')
  }

  public pack(
    payload: Record<string, unknown>,
    recipientKeys: string[],
    senderVk: string | null
  ): Promise<WireMessage> {
    throw new Error('Method not implemented.')
  }
  public unpack(messagePackage: WireMessage): Promise<UnpackedMessageContext> {
    throw new Error('Method not implemented.')
  }
  public sign(data: Buffer, verkey: string): Promise<Buffer> {
    throw new Error('Method not implemented.')
  }
  public verify(signerVerkey: string, data: Buffer, signature: Buffer): Promise<boolean> {
    throw new Error('Method not implemented.')
  }
  public addWalletRecord(type: string, id: string, value: string, tags: Record<string, string>): Promise<void> {
    throw new Error('Method not implemented.')
  }
  public updateWalletRecordValue(type: string, id: string, value: string): Promise<void> {
    throw new Error('Method not implemented.')
  }
  public updateWalletRecordTags(type: string, id: string, tags: Record<string, string>): Promise<void> {
    throw new Error('Method not implemented.')
  }
  public deleteWalletRecord(type: string, id: string): Promise<void> {
    throw new Error('Method not implemented.')
  }
  public getWalletRecord(type: string, id: string, options: WalletRecordOptions): Promise<WalletRecord> {
    throw new Error('Method not implemented.')
  }
  public search(type: string, query: WalletQuery, options: WalletRecordOptions): Promise<AsyncIterable<WalletRecord>> {
    throw new Error('Method not implemented.')
  }
  public signRequest(myDid: string, request: LedgerRequest): Promise<LedgerRequest> {
    throw new Error('Method not implemented.')
  }

  public async generateNonce(): Promise<string> {
    throw new Error('Method not implemented')
  }
}
