import type { BaseRecord, TagsBase } from './BaseRecord'
import type { StorageService, BaseRecordConstructor } from './StorageService'
import type { default as Indy, WalletQuery, WalletRecord, WalletSearchOptions } from 'indy-sdk'

import { scoped, Lifecycle } from 'tsyringe'

import { AgentConfig } from '../agent/AgentConfig'
import { RecordNotFoundError, RecordDuplicateError, IndySdkError } from '../error'
import { JsonTransformer } from '../utils/JsonTransformer'
import { isIndyError } from '../utils/indyError'
import { isBoolean } from '../utils/type'
import { IndyWallet } from '../wallet/IndyWallet'

@scoped(Lifecycle.ContainerScoped)
export class IndyStorageService<T extends BaseRecord> implements StorageService<T> {
  private wallet: IndyWallet
  private indy: typeof Indy

  private static DEFAULT_QUERY_OPTIONS = {
    retrieveType: true,
    retrieveTags: true,
  }

  public constructor(wallet: IndyWallet, agentConfig: AgentConfig) {
    this.wallet = wallet
    this.indy = agentConfig.agentDependencies.indy
  }

  private transformToRecordTagValues(tags: { [key: number]: string | undefined }): TagsBase {
    const transformedTags: TagsBase = {}

    for (const [key, value] of Object.entries(tags)) {
      // If the value is a boolean string ('1' or '0')
      // use the boolean val
      if (value === '1' && value?.includes(':')) {
        const [tagName, tagValue] = value.split(':')

        const transformedValue = transformedTags[tagName]

        if (Array.isArray(transformedValue)) {
          transformedTags[tagName] = [...transformedValue, tagValue]
        } else {
          transformedTags[tagName] = [tagValue]
        }
      } else if (value === '1' || value === '0') {
        transformedTags[key] = value === '1'
      }
      // Otherwise just use the value
      else {
        transformedTags[key] = value
      }
    }

    return transformedTags
  }

  private transformFromRecordTagValues(tags: TagsBase): { [key: string]: string | undefined } {
    const transformedTags: { [key: string]: string | undefined } = {}

    for (const [key, value] of Object.entries(tags)) {
      // If the value is a boolean use the indy
      // '1' or '0' syntax
      if (isBoolean(value)) {
        transformedTags[key] = value ? '1' : '0'
      }
      // If the value is an array we create a tag for each array
      // item ("tagName:arrayItem" = "1")
      else if (Array.isArray(value)) {
        value.forEach((item) => {
          const tagName = `${key}:${item}`
          transformedTags[tagName] = '1'
        })
      }
      // Otherwise just use the value
      else {
        transformedTags[key] = value
      }
    }

    return transformedTags
  }

  private recordToInstance(record: WalletRecord, recordClass: BaseRecordConstructor<T>): T {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const instance = JsonTransformer.deserialize<T>(record.value!, recordClass)
    instance.id = record.id

    const tags = record.tags ? this.transformToRecordTagValues(record.tags) : {}
    instance.replaceTags(tags)

    return instance
  }

  /** @inheritDoc */
  public async save(record: T) {
    const value = JsonTransformer.serialize(record)
    // FIXME: update @types/indy-sdk to be of type Record<string, string |undefined>
    const tags = this.transformFromRecordTagValues(record.getTags()) as Record<string, string>

    try {
      await this.indy.addWalletRecord(this.wallet.walletHandle, record.type, record.id, value, tags)
    } catch (error) {
      // Record already exists
      if (isIndyError(error, 'WalletItemAlreadyExists')) {
        throw new RecordDuplicateError(`Record with id ${record.id} already exists`, { recordType: record.type })
      }

      throw isIndyError(error) ? new IndySdkError(error) : error
    }
  }

  /** @inheritDoc */
  public async update(record: T): Promise<void> {
    const value = JsonTransformer.serialize(record)
    // FIXME: update @types/indy-sdk to be of type Record<string, string |undefined>
    const tags = this.transformFromRecordTagValues(record.getTags()) as Record<string, string>

    try {
      await this.indy.updateWalletRecordValue(this.wallet.walletHandle, record.type, record.id, value)
      await this.indy.updateWalletRecordTags(this.wallet.walletHandle, record.type, record.id, tags)
    } catch (error) {
      // Record does not exist
      if (isIndyError(error, 'WalletItemNotFound')) {
        throw new RecordNotFoundError(`record with id ${record.id} not found.`, {
          recordType: record.type,
          cause: error,
        })
      }

      throw isIndyError(error) ? new IndySdkError(error) : error
    }
  }

  /** @inheritDoc */
  public async delete(record: T) {
    try {
      await this.indy.deleteWalletRecord(this.wallet.walletHandle, record.type, record.id)
    } catch (error) {
      // Record does not exist
      if (isIndyError(error, 'WalletItemNotFound')) {
        throw new RecordNotFoundError(`record with id ${record.id} not found.`, {
          recordType: record.type,
          cause: error,
        })
      }

      throw isIndyError(error) ? new IndySdkError(error) : error
    }
  }

  /** @inheritDoc */
  public async getById(recordClass: BaseRecordConstructor<T>, id: string): Promise<T> {
    try {
      const record = await this.indy.getWalletRecord(
        this.wallet.walletHandle,
        recordClass.type,
        id,
        IndyStorageService.DEFAULT_QUERY_OPTIONS
      )
      return this.recordToInstance(record, recordClass)
    } catch (error) {
      if (isIndyError(error, 'WalletItemNotFound')) {
        throw new RecordNotFoundError(`record with id ${id} not found.`, {
          recordType: recordClass.type,
          cause: error,
        })
      }

      throw isIndyError(error) ? new IndySdkError(error) : error
    }
  }

  /** @inheritDoc */
  public async getAll(recordClass: BaseRecordConstructor<T>): Promise<T[]> {
    const recordIterator = this.search(recordClass.type, {}, IndyStorageService.DEFAULT_QUERY_OPTIONS)
    const records = []
    for await (const record of recordIterator) {
      records.push(this.recordToInstance(record, recordClass))
    }
    return records
  }

  /** @inheritDoc */
  public async findByQuery(
    recordClass: BaseRecordConstructor<T>,
    query: Partial<ReturnType<T['getTags']>>
  ): Promise<T[]> {
    const indyQuery = this.transformFromRecordTagValues(query as unknown as TagsBase)

    const recordIterator = await this.search(recordClass.type, indyQuery, IndyStorageService.DEFAULT_QUERY_OPTIONS)
    const records = []
    for await (const record of recordIterator) {
      records.push(this.recordToInstance(record, recordClass))
    }
    return records
  }

  private async *search(
    type: string,
    query: WalletQuery,
    { limit = Infinity, ...options }: WalletSearchOptions & { limit?: number }
  ) {
    try {
      const searchHandle = await this.indy.openWalletSearch(this.wallet.walletHandle, type, query, options)

      let records: Indy.WalletRecord[] = []

      // Allow max of 256 per fetch operation
      const chunk = limit ? Math.min(256, limit) : 256

      // Loop while limit not reached (or no limit specified)
      while (!limit || records.length < limit) {
        // Retrieve records
        const recordsJson = await this.indy.fetchWalletSearchNextRecords(this.wallet.walletHandle, searchHandle, chunk)

        // FIXME: update @types/indy-sdk: records can be null (if last reached)
        if (recordsJson.records) {
          records = [...records, ...recordsJson.records]

          for (const record of recordsJson.records) {
            yield record
          }
        }

        // If the number of records returned is less than chunk
        // It means we reached the end of the iterator (no more records)
        if (!records.length || recordsJson.records.length < chunk) {
          await this.indy.closeWalletSearch(searchHandle)

          return
        }
      }
    } catch (error) {
      throw new IndySdkError(error)
    }
  }
}
