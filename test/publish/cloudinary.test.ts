import { describe, it, expect, vi, beforeEach } from "vitest";
import { uploadImage } from "@/lib/publish/cloudinary";
import { v2 as cloudinary } from "cloudinary";

vi.mock("cloudinary", () => {
  return {
    v2: {
      uploader: {
        upload: vi.fn(),
      },
    },
  };
});

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

  it("should upload image and return secure url", async () => {
    const mockUpload = vi.mocked(cloudinary.uploader.upload);
    mockUpload.mockResolvedValueOnce({
      secure_url: "https://res.cloudinary.com/cloud_name/image/upload/v1234/test.jpg",
    } as any);

    const url = await uploadImage("base64_data");
    expect(url).toBe("https://res.cloudinary.com/cloud_name/image/upload/v1234/test.jpg");
    expect(mockUpload).toHaveBeenCalledWith("data:image/jpeg;base64,base64_data", {
      folder: "vourdev-carousels",
      resource_type: "image",
    });
  });

  it("should preserve existing data URL prefix", async () => {
    const mockUpload = vi.mocked(cloudinary.uploader.upload);
    mockUpload.mockResolvedValueOnce({
      secure_url: "https://res.cloudinary.com/cloud_name/image/upload/v1234/test.jpg",
    } as any);

    await uploadImage("data:image/png;base64,base64_data");
    expect(mockUpload).toHaveBeenCalledWith("data:image/png;base64,base64_data", {
      folder: "vourdev-carousels",
      resource_type: "image",
    });
  });
});
