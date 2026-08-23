import { describe, it, expect, vi, beforeEach } from "vitest";
import { Writable } from "node:stream";
import { uploadImage } from "@/lib/publish/cloudinary";
import { v2 as cloudinary } from "cloudinary";

/**
 * Slides go up as binary multipart, not as a `data:` URI.
 *
 * Base64 costs a third more bytes for the same image, and on a link dropping a large
 * share of its packets every extra byte is another chance to stall. The caller holds the
 * JPEG either way, so the encoding was buying nothing.
 */
vi.mock("cloudinary", () => ({
  v2: { uploader: { upload_stream: vi.fn() } },
}));

/** Captures what was written to the upload stream and settles the callback for the test. */
function stubStream(result: unknown, err: unknown = null) {
  const chunks: Buffer[] = [];
  const options: Record<string, unknown>[] = [];
  vi.mocked(cloudinary.uploader.upload_stream).mockImplementation(((
    opts: any,
    cb: (e: unknown, r: unknown) => void
  ) => {
    options.push(opts);
    return new Writable({
      write(chunk, _enc, next) {
        chunks.push(Buffer.from(chunk));
        next();
      },
      final(next) {
        cb(err, result);
        next();
      },
    });
  }) as any);
  return { chunks, options };
}

describe("Cloudinary Publisher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CLOUDINARY_URL = "cloudinary://api_key:api_secret@cloud_name";
  });

  it("should throw if CLOUDINARY_URL is missing", async () => {
    delete process.env.CLOUDINARY_URL;
    await expect(uploadImage("base64_data")).rejects.toThrow(
      "CLOUDINARY_URL environment variable is not configured"
    );
  });

  it("uploads the decoded bytes and returns the secure url", async () => {
    const secure_url = "https://res.cloudinary.com/cloud_name/image/upload/v1234/test.jpg";
    const { chunks, options } = stubStream({ secure_url });

    const b64 = Buffer.from("fake-jpeg-bytes").toString("base64");
    expect(await uploadImage(b64)).toBe(secure_url);

    // The wire carries the image, not its base64 expansion.
    expect(Buffer.concat(chunks).toString()).toBe("fake-jpeg-bytes");
    expect(options[0]).toMatchObject({ folder: "vourdev-carousels", resource_type: "image" });
  });

  it("strips a data URL prefix rather than uploading it as content", async () => {
    const secure_url = "https://res.cloudinary.com/cloud_name/image/upload/v1234/test.jpg";
    const { chunks } = stubStream({ secure_url });

    const b64 = Buffer.from("png-bytes").toString("base64");
    await uploadImage(`data:image/png;base64,${b64}`);
    expect(Buffer.concat(chunks).toString()).toBe("png-bytes");
  });

  /**
   * The SDK default is 60s, and a stalled upload here was measured taking 108 seconds to
   * surface as 499 — nearly two minutes spent learning a connection was already dead,
   * before the retry in uploadSlides could even start.
   */
  it("caps a single attempt so a dead socket cannot hold the deck", async () => {
    const { options } = stubStream({ secure_url: "https://cdn/x.jpg" });
    await uploadImage("aGk=");
    expect(options[0].timeout).toBe(20_000);
  });

  it("rejects when Cloudinary answers without a url", async () => {
    stubStream({});
    await expect(uploadImage("aGk=")).rejects.toThrow(/secure_url/);
  });

  it("propagates the SDK error so uploadSlides can retry it", async () => {
    stubStream(null, Object.assign(new Error("Request Timeout"), { http_code: 499 }));
    await expect(uploadImage("aGk=")).rejects.toThrow("Request Timeout");
  });
});
