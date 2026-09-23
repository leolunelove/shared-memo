import { failure, json, jsonBody, supabase } from "@/lib/server";
export async function POST(request: Request) {
  try {
    await jsonBody(request);
    await (await supabase()).auth.signOut();
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
