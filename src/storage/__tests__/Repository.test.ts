import { Repository } from '../Repository'
import { TestRecord } from './TestRecord'
import { IndyStorageService } from '../IndyStorageService'
import { AriesFrameworkError, RecordDuplicateError, RecordNotFoundError } from '../../error'
import { WalletQuery } from 'indy-sdk'

jest.mock('../IndyStorageService')

const StorageMock = (IndyStorageService as unknown) as jest.Mock<IndyStorageService<TestRecord>>

describe('Repository', () => {
  let repository: Repository<TestRecord>
  let storageMock: IndyStorageService<TestRecord>

  let mockSave: jest.Mock<Promise<void>, [TestRecord]>
  let mockUpdate: jest.Mock<Promise<void>, [TestRecord]>
  let mockDelete: jest.Mock<Promise<void>, [TestRecord]>
  let mockGetById: jest.Mock<Promise<TestRecord>, [typeof TestRecord, string]>
  let mockGetAll: jest.Mock<Promise<TestRecord[]>, [typeof TestRecord]>
  let mockFindByQuery: jest.Mock<Promise<TestRecord[]>, [typeof TestRecord, WalletQuery]>

  beforeEach(async () => {
    storageMock = new StorageMock()
    repository = new Repository(TestRecord, storageMock)

    mockSave = storageMock.save as jest.Mock<Promise<void>, [TestRecord]>
    mockUpdate = storageMock.update as jest.Mock<Promise<void>, [TestRecord]>
    mockDelete = storageMock.delete as jest.Mock<Promise<void>, [TestRecord]>
    mockGetById = storageMock.getById as jest.Mock<Promise<TestRecord>, [typeof TestRecord, string]>
    mockGetAll = storageMock.getAll as jest.Mock<Promise<TestRecord[]>, [typeof TestRecord]>
    mockFindByQuery = storageMock.findByQuery as jest.Mock<Promise<TestRecord[]>, [typeof TestRecord, WalletQuery]>
  })

  const getRecord = ({ id, tags }: { id?: string; tags?: Record<string, string> } = {}) => {
    return new TestRecord({
      id,
      foo: 'bar',
      tags: tags ?? { myTag: 'foobar' },
    })
  }

  describe('save()', () => {
    it('should save the record using the storage service', async () => {
      const record = getRecord({ id: 'test-id' })
      await repository.save(record)

      expect(mockSave).toBeCalledWith(record)
    })
  })

  describe('update()', () => {
    it('should update the record using the storage service', async () => {
      const record = getRecord({ id: 'test-id' })
      await repository.update(record)

      expect(mockUpdate).toBeCalledWith(record)
    })
  })

  describe('delete()', () => {
    it('should delete the record using the storage service', async () => {
      const record = getRecord({ id: 'test-id' })
      await repository.delete(record)

      expect(mockDelete).toBeCalledWith(record)
    })
  })

  describe('getById()', () => {
    it('should get the record using the storage service', async () => {
      const record = getRecord({ id: 'test-id' })
      mockGetById.mockReturnValue(Promise.resolve(record))

      const returnValue = await repository.getById('test-id')

      expect(mockGetById).toBeCalledWith(TestRecord, 'test-id')
      expect(returnValue).toBe(record)
    })
  })

  describe('findById()', () => {
    it('should get the record using the storage service', async () => {
      const record = getRecord({ id: 'test-id' })
      mockGetById.mockReturnValue(Promise.resolve(record))

      const returnValue = await repository.findById('test-id')

      expect(mockGetById).toBeCalledWith(TestRecord, 'test-id')
      expect(returnValue).toBe(record)
    })

    it('should return null if the storage service throws RecordNotFoundError', async () => {
      mockGetById.mockReturnValue(Promise.reject(new RecordNotFoundError('Not found', { recordType: TestRecord.type })))

      const returnValue = await repository.findById('test-id')

      expect(mockGetById).toBeCalledWith(TestRecord, 'test-id')
      expect(returnValue).toBeNull()
    })

    it('should return null if the storage service throws an error that is not RecordNotFoundError', async () => {
      mockGetById.mockReturnValue(Promise.reject(new AriesFrameworkError('Not found')))

      expect(repository.findById('test-id')).rejects.toThrowError(AriesFrameworkError)
      expect(mockGetById).toBeCalledWith(TestRecord, 'test-id')
    })
  })

  describe('getAll()', () => {
    it('should get the records using the storage service', async () => {
      const record = getRecord({ id: 'test-id' })
      const record2 = getRecord({ id: 'test-id2' })
      mockGetAll.mockReturnValue(Promise.resolve([record, record2]))

      const returnValue = await repository.getAll()

      expect(mockGetAll).toBeCalledWith(TestRecord)
      expect(returnValue).toEqual(expect.arrayContaining([record, record2]))
    })
  })

  describe('findByQuery()', () => {
    it('should get the records using the storage service', async () => {
      const record = getRecord({ id: 'test-id' })
      const record2 = getRecord({ id: 'test-id2' })
      mockFindByQuery.mockReturnValue(Promise.resolve([record, record2]))

      const returnValue = await repository.findByQuery({ something: 'interesting' })

      expect(mockFindByQuery).toBeCalledWith(TestRecord, { something: 'interesting' })
      expect(returnValue).toEqual(expect.arrayContaining([record, record2]))
    })
  })

  describe('findSingleByQuery()', () => {
    it('should get the record using the storage service', async () => {
      const record = getRecord({ id: 'test-id' })
      mockFindByQuery.mockReturnValue(Promise.resolve([record]))

      const returnValue = await repository.findSingleByQuery({ something: 'interesting' })

      expect(mockFindByQuery).toBeCalledWith(TestRecord, { something: 'interesting' })
      expect(returnValue).toBe(record)
    })

    it('should return null if the no records are returned by the storage service', async () => {
      mockFindByQuery.mockReturnValue(Promise.resolve([]))

      const returnValue = await repository.findSingleByQuery({ something: 'interesting' })

      expect(mockFindByQuery).toBeCalledWith(TestRecord, { something: 'interesting' })
      expect(returnValue).toBeNull()
    })

    it('should throw RecordDuplicateError if more than one record is returned by the storage service', async () => {
      const record = getRecord({ id: 'test-id' })
      const record2 = getRecord({ id: 'test-id2' })
      mockFindByQuery.mockReturnValue(Promise.resolve([record, record2]))

      expect(repository.findSingleByQuery({ something: 'interesting' })).rejects.toThrowError(RecordDuplicateError)
      expect(mockFindByQuery).toBeCalledWith(TestRecord, { something: 'interesting' })
    })
  })

  describe('getSingleByQuery()', () => {
    it('should get the record using the storage service', async () => {
      const record = getRecord({ id: 'test-id' })
      mockFindByQuery.mockReturnValue(Promise.resolve([record]))

      const returnValue = await repository.getSingleByQuery({ something: 'interesting' })

      expect(mockFindByQuery).toBeCalledWith(TestRecord, { something: 'interesting' })
      expect(returnValue).toBe(record)
    })

    it('should throw RecordNotFoundError if no records are returned by the storage service', async () => {
      mockFindByQuery.mockReturnValue(Promise.resolve([]))

      expect(repository.getSingleByQuery({ something: 'interesting' })).rejects.toThrowError(RecordNotFoundError)
      expect(mockFindByQuery).toBeCalledWith(TestRecord, { something: 'interesting' })
    })

    it('should throw RecordDuplicateError if more than one record is returned by the storage service', async () => {
      const record = getRecord({ id: 'test-id' })
      const record2 = getRecord({ id: 'test-id2' })
      mockFindByQuery.mockReturnValue(Promise.resolve([record, record2]))

      expect(repository.getSingleByQuery({ something: 'interesting' })).rejects.toThrowError(RecordDuplicateError)
      expect(mockFindByQuery).toBeCalledWith(TestRecord, { something: 'interesting' })
    })
  })
})
