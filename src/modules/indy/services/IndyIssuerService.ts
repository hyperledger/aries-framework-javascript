import type Indy from 'indy-sdk'
import type {
  CredDef,
  Schema,
  Cred,
  CredDefId,
  CredOffer,
  CredReq,
  CredRevocId,
  CredValues,
  BlobReaderHandle,
} from 'indy-sdk'
import { inject, Lifecycle, scoped } from 'tsyringe'

import { FileSystem } from '../../../storage/fs/FileSystem'
import { Symbols } from '../../../symbols'
import { IndyWallet } from '../../../wallet/IndyWallet'

@scoped(Lifecycle.ContainerScoped)
export class IndyIssuerService {
  private indy: typeof Indy
  private indyWallet: IndyWallet
  private fileSystem: FileSystem

  public constructor(
    @inject(Symbols.Indy) indy: typeof Indy,
    indyWallet: IndyWallet,
    @inject(Symbols.FileSystem) fileSystem: FileSystem
  ) {
    this.indy = indy
    this.indyWallet = indyWallet
    this.fileSystem = fileSystem
  }

  /**
   * Create a new credential schema.
   *
   * @returns the schema.
   */
  public async createSchema({ originDid, name, version, attributes }: CreateSchemaOptions): Promise<Schema> {
    const [, schema] = await this.indy.issuerCreateSchema(originDid, name, version, attributes)

    return schema
  }

  /**
   * Create a new credential definition and store it in the wallet.
   *
   * @returns the credential definition.
   */
  public async createCredentialDefinition({
    issuerDid,
    schema,
    tag = 'default',
    signatureType = 'CL',
    supportRevocation = false,
  }: CreateCredentialDefinitionOptions): Promise<CredDef> {
    const [, credentialDefinition] = await this.indy.issuerCreateAndStoreCredentialDef(
      this.indyWallet.walletHandle,
      issuerDid,
      schema,
      tag,
      signatureType,
      {
        support_revocation: supportRevocation,
      }
    )

    return credentialDefinition
  }

  /**
   * Create a credential offer for the given credential definition id.
   *
   * @param credentialDefinitionId The credential definition to create an offer for
   * @returns The created credential offer
   */
  public async createCredentialOffer(credentialDefinitionId: CredDefId) {
    return this.indy.issuerCreateCredentialOffer(this.indyWallet.walletHandle, credentialDefinitionId)
  }

  /**
   * Create a credential.
   *
   * @returns Credential and revocation id
   */
  public async createCredential({
    credentialOffer,
    credentialRequest,
    credentialValues,
    revocationRegistryId,
    tailsFilePath,
  }: CreateCredentialOptions): Promise<[Cred, CredRevocId]> {
    const tailsReaderHandle = tailsFilePath ? await this.createTailsReader(tailsFilePath) : 0

    if (revocationRegistryId || tailsFilePath) {
      throw new Error('Revocation not supported yet')
    }

    const [credential, credentialRevocationId] = await this.indy.issuerCreateCredential(
      this.indyWallet.walletHandle,
      credentialOffer,
      credentialRequest,
      credentialValues,
      // TODO: update once new version of @types/indy-sdk is released
      // @ts-expect-error @types/indy-sdk contains incorrect type
      revocationRegistryId,
      tailsReaderHandle
    )

    return [credential, credentialRevocationId]
  }

  /**
   * Get a handler for the blob storage tails file reader.
   *
   * @param tailsFilePath The path of the tails file
   * @returns The blob storage reader handle
   */
  private async createTailsReader(tailsFilePath: string): Promise<BlobReaderHandle> {
    const tailsFileExists = await this.fileSystem.exists(tailsFilePath)

    // Extract directory from path (should also work with windows paths)
    const dirname = tailsFilePath.substring(
      0,
      Math.max(tailsFilePath.lastIndexOf('/'), tailsFilePath.lastIndexOf('\\'))
    )

    if (!tailsFileExists) {
      throw new Error(`Tails file does not exist at path ${tailsFilePath}`)
    }

    const tailsReaderConfig = {
      base_dir: dirname,
    }

    // TODO: update once new version of @types/indy-sdk is released
    // @ts-expect-error @types/indy-sdk contains incorrect types
    return this.indy.openBlobStorageReader('default', tailsReaderConfig)
  }
}

export interface CreateCredentialDefinitionOptions {
  issuerDid: string
  schema: Schema
  tag?: string
  signatureType?: 'CL'
  supportRevocation?: boolean
}

export interface CreateCredentialOptions {
  credentialOffer: CredOffer
  credentialRequest: CredReq
  credentialValues: CredValues
  revocationRegistryId?: string
  tailsFilePath?: string
}

export interface CreateSchemaOptions {
  originDid: string
  name: string
  version: string
  attributes: string[]
}
