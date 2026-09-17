import { NextRequest, NextResponse } from "next/server";
import { getVibesClient, hasVibesCookie } from "@/lib/vibes/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

interface Params {
  params: Promise<{ pid: string }>;
}

/**
 * POST /api/vibes/projects/[pid]/upload
 *
 * Register already-uploaded files (from /api/vibes/upload/image) as content
 * items in a project. This is REQUIRED before an uploaded image can be edited
 * — the /api/generate/image-edit endpoint needs an `imageEntId`, which is
 * only created when the image is registered as a content item in a project.
 *
 * Body: { files: [{ mediaEntId, imageUrl, filename, dimensions?, aspectRatio? }] }
 *
 * Returns: { data: { contentItems: [...] }, failedCount: int }
 * Each content item has an `id` and its `data` field (JSON string) contains
 * the `imageEntId` needed for editing.
 */
export async function POST(request: NextRequest, { params }: Params) {
  if (!hasVibesCookie()) return notConfigured();
  try {
    const client = getVibesClient();
    const { pid } = await params;
    const body = await request.json();

    if (!body?.files || !Array.isArray(body.files) || body.files.length === 0) {
      return NextResponse.json(
        { error: "Body must include a `files` array." },
        { status: 400 },
      );
    }

    const result = await client.bulkUploadToProject(pid, body.files);
    return NextResponse.json(result);
  } catch (error: any) {
    return handleError(error);
  }
}
