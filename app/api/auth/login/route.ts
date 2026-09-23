import { failure, json, jsonBody, supabase, config } from "@/lib/server";
export async function POST(request: Request) {
  try {
    const { email } = await jsonBody(request);
    const { owner, origin } = config();
    if (
      typeof email === "string" &&
      email.trim().toLowerCase() === owner.toLowerCase()
    ) {
      const db = await supabase();
      await db.auth.signInWithOtp({
        email: owner,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${origin}/auth/confirm`,
        },
      });
    }
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
