import type { Logger } from '../logger'
import type { UnpackedMessageContext } from '../types'
import type { Wallet, DidInfo } from './Wallet'
import type { default as Indy, Did, DidConfig, Verkey, WalletConfig, WalletCredentials } from 'indy-sdk'

import { Lifecycle, scoped } from 'tsyringe'

import { AgentConfig } from '../agent/AgentConfig'
import { AriesFrameworkError, IndySdkError } from '../error'
import { JsonEncoder } from '../utils/JsonEncoder'
import { isIndyError } from '../utils/indyError'

@scoped(Lifecycle.ContainerScoped)
export class IndyWallet implements Wallet {
  private _walletHandle?: number
  private _masterSecretId?: string
  private walletConfig: WalletConfig
  private walletCredentials: WalletCredentials
  private logger: Logger
  private publicDidInfo: DidInfo | undefined
  private indy: typeof Indy

  public constructor(agentConfig: AgentConfig) {
    this.walletConfig = agentConfig.walletConfig
    this.walletCredentials = agentConfig.walletCredentials
    this.logger = agentConfig.logger
    this.indy = agentConfig.indy
  }

  public get publicDid() {
    return this.publicDidInfo
  }

  public get walletHandle() {
    if (!this._walletHandle) {
      throw new AriesFrameworkError('Wallet has not been initialized yet')
    }

    return this._walletHandle
  }

  public get masterSecretId() {
    // In theory this is not possible if the wallet handle is available
    if (!this._masterSecretId) {
      throw new AriesFrameworkError('Master secret has not been initialized yet')
    }

    return this._masterSecretId
  }

  public async init() {
    try {
      this.logger.info(`Initializing wallet '${this.walletConfig.id}'`, this.walletConfig)
      try {
        await this.indy.createWallet(this.walletConfig, this.walletCredentials)
      } catch (error) {
        if (isIndyError(error, 'WalletAlreadyExistsError')) {
          this.logger.debug(`Wallet '${this.walletConfig.id} already exists'`, {
            indyError: 'WalletAlreadyExistsError',
          })
        } else {
          this.logger.error(`Error opening wallet ${this.walletConfig.id}`, {
            indyError: error.indyName,
            errorMessage: error.message,
            error,
          })
          error
        }
      }

      this._walletHandle = await this.indy.openWallet(this.walletConfig, this.walletCredentials)

      try {
        this.logger.debug(`Creating master secret`)
        this._masterSecretId = await this.indy.proverCreateMasterSecret(this.walletHandle, this.walletConfig.id)
      } catch (error) {
        if (isIndyError(error, 'AnoncredsMasterSecretDuplicateNameError')) {
          // master secret id is the same as the master secret id passed in the create function
          // so if it already exists we can just assign it.
          this._masterSecretId = this.walletConfig.id
          this.logger.debug(`Master secret with id '${this.masterSecretId}' already exists`, {
            indyError: 'AnoncredsMasterSecretDuplicateNameError',
          })
        } else {
          this.logger.error(`Error creating master secret with id ${this.walletConfig.id}`, {
            indyError: error.indyName,
            error,
          })

          throw error
        }
      }

      this.logger.debug(`Wallet opened with handle: '${this.walletHandle}'`)
    } catch (error) {
      throw isIndyError(error) ? new IndySdkError(error) : error
    }
  }

  public async initPublicDid(didConfig: DidConfig) {
    const [did, verkey] = await this.createDid(didConfig)
    this.publicDidInfo = {
      did,
      verkey,
    }
  }

  public async createDid(didConfig?: DidConfig): Promise<[Did, Verkey]> {
    try {
      return this.indy.createAndStoreMyDid(this.walletHandle, didConfig || {})
    } catch (error) {
      throw new IndySdkError(error)
    }
  }

  public async pack(payload: Record<string, unknown>, recipientKeys: Verkey[], senderVk: Verkey): Promise<JsonWebKey> {
    try {
      const messageRaw = JsonEncoder.toBuffer(payload)
      const packedMessage = await this.indy.packMessage(this.walletHandle, messageRaw, recipientKeys, senderVk)
      return JsonEncoder.fromBuffer(packedMessage)
    } catch (error) {
      throw isIndyError(error) ? new IndySdkError(error) : error
    }
  }

  public async unpack(messagePackage: JsonWebKey): Promise<UnpackedMessageContext> {
    try {
      const unpackedMessageBuffer = await this.indy.unpackMessage(
        this.walletHandle,
        JsonEncoder.toBuffer(messagePackage)
      )
      const unpackedMessage = JsonEncoder.fromBuffer(unpackedMessageBuffer)
      return {
        ...unpackedMessage,
        message: JsonEncoder.fromString(unpackedMessage.message),
      }
    } catch (error) {
      throw isIndyError(error) ? new IndySdkError(error) : error
    }
  }

  public async sign(data: Buffer, verkey: Verkey): Promise<Buffer> {
    try {
      const signatureBuffer = await this.indy.cryptoSign(this.walletHandle, verkey, data)

      return signatureBuffer
    } catch (error) {
      throw isIndyError(error) ? new IndySdkError(error) : error
    }
  }

  public async verify(signerVerkey: Verkey, data: Buffer, signature: Buffer): Promise<boolean> {
    try {
      // check signature
      const isValid = await this.indy.cryptoVerify(signerVerkey, data, signature)

      return isValid
    } catch (error) {
      throw isIndyError(error) ? new IndySdkError(error) : error
    }
  }

  public async close() {
    try {
      return this.indy.closeWallet(this.walletHandle)
    } catch (error) {
      throw isIndyError(error) ? new IndySdkError(error) : error
    }
  }

  public async delete() {
    try {
      return this.indy.deleteWallet(this.walletConfig, this.walletCredentials)
    } catch (error) {
      throw isIndyError(error) ? new IndySdkError(error) : error
    }
  }

  public async generateNonce() {
    try {
      return this.indy.generateNonce()
    } catch (error) {
      throw isIndyError(error) ? new IndySdkError(error) : error
    }
  }
}
