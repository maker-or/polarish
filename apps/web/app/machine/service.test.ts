import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Effect } from "effect";
import {
  compileRequest,
  type AppRequestShapeType,
} from "@hax/ai";

type AxiosArgs = [string, unknown?, Record<string, unknown>?];
type AxiosResponse = {
  status: number;
  data: unknown;
  headers: Record<string, string | undefined>;
};

let postImpl: (...args: AxiosArgs) => Promise<AxiosResponse>;
let getImpl: (url: string, config?: Record<string, unknown>) => Promise<AxiosResponse>;

const axiosPost = mock((...args: AxiosArgs) => postImpl(...args));
const axiosGet = mock((url: string, config?: Record<string, unknown>) =>
  getImpl(url, config),
);

mock.module("axios", () => {
  const axios = {
    post: (...args: AxiosArgs) => axiosPost(...args),
    get: (url: string, config?: Record<string, unknown>) =>
      axiosGet(url, config),
  };

  return {
    default: axios,
    post: axios.post,
    get: axios.get,
  };
});

const { handleRequest } = await import("./service.ts");

const headers = {
  authorization: "Bearer test-token",
};

const request: AppRequestShapeType = {
  provider: "openai-codex",
  model: "gpt-5.4",
  system: "Be concise.",
  stream: true,
  temperature: 0.2,
  maxRetries: 2,
  messages: [
    {
      role: "user",
      content: "Say hello.",
      timestamp: 1,
    },
  ],
};

beforeEach(() => {
  axiosPost.mockClear();
  axiosGet.mockClear();
  postImpl = async () => {
    throw new Error("unconfigured axios.post mock");
  };
  getImpl = async () => {
    throw new Error("unconfigured axios.get mock");
  };
});

describe("handleRequest", () => {
  test("rejects the legacy OpenAI-style request body", async () => {
    postImpl = async (url) => {
      expect(url).toBe("https://cautious-platypus-49.convex.site/verify-api-key");
      return {
        status: 200,
        data: { valid: true, userId: "user-1" },
        headers: {},
      };
    };

    const result = await Effect.runPromise(
      Effect.either(
        handleRequest(headers, {
          model: "gpt-5.4",
          instructions: "legacy",
          messages: [],
          stream: true,
        }),
      ),
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left._tag).toBe("BodyParseError");
      expect(result.left.message).toContain("Invalid request body");
    }
  });

  test("rejects stream false for openai-codex (upstream requires streaming)", async () => {
    postImpl = async (url) => {
      expect(url).toBe("https://cautious-platypus-49.convex.site/verify-api-key");
      return {
        status: 200,
        data: { valid: true, userId: "user-1" },
        headers: {},
      };
    };

    const result = await Effect.runPromise(
      Effect.either(
        handleRequest(headers, {
          ...request,
          stream: false,
        }),
      ),
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left._tag).toBe("BodyParseError");
      expect(result.left.message).toContain("stream: true");
    }
  });

  test("compiles the unified request and proxies it upstream", async () => {
    const expectedPayload = compileRequest(request);

    postImpl = async (url, data, config) => {
      if (url === "https://cautious-platypus-49.convex.site/verify-api-key") {
        return {
          status: 200,
          data: { valid: true, userId: "user-1" },
          headers: {},
        };
      }

      if (url === "https://chatgpt.com/backend-api/codex/responses") {
        expect(data).toEqual(expectedPayload);
        expect(config?.headers).toMatchObject({
          Authorization: "Bearer access-token",
          "ChatGPT-Account-Id": "acct_123",
          "Content-Type": "application/json",
        });

        return {
          status: 200,
          data: JSON.stringify({ id: "resp_123" }),
          headers: {
            "content-type": "application/json",
            "x-request-id": "up_req_123",
          },
        };
      }

      throw new Error(`unexpected post url: ${url}`);
    };

    getImpl = async (url, config) => {
      expect(url).toBe("https://cautious-platypus-49.convex.site/credentials");
      expect(config?.params).toEqual({
        userId: "user-1",
        provider: "openai-codex",
      });

      return {
        status: 200,
        data: {
          _id: "cred_1",
          _creationTime: 1,
          userId: "user-1",
          orgId: "org_1",
          provider: "openai-codex",
          provider_account_id: "acct_123",
          accessToken: "access-token",
          refresh_token: "refresh-token",
          updatedAt: 1,
        },
        headers: {},
      };
    };

    const response = await Effect.runPromise(handleRequest(headers, request));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(JSON.stringify({ id: "resp_123" }));
    expect(response.headers.get("x-request-id")).toBe("up_req_123");
    expect(response.headers.get("x-machine-request-id")).toBeTruthy();
  });

  test("refreshes the access token after an upstream 401", async () => {
    const expectedPayload = compileRequest(request);

    postImpl = async (url, data, config) => {
      if (url === "https://cautious-platypus-49.convex.site/verify-api-key") {
        return {
          status: 200,
          data: { valid: true, userId: "user-1" },
          headers: {},
        };
      }

      if (url === "https://chatgpt.com/backend-api/codex/responses") {
        expect(data).toEqual(expectedPayload);

        const authHeader = (config?.headers as Record<string, string>).Authorization;
        if (authHeader === "Bearer stale-token") {
          return {
            status: 401,
            data: { error: "expired" },
            headers: {},
          };
        }

        if (authHeader === "Bearer refreshed-token") {
          return {
            status: 200,
            data: JSON.stringify({ id: "resp_456" }),
            headers: {
              "content-type": "application/json",
            },
          };
        }
      }

      if (url === "https://auth.openai.com/oauth/token") {
        return {
          status: 200,
          data: { access_token: "refreshed-token" },
          headers: {},
        };
      }

      throw new Error(`unexpected post url: ${url}`);
    };

    getImpl = async () => ({
      status: 200,
      data: {
        _id: "cred_1",
        _creationTime: 1,
        userId: "user-1",
        orgId: "org_1",
        provider: "openai-codex",
        accessToken: "stale-token",
        refresh_token: "refresh-token",
        updatedAt: 1,
      },
      headers: {},
    });

    const response = await Effect.runPromise(handleRequest(headers, request));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(JSON.stringify({ id: "resp_456" }));
  });
});
