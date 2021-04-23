import type { Verkey } from 'indy-sdk'
import { v4 as uuid } from 'uuid'
import { BaseRecord, RecordType, Tags } from '../../../storage/BaseRecord'
import { MediationRole, MediationState } from '../models/MediationStates'

export interface MediationRecordProps {
  id?: string
  state: MediationState
  role: string
  createdAt?: number
  connectionId: string
  endpoint: string
  recipientKeys: [Verkey]
}

export interface MediationTags extends Tags {
  state: string
  role: string
  connectionId: string
}

export interface MediationStorageProps extends MediationRecordProps {
  tags: MediationTags
}

export class MediationRecord extends BaseRecord implements MediationStorageProps {
  public state: MediationState
  public role: string
  public tags: MediationTags
  public connectionId: string
  public endpoint: string
  public recipientKeys: [Verkey]

  public static readonly type: RecordType = RecordType.MediationRecord
  public readonly type = MediationRecord.type

  public constructor(props: MediationStorageProps) {
    super(props.id ?? uuid(), Date.now())
    this.connectionId = props.connectionId
    this.recipientKeys = props.recipientKeys
    this.tags = props.tags
    this.state = props.state
    this.role = props.role
    this.connectionId = props.connectionId
    this.endpoint = props.endpoint
  }

  public assertState(expectedStates: MediationState | MediationState[]) {
    if (!Array.isArray(expectedStates)) {
      expectedStates = [expectedStates]
    }

    if (!expectedStates.includes(this.state)) {
      throw new Error(
        `Mediation record is in invalid state ${this.state}. Valid states are: ${expectedStates.join(', ')}.`
      )
    }
  }

  public assertRole(expectedRole: MediationRole) {
    if (this.role !== expectedRole) {
      throw new Error(`Mediation record has invalid role ${this.role}. Expected role ${expectedRole}.`)
    }
  }
}