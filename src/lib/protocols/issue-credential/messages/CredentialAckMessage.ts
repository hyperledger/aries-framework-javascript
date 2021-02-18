import { Equals } from 'class-validator';
import { AgentMessage } from '../../../agent/AgentMessage';
import { IssueCredentialMessageType } from './IssueCredentialMessageType';

interface CredentialAckMessageOptions {
  id?: string;
}

export class CredentialAckMessage extends AgentMessage {
  public constructor(options: CredentialAckMessageOptions) {
    super();

    if (options) {
      this.id = options.id ?? this.generateId();
    }
  }

  @Equals(CredentialAckMessage.type)
  public readonly type = CredentialAckMessage.type;
  public static readonly type = IssueCredentialMessageType.CredentialAck;
}
