import { Transform } from 'class-transformer'
import { Equals, IsString, ValidateIf, IsArray, ArrayNotEmpty, IsOptional } from 'class-validator'

import { AgentMessage } from '../../../agent/AgentMessage'
import { AriesFrameworkError } from '../../../error'
import { JsonEncoder } from '../../../utils/JsonEncoder'
import { JsonTransformer } from '../../../utils/JsonTransformer'
import { MessageValidator } from '../../../utils/MessageValidator'
import { replaceLegacyDidSovPrefix } from '../../../utils/messageType'

import { ConnectionMessageType } from './ConnectionMessageType'

// TODO: improve typing of `DIDInvitationData` and `InlineInvitationData` so properties can't be mixed
export interface InlineInvitationData {
  recipientKeys: string[]
  serviceEndpoint: string
  routingKeys?: string[]
}

export interface DIDInvitationData {
  did: string
}

/**
 * Message to invite another agent to create a connection
 *
 * @see https://github.com/hyperledger/aries-rfcs/blob/master/features/0160-connection-protocol/README.md#0-invitation-to-connect
 */
export class ConnectionInvitationMessage extends AgentMessage {
  /**
   * Create new ConnectionInvitationMessage instance.
   * @param options
   */
  public constructor(options: { id?: string; label: string } & (DIDInvitationData | InlineInvitationData)) {
    super()

    if (options) {
      this.id = options.id || this.generateId()
      this.label = options.label

      if (isDidInvitation(options)) {
        this.did = options.did
      } else {
        this.recipientKeys = options.recipientKeys
        this.serviceEndpoint = options.serviceEndpoint
        this.routingKeys = options.routingKeys
      }

      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      if (options.did && (options.recipientKeys || options.routingKeys || options.serviceEndpoint)) {
        throw new AriesFrameworkError(
          'either the did or the recipientKeys/serviceEndpoint/routingKeys must be set, but not both'
        )
      }
    }
  }

  @Equals(ConnectionInvitationMessage.type)
  @Transform(({ value }) => replaceLegacyDidSovPrefix(value), {
    toClassOnly: true,
  })
  public readonly type = ConnectionInvitationMessage.type
  public static readonly type = ConnectionMessageType.ConnectionInvitation

  @IsString()
  public label!: string

  @IsString()
  @ValidateIf((o: ConnectionInvitationMessage) => o.recipientKeys === undefined)
  public did?: string

  @IsString({
    each: true,
  })
  @IsArray()
  @ValidateIf((o: ConnectionInvitationMessage) => o.did === undefined)
  @ArrayNotEmpty()
  public recipientKeys?: string[]

  @IsString()
  @ValidateIf((o: ConnectionInvitationMessage) => o.did === undefined)
  public serviceEndpoint?: string

  @IsString({
    each: true,
  })
  @ValidateIf((o: ConnectionInvitationMessage) => o.did === undefined)
  @IsOptional()
  public routingKeys?: string[]

  /**
   * Create an invitation url from this instance
   *
   * @param domain domain name to use for invitation url
   * @returns invitation url with base64 encoded invitation
   */
  public toUrl(domain = 'https://example.com/ssi') {
    const invitationJson = this.toJSON()
    const encodedInvitation = JsonEncoder.toBase64URL(invitationJson)
    const invitationUrl = `${domain}?c_i=${encodedInvitation}`

    return invitationUrl
  }

  /**
   * Create a `ConnectionInvitationMessage` instance from the `c_i` parameter of an URL
   *
   * @param invitationUrl invitation url containing c_i parameter
   *
   * @throws Error when url can not be decoded to JSON, or decoded message is not a valid `ConnectionInvitationMessage`
   */
  public static async fromUrl(invitationUrl: string) {
    // TODO: properly extract c_i param from invitation URL
    const [, encodedInvitation] = invitationUrl.split('c_i=')
    const invitationJson = JsonEncoder.fromBase64(encodedInvitation)

    const invitation = JsonTransformer.fromJSON(invitationJson, ConnectionInvitationMessage)

    await MessageValidator.validate(invitation)

    return invitation
  }
}

/**
 * Check whether an invitation is a `DIDInvitationData` object
 *
 * @param invitation invitation object
 */
function isDidInvitation(invitation: InlineInvitationData | DIDInvitationData): invitation is DIDInvitationData {
  return (invitation as DIDInvitationData).did !== undefined
}
