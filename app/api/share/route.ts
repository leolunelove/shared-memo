import { randomBytes, createHash } from "node:crypto";
import { failure, json, jsonBody, owner, config } from "@/lib/server";
import { HttpError } from "@/lib/security";
export async function POST(request: Request) {
  try {
    await jsonBody(request);
    const { db, board } = await owner();
    const token = randomBytes(32).toString("base64url");
    const hash = createHash("sha256").update(token).digest("hex");
    const { error } = await db
      .from("boards")
      .update({ viewer_token_hash: hash })
      .eq("id", board.id);
    if (error) throw new HttpError(500, "Couldn’t create a private link.");
    return json({ url: `${new URL("/view", config().origin)}#token=${token}` });
  } catch (e) {
    return failure(e);
  }
}
