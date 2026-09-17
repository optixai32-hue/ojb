import { NextRequest, NextResponse } from "next/server";
import { getVibesClient, hasVibesCookie } from "@/lib/vibes/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const maxDuration = 120;

function notConfigured() {
  return NextResponse.json(
    { error: "VIBES_META_SESSION env var not set." },
    { status: 500 },
  );
}

function handleError(error: any) {
  const status = error?.status ?? 500;
  return NextResponse.json(
    {
      error: error?.message ?? "Unknown error",
      code: error?.code,
      response: error?.response,
    },
    { status },
  );
}

/**
 * POST /api/vibes/upload/media
 *
 * Upload an image file via multipart form data to vibes.ai's /api/upload-media
 * endpoint, then register it as a content item in a project.
 *
 * This is the CORRECT upload flow for images that will be EDITED — unlike
 * /api/upload-image (base64), /api/upload-media (multipart) returns an
 * `uploadToken`, which is required to register the image as a content item
 * in a project via /api/projects/{pid}/upload. Once registered, the
 * `mediaEntId` becomes a valid `sourceImageEntId` for the edit endpoint.
 *
 * Form data:
 *   - file: the image file (required)
 *   - filename: the original filename (required)
 *   - project_id: the project to register the image in (required for editing)
 *
 * Returns: { mediaEntId, imageUrl, uploadToken, contentItemId, projectId }
 */
export async function POST(request: NextRequest) {
  if (!hasVibesCookie()) return notConfigured();
  try {
    const client = getVibesClient();

    // Parse multipart form data from the browser
    const formData = await request.formData();
    const file = formData.get("file");
    const filename = (formData.get("filename") as string) || "upload.png";
    const projectId = formData.get("project_id") as string;

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "A `file` field (image file) is required." },
        { status: 400 },
      );
    }

    if (!projectId) {
      return NextResponse.json(
        { error: "A `project_id` field is required (needed to register the image for editing)." },
        { status: 400 },
      );
    }

    // Step 1: Upload to vibes.ai via multipart /api/upload-media
    // We need to forward the file as multipart to vibes.ai
    const vibesFormData = new FormData();
    vibesFormData.set("file", file, filename);
    vibesFormData.set("filename", filename);

    const uploadResp = await client.uploadMedia(vibesFormData);

    if (!uploadResp.mediaEntId) {
      throw new Error("Upload did not return a mediaEntId");
    }

    const {
      mediaEntId,
      cdnUrl,
      imageUrl,
      dimensions,
      aspectRatio,
      uploadToken,
    } = uploadResp;

    if (!uploadToken) {
      // Fallback: if no uploadToken (shouldn't happen with multipart), return what we have
      return NextResponse.json({
        mediaEntId,
        imageUrl: imageUrl || cdnUrl,
        dimensions,
        aspectRatio,
        warning: "No uploadToken returned — image cannot be edited directly.",
      });
    }

    // Step 2: Register the uploaded image in the project
    // This creates a content item, which makes the mediaEntId valid for editing.
    const registerResp = await client.bulkUploadToProject(projectId, [
      {
        mediaEntId,
        uploadToken,
        imageUrl: cdnUrl || imageUrl,
        cdnUrl,
        filename,
        dimensions,
        aspectRatio,
      },
    ]);

    // The register response shape is: { success, contentItems: [{id, ...}], count }
    // (contentItems is at the top level, not under `data`)
    const contentItems = registerResp?.contentItems ?? registerResp?.data?.contentItems ?? [];
    const contentItemId = contentItems[0]?.id;

    return NextResponse.json({
      mediaEntId,
      imageUrl: cdnUrl || imageUrl,
      uploadToken,
      dimensions,
      aspectRatio,
      contentItemId,
      projectId,
      // After registration, mediaEntId is a valid sourceImageEntId for the edit endpoint
      sourceImageEntId: mediaEntId,
      registered: true,
    });
  } catch (error: any) {
    return handleError(error);
  }
}
