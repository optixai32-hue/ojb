import { NextRequest, NextResponse } from "next/server";
import { getVibesClient, hasVibesCookie } from "@/lib/vibes/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const maxDuration = 300;

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
 * POST /api/vibes/videos/animate
 *
 * Animate a still image into a video (image-to-video / i2v).
 *
 * This is the "Auto animate" / "Manual animate" feature from the Vibes UI.
 * Unlike generateVideo(start_frame=...) which uses directPromptImageHandle,
 * animateImage uses sourceContentItemIds to reference the image, making it
 * the correct method for animating an existing image from your library.
 *
 * Body:
 *   - project_id (required)
 *   - batch_id (required) — the batch containing the source image
 *   - content_id (optional) — specific content item ID; defaults to first
 *   - prompt (optional) — manual animate directive; omit for auto animate
 *   - poll (optional, default false) — wait for completion
 *   - poll_timeout (optional, default 180s)
 *
 * Flow:
 *   1. Fetch the batch to get the full source image content item
 *   2. Call client.animateImage() with the source image
 *   3. Return the generation response (batchId for polling)
 */
export async function POST(request: NextRequest) {
  if (!hasVibesCookie()) return notConfigured();
  try {
    const client = getVibesClient();
    const body = await request.json();

    if (!body?.project_id || !body?.batch_id) {
      return NextResponse.json(
        { error: "Fields `project_id` and `batch_id` are required." },
        { status: 400 },
      );
    }

    // Fetch the batch to get the full source image content item
    const batch = await client.getBatch(body.batch_id);
    const content = batch.content ?? [];

    if (content.length === 0) {
      return NextResponse.json(
        { error: "No content items found in the specified batch." },
        { status: 404 },
      );
    }

    // Find the specific content item by ID, or use the first one
    let sourceImage: any;
    if (body.content_id) {
      sourceImage = content.find((c: any) => c.id === body.content_id);
      if (!sourceImage) {
        return NextResponse.json(
          { error: `Content item ${body.content_id} not found in batch ${body.batch_id}.` },
          { status: 404 },
        );
      }
    } else {
      sourceImage = content[0];
    }

    // Check the image has an imageUrl
    if (!sourceImage.imageUrl) {
      return NextResponse.json(
        { error: "The source image does not have an imageUrl. Cannot animate." },
        { status: 400 },
      );
    }

    // Call animateImage with the full source image content item
    const result = await client.animateImage({
      projectId: body.project_id,
      sourceImage,
      prompt: body.prompt,
      poll: body.poll ?? false,
      pollTimeout: body.poll_timeout ?? 180,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return handleError(error);
  }
}
