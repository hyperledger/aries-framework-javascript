import { Expose, Transform, TransformationType, Type } from 'class-transformer'
import { IsInstance, IsOptional, IsString, ValidateNested } from 'class-validator'

export class AttributeValue {
  public constructor(options: AttributeValue) {
    this.name = options.name
    this.value = options.value
  }

  @IsString()
  public name: string

  @IsString()
  public value: string
}

export class AttributeFilter {
  public constructor(options: AttributeFilter) {
    if (options) {
      this.schemaId = options.schemaId
      this.schemaIssuerDid = options.schemaIssuerDid
      this.schemaName = options.schemaName
      this.schemaVersion = options.schemaVersion
      this.issuerDid = options.issuerDid
      this.credentialDefinitionId = options.credentialDefinitionId
      this.attributeValue = options.attributeValue
    }
  }

  @Expose({ name: 'schema_id' })
  @IsOptional()
  @IsString()
  public schemaId?: string

  @Expose({ name: 'schema_issuer_did' })
  @IsOptional()
  @IsString()
  public schemaIssuerDid?: string

  @Expose({ name: 'schema_name' })
  @IsOptional()
  @IsString()
  public schemaName?: string

  @Expose({ name: 'schema_version' })
  @IsOptional()
  @IsString()
  public schemaVersion?: string

  @Expose({ name: 'issuer_did' })
  @IsOptional()
  @IsString()
  public issuerDid?: string

  @Expose({ name: 'cred_def_id' })
  @IsOptional()
  @IsString()
  public credentialDefinitionId?: string

  @IsOptional()
  @Type(() => AttributeValue)
  @ValidateNested()
  @IsInstance(AttributeValue)
  public attributeValue?: AttributeValue
}

/**
 * Decorator that transforms attribute filter to corresponding class instances.
 * Needed for transformation of attribute value filter.
 *
 * Transforms attribute value between these formats:
 *
 * JSON:
 * ```json
 * {
 *  "attr::test_prop::value": "test_value"
 * }
 * ```
 *
 * Class:
 * ```json
 * {
 *  "attributeValue": {
 *    "name": "test_props",
 *    "value": "test_value"
 *  }
 * }
 * ```
 *
 * @example
 * class Example {
 *   AttributeFilterTransformer()
 *   public attributeFilter?: AttributeFilter;
 * }
 *
 * @see https://github.com/hyperledger/aries-framework-dotnet/blob/a18bef91e5b9e4a1892818df7408e2383c642dfa/src/Hyperledger.Aries/Features/PresentProof/Models/AttributeFilterConverter.cs
 */
export function AttributeFilterTransformer() {
  return Transform(({ value: attributeFilter, type: transformationType }) => {
    switch (transformationType) {
      case TransformationType.CLASS_TO_PLAIN:
        if (attributeFilter.attributeValue) {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          attributeFilter[`attr::${attributeFilter.attributeValue.name}::value`] = attributeFilter.attributeValue.value
          delete attributeFilter.attributeValue
        }

        return attributeFilter

      case TransformationType.PLAIN_TO_CLASS:
        for (const [key, value] of Object.entries(attributeFilter)) {
          const match = new RegExp('^attr::([^:]+)::(value)$').exec(key)

          if (match) {
            const attributeValue = new AttributeValue({
              name: match[1],
              value: value as string,
            })

            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            delete attributeFilter[key]
            attributeFilter.attributeValue = attributeValue

            return attributeFilter
          }
        }
        return attributeFilter
      default:
        return attributeFilter
    }
  })
}
