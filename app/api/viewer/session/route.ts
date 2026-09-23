import { cookies } from "next/headers";
import {
  failure,
  json,
  jsonBody,
  viewerBoard,
  cookieName,
  config,
} from "@/lib/server";
import { HttpError, TOKEN_PATTERN } from "@/lib/security";
export async function POST(request: Request) {
  try {
    const { token } = await jsonBody(request);
    if (typeof token !== "string" || !TOKEN_PATTERN.test(token))
      throw new HttpError(401, "This private link is missing or has expired.");
    await viewerBoard(token);
    (await cookies()).set(cookieName, token, {
      httpOnly: true,
      secure: new URL(config().origin).protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
