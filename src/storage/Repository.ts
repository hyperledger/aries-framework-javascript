import type { WalletQuery } from 'indy-sdk'

import { BaseRecord } from './BaseRecord'
import { BaseRecordConstructor } from './IndyStorageService'
import { StorageService } from './StorageService'

export class Repository<T extends BaseRecord> {
  private storageService: StorageService<T>
  private recordType: BaseRecordConstructor<T>

  public constructor(recordType: BaseRecordConstructor<T>, storageService: StorageService<T>) {
    this.storageService = storageService
    this.recordType = recordType
  }

  public async save(record: T): Promise<void> {
    this.storageService.save(record)
  }

  public async update(record: T): Promise<void> {
    return this.storageService.update(record)
  }

  public async delete(record: T): Promise<void> {
    return this.storageService.delete(record)
  }

  public async find(id: string): Promise<T> {
    return this.storageService.find(this.recordType, id, this.recordType.type)
  }

  public async findAll(): Promise<T[]> {
    return this.storageService.findAll(this.recordType, this.recordType.type)
  }

  public async findByQuery(query: WalletQuery): Promise<T[]> {
    return this.storageService.findByQuery(this.recordType, this.recordType.type, query)
  }
}
