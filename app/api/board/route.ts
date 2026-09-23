import { failure, json, ownerBoard, viewerBoard } from "@/lib/server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return json(
      new URL(request.url).searchParams.has("viewer")
        ? await viewerBoard()
        : await ownerBoard(),
    );
  } catch (e) {
    return failure(e);
  }
}
