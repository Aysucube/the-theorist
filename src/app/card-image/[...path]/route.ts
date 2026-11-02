import type { NextRequest } from "next/server";
import { reportSourceError } from "@/lib/sources/http";
import { getCardImage } from "@/lib/sources/card-images";

// GET /card-image/normal/front/b/7/b769ba9e-….jpg?1630616412
// A card image, from Scryfall the first time and from disk after that (see
// lib/sources/card-images.ts). An image at an address never changes, so browsers can
// keep it for good.
export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const imagePath = path.join("/");
  try {
    const image = await getCardImage(imagePath, request.nextUrl.search);
    if (!image) return new Response("Not a card image.", { status: 404 });
    return new Response(image as BodyInit, {
      headers: { "Content-Type": imagePath.endsWith(".png") ? "image/png" : "image/jpeg", "Cache-Control": "public, max-age=31536000, immutable" },
    });
  } catch (error) {
    return new Response(reportSourceError("card-image", error), { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
