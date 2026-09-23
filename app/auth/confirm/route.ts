import { NextResponse } from "next/server";
import { supabase, config } from "@/lib/server";
// Default Supabase emails use PKCE; custom templates may send a token hash.
export async function GET(request: Request) {
  const { origin } = config();
  const url = new URL(request.url);
  const token_hash = url.searchParams.get("token_hash");
  const code = url.searchParams.get("code");
  if (code || (token_hash && url.searchParams.get("type") === "email")) {
    const db = await supabase();
    const { data, error } = code
      ? await db.auth.exchangeCodeForSession(code)
      : await db.auth.verifyOtp({ token_hash: token_hash!, type: "email" });
    if (
      !error &&
      data.user?.email?.toLowerCase() === config().owner.toLowerCase()
    )
      return NextResponse.redirect(new URL("/", origin));
    await db.auth.signOut();
  }
  return NextResponse.redirect(new URL("/login?error=expired", origin));
}
