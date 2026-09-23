import { NextResponse } from "next/server";
import { supabase, config } from "@/lib/server";
// The Supabase magic-link email template points here with token_hash + type=email.
export async function GET(request: Request) {
  const { origin } = config();
  const url = new URL(request.url);
  const token_hash = url.searchParams.get("token_hash");
  if (token_hash && url.searchParams.get("type") === "email") {
    const db = await supabase();
    const { data, error } = await db.auth.verifyOtp({
      token_hash,
      type: "email",
    });
    if (
      !error &&
      data.user?.email?.toLowerCase() === config().owner.toLowerCase()
    )
      return NextResponse.redirect(new URL("/", origin));
    await db.auth.signOut();
  }
  return NextResponse.redirect(new URL("/login?error=expired", origin));
}
