type UploadUrlResponse = { uploadURL: string; objectPath: string };

type RequestUploadUrl = {
  mutateAsync: (input: {
    data: { name: string; size: number; contentType: string };
  }) => Promise<UploadUrlResponse>;
};

const DEFAULT_CONTENT_TYPE = "application/pdf";

/**
 * Keeps every browser upload on the same two-step storage contract. Server
 * details remain in browser diagnostics, while callers can show one safe,
 * human-friendly error message.
 */
export async function uploadFile(
  requestUploadUrl: RequestUploadUrl,
  file: File,
): Promise<{ objectPath: string; contentType: string }> {
  const contentType = file.type || DEFAULT_CONTENT_TYPE;
  try {
    const { uploadURL, objectPath } = await requestUploadUrl.mutateAsync({
      data: { name: file.name, size: file.size, contentType },
    });
    const response = await fetch(uploadURL, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: file,
    });
    if (!response.ok) {
      console.error("Storage upload failed", { status: response.status });
      throw new Error("upload-failed");
    }
    return { objectPath, contentType };
  } catch (error) {
    console.error("Unable to upload file", error);
    throw new Error("We couldn't upload that file. Please confirm it is an allowed document under 50 MB and try again.");
  }
}