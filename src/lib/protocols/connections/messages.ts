import uuid from 'uuid/v4';
import { InvitationDetails } from './domain/InvitationDetails';
import { ConnectionRecord } from '../../storage/ConnectionRecord';

export enum MessageType {
  ConnectionInvitation = 'did:sov:BzCbsNYhMrjHiqZDTUASHg;spec/connections/1.0/invitation',
  ConnectionRequest = 'did:sov:BzCbsNYhMrjHiqZDTUASHg;spec/connections/1.0/request',
  ConnectionResponse = 'did:sov:BzCbsNYhMrjHiqZDTUASHg;spec/connections/1.0/response',
  Ack = 'did:sov:BzCbsNYhMrjHiqZDTUASHg;spec/notification/1.0/ack',
}

export async function createInvitationMessage({
  label,
  serviceEndpoint,
  recipientKeys,
  routingKeys,
}: InvitationDetails) {
  return {
    '@type': MessageType.ConnectionInvitation,
    '@id': uuid(),
    label,
    recipientKeys,
    serviceEndpoint,
    routingKeys,
  };
}

export function createConnectionRequestMessage(connection: ConnectionRecord, label: string) {
  return {
    '@type': MessageType.ConnectionRequest,
    '@id': uuid(),
    label: label,
    connection: {
      DID: connection.did,
      DIDDoc: connection.didDoc,
    },
  };
}

export function createConnectionResponseMessage(connection: ConnectionRecord, thid: string) {
  return {
    '@type': MessageType.ConnectionResponse,
    '@id': uuid(),
    '~thread': {
      thid,
    },
    connection: {
      DID: connection.did,
      DIDDoc: connection.didDoc,
    },
  };
}

export function createAckMessage(thid: string) {
  return {
    '@type': MessageType.Ack,
    '@id': uuid(),
    status: 'OK',
    '~thread': {
      thid: thid,
    },
  };
}
