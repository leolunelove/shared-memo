import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { HttpError, assertOrigin } from "./security";
export const cookieName = "memo_viewer";
export const boardFields = "id,title,updated_at";
export const taskFields =
  "id,board_id,title,note,status,assigned_to,sort_order,created_at,updated_at,completed_at";
export function config() {
  const url = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_PUBLISHABLE_KEY,
    origin = process.env.APP_ORIGIN,
    owner = process.env.OWNER_EMAIL;
  if (!url || !key || !origin || !owner)
    throw new HttpError(
      503,
      "This memo is not connected yet. The owner needs to finish setup.",
    );
  const address = new URL(origin);
  if (
    address.protocol !== "https:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(address.hostname)
  )
    throw new HttpError(503, "A secure connection is required.");
  return { url, key, origin, owner };
}
export async function supabase() {
  const { url, key, origin } = config();
  const jar = await cookies();
  return createServerClient(url, key, {
    cookieOptions: {
      httpOnly: true,
      secure: new URL(origin).protocol === "https:",
      sameSite: "lax",
      path: "/",
    },
    cookies: {
      getAll() {
        return jar.getAll();
      },
      setAll(values) {
        values.forEach(({ name, value, options }) =>
          jar.set(name, value, {
            ...options,
            httpOnly: true,
            secure: new URL(origin).protocol === "https:",
            sameSite: "lax",
            path: "/",
          }),
        );
      },
    },
  });
}
export function anonymous() {
  const { url, key } = config();
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
export async function owner() {
  const db = await supabase();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (
    error ||
    !user ||
    user.email?.toLowerCase() !== config().owner.toLowerCase()
  )
    throw new HttpError(401, "Please sign in as the owner.");
  const { data: board, error: boardError } = await db
    .from("boards")
    .select(boardFields)
    .single();
  if (boardError || !board)
    throw new HttpError(403, "This account cannot access the memo.");
  return { db, board };
}
export async function ownerBoard(context?: Awaited<ReturnType<typeof owner>>) {
  const { db, board } = context || (await owner());
  const { data: tasks, error } = await db
    .from("tasks")
    .select(taskFields)
    .eq("board_id", board.id)
    .order("sort_order");
  if (error) throw new HttpError(500, "Couldn’t load the memo.");
  return { ...board, tasks };
}
export async function viewerBoard(token?: string) {
  const secret = token ?? (await cookies()).get(cookieName)?.value;
  if (!secret || !/^[A-Za-z0-9_-]{43}$/.test(secret))
    throw new HttpError(401, "This private link is missing or has expired.");
  const { data, error } = await anonymous().rpc("read_shared_board", {
    viewer_token: secret,
  });
  if (error)
    throw new HttpError(503, "Couldn’t open the memo. Please try again.");
  if (!data)
    throw new HttpError(401, "This private link is missing or has expired.");
  return data;
}
export async function jsonBody(request: Request) {
  assertOrigin(request, config().origin);
  const raw = await request.text();
  if (raw.length > 20000) throw new HttpError(413, "Request too large.");
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, "Invalid request.");
  }
}
export function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      Vary: "Cookie",
    },
  });
}
export function failure(e: unknown) {
  return json(
    {
      error:
        e instanceof HttpError
          ? e.message
          : "Something went wrong. Please try again.",
    },
    e instanceof HttpError ? e.status : 500,
  );
}
