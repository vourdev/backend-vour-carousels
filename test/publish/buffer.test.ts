import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { scheduleBufferPost } from "@/lib/publish/buffer";

describe("Buffer Publisher", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.BUFFER_TOKEN = "test_buffer_token";
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("should throw if BUFFER_TOKEN is missing", async () => {
    delete process.env.BUFFER_TOKEN;
    await expect(
      scheduleBufferPost({
        channelId: "123",
        text: "hello",
        assets: ["url"],
        dueAt: "2026-07-17T09:00:00Z",
      })
    ).rejects.toThrow("BUFFER_TOKEN environment variable is not configured");
  });

  it("should handle successful response from Buffer API", async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          createPost: {
            post: {
              id: "post_12345",
              text: "hello",
            },
          },
        },
      }),
    } as any);

    const postId = await scheduleBufferPost({
      channelId: "ig_channel",
      text: "hello #tag",
      assets: ["https://res.cloudinary.com/image1.jpg"],
      dueAt: "2026-07-17T09:00:00Z",
    });

    expect(postId).toBe("post_12345");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.buffer.com");
    expect(init?.method).toBe("POST");
    expect((init?.headers as any)["Authorization"]).toBe("Bearer test_buffer_token");

    const body = JSON.parse(init?.body as string);
    expect(body.variables.input).toEqual({
      text: "hello #tag",
      channelId: "ig_channel",
      schedulingType: "notification",
      mode: "customScheduled",
      dueAt: "2026-07-17T09:00:00Z",
      saveToDraft: false,
      assets: [{ image: { url: "https://res.cloudinary.com/image1.jpg" } }],
      metadata: {
        instagram: {
          type: "post",
          shouldShareToFeed: true,
        },
      },
    });
  });

  it("should handle TikTok metadata title correctly", async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          createPost: {
            post: {
              id: "post_67890",
            },
          },
        },
      }),
    } as any);

    await scheduleBufferPost({
      channelId: "tt_channel",
      text: "hello",
      assets: ["https://res.cloudinary.com/image1.jpg"],
      dueAt: "2026-07-17T09:00:00Z",
      isTikTok: true,
      title: "TikTok Slide Show Title",
    });

    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(init?.body as string);
    expect(body.variables.input.metadata).toEqual({
      tiktok: {
        title: "TikTok Slide Show Title",
      },
    });
  });

  it("should throw error on Buffer mutation error message", async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          createPost: {
            message: "Unsupported media type",
          },
        },
      }),
    } as any);

    await expect(
      scheduleBufferPost({
        channelId: "ig_channel",
        text: "hello",
        assets: ["url"],
        dueAt: "2026-07-17T09:00:00Z",
      })
    ).rejects.toThrow("Buffer Creation Error: Unsupported media type");
  });

  it("should throw error on GraphQL level errors", async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        errors: [{ message: "Unauthorized access to channel" }],
      }),
    } as any);

    await expect(
      scheduleBufferPost({
        channelId: "ig_channel",
        text: "hello",
        assets: ["url"],
        dueAt: "2026-07-17T09:00:00Z",
      })
    ).rejects.toThrow("Buffer GraphQL Error: Unauthorized access to channel");
  });
});
