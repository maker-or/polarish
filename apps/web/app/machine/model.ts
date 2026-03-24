import { Provider, type ProviderType } from "@hax/ai";
import { Schema } from "effect";
import { Elysia, t } from "elysia";

export const BearerHeaders = t.Object(
  {
    authorization: t.String({
      pattern: "^Bearer .+$",
      error: "Authorization header must be in the format: Bearer <token>",
    }),
  },
  { additionalProperties: true },
);

export type BearerHeaders = typeof BearerHeaders.static;

export const OpenAIErrorBody = Schema.Struct({
  error: Schema.Struct({
    message: Schema.String,
    type: Schema.Union(
      Schema.Literal("invalid_request_error"),
      Schema.Literal("api_error"),
      Schema.Literal("rate_limit_error"),
    ),
    code: Schema.Union(
      Schema.Literal("invalid_api_key"),
      Schema.Literal("invalid_request_error"),
      Schema.Literal("server_error"),
      Schema.Literal("rate_limit_exceeded"),
    ),
    param: Schema.NullOr(Schema.String),
  }),
});

export type OpenAIErrorBody = Schema.Schema.Type<typeof OpenAIErrorBody>;

export const TokenValidationResponse = Schema.Struct({
  valid: Schema.Boolean,
  userId: Schema.NullOr(Schema.String),
});

export type TokenValidationResponse = Schema.Schema.Type<
  typeof TokenValidationResponse
>;

export const CredentialLookupRequest = Schema.Struct({
  userId: Schema.String,
  provider: Provider,
});

export type CredentialLookupRequest = Schema.Schema.Type<
  typeof CredentialLookupRequest
>;

export const CredentialLookupResponse = Schema.NullOr(
  Schema.Struct({
    _id: Schema.String,
    _creationTime: Schema.Number,
    userId: Schema.String,
    orgId: Schema.String,
    provider: Provider,
    provider_subscriptionType: Schema.optional(Schema.String),
    provider_user_id: Schema.optional(Schema.String),
    provider_account_id: Schema.optional(Schema.String),
    provider_sub_active_start: Schema.optional(Schema.String),
    provider_sub_active_until: Schema.optional(Schema.String),
    accessToken: Schema.String,
    token_id: Schema.optional(Schema.String),
    refresh_token: Schema.optional(Schema.String),
    expiresAt: Schema.optional(Schema.Number),
    updatedAt: Schema.Number,
  }),
);

export type CredentialLookupResponse = Schema.Schema.Type<
  typeof CredentialLookupResponse
>;

export type CredentialProvider = ProviderType;

export const OpenAIRefreshTokenResponse = Schema.Struct({
  access_token: Schema.String,
});

export type OpenAIRefreshTokenResponse = Schema.Schema.Type<
  typeof OpenAIRefreshTokenResponse
>;

export const MachineModel = new Elysia({ name: "machine.model" }).model({
  "machine.headers": BearerHeaders,
});
