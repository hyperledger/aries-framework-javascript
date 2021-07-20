import type { Logger } from '../logger'
import type { PackedMessage, UnpackedMessageContext, WalletConfig } from '../types'
import type { Buffer } from '../utils/buffer'
import type { Wallet, DidInfo, DidConfig } from './Wallet'
import type { default as Indy } from 'indy-sdk'

import { Lifecycle, scoped } from 'tsyringe'

import { AgentConfig } from '../agent/AgentConfig'
import { AriesFrameworkError } from '../error'
import { JsonEncoder } from '../utils/JsonEncoder'
import { isIndyError } from '../utils/indyError'

import { WalletDuplicateError, WalletNotFoundError, WalletError } from './error'

export interface IndyOpenWallet {
  walletHandle: number
  masterSecretId: string
  walletConfig: Indy.WalletConfig
  walletCredentials: Indy.WalletCredentials
}

@scoped(Lifecycle.ContainerScoped)
export class IndyWallet implements Wallet {
  private openWalletInfo?: IndyOpenWallet

  private logger: Logger
  private publicDidInfo: DidInfo | undefined
  private indy: typeof Indy

  public constructor(agentConfig: AgentConfig) {
    this.logger = agentConfig.logger
    this.indy = agentConfig.agentDependencies.indy
  }

  public get isInitialized() {
    return this.openWalletInfo !== undefined
  }

  public get publicDid() {
    return this.publicDidInfo
  }

  public get walletHandle() {
    if (!this.isInitialized || !this.openWalletInfo) {
      throw new AriesFrameworkError('Wallet has not been initialized yet')
    }

    return this.openWalletInfo.walletHandle
  }

  public get masterSecretId() {
    if (!this.isInitialized || !this.openWalletInfo) {
      throw new AriesFrameworkError('Wallet has not been initialized yet')
    }

    return this.openWalletInfo.masterSecretId
  }

  public async initialize(walletConfig: WalletConfig) {
    this.logger.info(`Initializing wallet '${walletConfig.walletId}'`, walletConfig)

    if (this.isInitialized) {
      throw new WalletError(
        'Wallet instance already initialized. Close the currently opened wallet before re-initializing the wallet'
      )
    }

    // Open wallet, creating if it doesn't exist yet
    try {
      await this.open(walletConfig)
    } catch (error) {
      // If the wallet does not exist yet, create it and try to open again
      if (error instanceof WalletNotFoundError) {
        await this.create(walletConfig)
        await this.open(walletConfig)
      } else {
        throw error
      }
    }

    this.logger.debug(`Wallet '${walletConfig.walletId}' initialized with handle '${this.walletHandle}'`)
  }

  /**
   * @throws {WalletDuplicateError} if the wallet already exists
   * @throws {WalletError} if another error occurs
   */
  public async create(walletConfig: WalletConfig): Promise<void> {
    this.logger.debug(`Creating wallet '${walletConfig.walletId}' using SQLite storage`)

    try {
      await this.indy.createWallet({ id: walletConfig.walletId }, { key: walletConfig.walletKey })
    } catch (error) {
      if (isIndyError(error, 'WalletAlreadyExistsError')) {
        const errorMessage = `Wallet '${walletConfig.walletId}' already exists`
        this.logger.debug(errorMessage)

        throw new WalletDuplicateError(errorMessage, {
          walletType: 'IndyWallet',
          cause: error,
        })
      } else {
        const errorMessage = `Error creating wallet '${walletConfig.walletId}'`
        this.logger.error(errorMessage, {
          error,
          errorMessage: error.message,
        })

        throw new WalletError(errorMessage, { cause: error })
      }
    }
  }

  /**
   * @throws {WalletNotFoundError} if the wallet does not exist
   * @throws {WalletError} if another error occurs
   */
  public async open(walletConfig: WalletConfig): Promise<void> {
    if (this.isInitialized) {
      throw new WalletError(
        'Wallet instance already initialized. Close the currently opened wallet before re-initializing the wallet'
      )
    }

    try {
      const walletHandle = await this.indy.openWallet({ id: walletConfig.walletId }, { key: walletConfig.walletKey })
      const masterSecretId = await this.createMasterSecret(walletHandle, walletConfig.walletId)

      this.openWalletInfo = {
        walletConfig: { id: walletConfig.walletId },
        walletCredentials: { key: walletConfig.walletKey },
        walletHandle,
        masterSecretId,
      }
    } catch (error) {
      if (isIndyError(error, 'WalletNotFoundError')) {
        const errorMessage = `Wallet '${walletConfig.walletId}' not found`
        this.logger.debug(errorMessage)

        throw new WalletNotFoundError(errorMessage, {
          walletType: 'IndyWallet',
          cause: error,
        })
      } else {
        const errorMessage = `Error opening wallet '${walletConfig.walletId}'`
        this.logger.error(errorMessage, {
          error,
          errorMessage: error.message,
        })

        throw new WalletError(errorMessage, { cause: error })
      }
    }
  }

  /**
   * @throws {WalletNotFoundError} if the wallet does not exist
   * @throws {WalletError} if another error occurs
   */
  public async delete(): Promise<void> {
    const walletInfo = this.openWalletInfo

    if (!this.isInitialized || !walletInfo) {
      throw new WalletError(
        'Can not delete wallet that is not initialized. Make sure to call initialize before deleting the wallet'
      )
    }

    this.logger.info(`Deleting wallet '${walletInfo.walletConfig.id}'`)

    await this.close()

    try {
      await this.indy.deleteWallet(walletInfo.walletConfig, walletInfo.walletCredentials)
    } catch (error) {
      if (isIndyError(error, 'WalletNotFoundError')) {
        const errorMessage = `Error deleting wallet: wallet '${walletInfo.walletConfig.id}' not found`
        this.logger.debug(errorMessage)

        throw new WalletNotFoundError(errorMessage, {
          walletType: 'IndyWallet',
          cause: error,
        })
      } else {
        const errorMessage = `Error deleting wallet '${walletInfo.walletConfig.id}': ${error.message}`
        this.logger.error(errorMessage, {
          error,
          errorMessage: error.message,
        })

        throw new WalletError(errorMessage, { cause: error })
      }
    }
  }

  /**
   * @throws {WalletError} if the wallet is already closed or another error occurs
   */
  public async close(): Promise<void> {
    try {
      await this.indy.closeWallet(this.walletHandle)
      this.openWalletInfo = undefined
      this.publicDidInfo = undefined
    } catch (error) {
      if (isIndyError(error, 'WalletInvalidHandle')) {
        const errorMessage = `Error closing wallet: wallet already closed`
        this.logger.debug(errorMessage)

        throw new WalletError(errorMessage, {
          cause: error,
        })
      } else {
        const errorMessage = `Error closing wallet': ${error.message}`
        this.logger.error(errorMessage, {
          error,
          errorMessage: error.message,
        })

        throw new WalletError(errorMessage, { cause: error })
      }
    }
  }

  /**
   * Create master secret with specified id in currently opened wallet.
   *
   * If a master secret by this id already exists in the current wallet, the method
   * will return without doing anything.
   *
   * @throws {WalletError} if an error occurs
   */
  private async createMasterSecret(walletHandle: number, masterSecretId: string): Promise<string> {
    this.logger.debug(`Creating master secret with id '${masterSecretId}' in wallet with handle '${walletHandle}'`)

    try {
      await this.indy.proverCreateMasterSecret(walletHandle, masterSecretId)

      return masterSecretId
    } catch (error) {
      if (isIndyError(error, 'AnoncredsMasterSecretDuplicateNameError')) {
        // master secret id is the same as the master secret id passed in the create function
        // so if it already exists we can just assign it.
        this.logger.debug(
          `Master secret with id '${masterSecretId}' already exists in wallet with handle '${walletHandle}'`,
          {
            indyError: 'AnoncredsMasterSecretDuplicateNameError',
          }
        )

        return masterSecretId
      } else {
        this.logger.error(`Error creating master secret with id ${masterSecretId}`, {
          indyError: error.indyName,
          error,
        })

        throw new WalletError(
          `Error creating master secret with id ${masterSecretId} in wallet with handle '${walletHandle}'`,
          { cause: error }
        )
      }
    }
  }

  public async initPublicDid(didConfig: DidConfig) {
    const { did, verkey } = await this.createDid(didConfig)
    this.publicDidInfo = {
      did,
      verkey,
    }
  }

  public async createDid(didConfig?: DidConfig): Promise<DidInfo> {
    try {
      const [did, verkey] = await this.indy.createAndStoreMyDid(this.walletHandle, didConfig || {})

      return { did, verkey }
    } catch (error) {
      throw new WalletError('Error creating Did', { cause: error })
    }
  }

  public async pack(
    payload: Record<string, unknown>,
    recipientKeys: string[],
    senderVerkey?: string | null
  ): Promise<PackedMessage> {
    try {
      const messageRaw = JsonEncoder.toBuffer(payload)
      const packedMessage = await this.indy.packMessage(
        this.walletHandle,
        messageRaw,
        recipientKeys,
        senderVerkey ?? null
      )
      return JsonEncoder.fromBuffer(packedMessage)
    } catch (error) {
      throw new WalletError('Error packing message', { cause: error })
    }
  }

  public async unpack(messagePackage: PackedMessage): Promise<UnpackedMessageContext> {
    try {
      const unpackedMessageBuffer = await this.indy.unpackMessage(
        this.walletHandle,
        JsonEncoder.toBuffer(messagePackage)
      )
      const unpackedMessage = JsonEncoder.fromBuffer(unpackedMessageBuffer)
      return {
        senderVerkey: unpackedMessage.sender_verkey,
        recipientVerkey: unpackedMessage.recipient_verkey,
        message: JsonEncoder.fromString(unpackedMessage.message),
      }
    } catch (error) {
      throw new WalletError('Error unpacking message', { cause: error })
    }
  }

  public async sign(data: Buffer, verkey: string): Promise<Buffer> {
    try {
      const signatureBuffer = await this.indy.cryptoSign(this.walletHandle, verkey, data)

      return signatureBuffer
    } catch (error) {
      throw new WalletError(`Error signing data with verkey ${verkey}`, { cause: error })
    }
  }

  public async verify(signerVerkey: string, data: Buffer, signature: Buffer): Promise<boolean> {
    try {
      // check signature
      const isValid = await this.indy.cryptoVerify(signerVerkey, data, signature)

      return isValid
    } catch (error) {
      throw new WalletError(`Error signing data with verkey ${signerVerkey}`, { cause: error })
    }
  }

  public async generateNonce() {
    try {
      return await this.indy.generateNonce()
    } catch (error) {
      throw new WalletError('Error generating nonce', { cause: error })
    }
  }
}
