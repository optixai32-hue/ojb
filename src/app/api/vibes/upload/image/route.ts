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

/**
 * POST /api/vibes/upload/image
 *
 * Body: { image_base64 }
 * Uploads a base64-encoded image to vibes.ai.
 */
export async function POST(request: NextRequest) {
  if (!hasVibesCookie()) return notConfigured();
  try {
    const client = getVibesClient();
    const body = await request.json();

    if (!body?.image_base64) {
      return NextResponse.json(
        { error: "Field `image_base64` is required." },
        { status: 400 },
      );
    }

    const result = await client.uploadImage(body.image_base64);
    return NextResponse.json(result);
  } catch (error: any) {
    return handleError(error);
  }
}
