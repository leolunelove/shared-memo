import { failure, json, jsonBody, owner, ownerBoard } from "@/lib/server";
import { HttpError, taskPatch, uuid } from "@/lib/security";
export async function POST(request: Request) {
  try {
    const body = await jsonBody(request);
    const context = await owner();
    const { db, board } = context;
    let error;
    if (body.action === "add") {
      const value = body.task;
      const patch = taskPatch({
        title: value?.title,
        note: value?.note || "",
        status: value?.status || "pending",
        assigned_to: value?.assigned_to ?? null,
      });
      const { data: last } = await db
        .from("tasks")
        .select("sort_order")
        .eq("board_id", board.id)
        .order("sort_order", { ascending: false })
        .limit(1);
      ({ error } = await db
        .from("tasks")
        .insert({
          ...patch,
          id: uuid(value?.id),
          board_id: board.id,
          sort_order: (last?.[0]?.sort_order || 0) + 1024,
        }));
    } else if (body.action === "rename") {
      if (
        typeof body.title !== "string" ||
        !body.title.trim() ||
        body.title.trim().length > 100
      )
        throw new HttpError(400, "Use a title between 1 and 100 characters.");
      ({ error } = await db
        .from("boards")
        .update({ title: body.title.trim() })
        .eq("id", board.id));
    } else if (body.action === "update") {
      const patch = taskPatch(body.patch);
      ({ error } = await db
        .from("tasks")
        .update(patch)
        .eq("id", uuid(body.id))
        .eq("board_id", board.id)
        .select("id")
        .single());
    } else if (body.action === "delete") {
      ({ error } = await db
        .from("tasks")
        .delete()
        .eq("id", uuid(body.id))
        .eq("board_id", board.id)
        .select("id")
        .single());
    } else if (body.action === "reorder") {
      if (
        !Array.isArray(body.items) ||
        !body.items.length ||
        body.items.length > 200
      )
        throw new HttpError(400, "Invalid order.");
      const items = body.items.map((item: Record<string, unknown>) => {
        const id = uuid(item.id);
        if (
          !["pending", "waiting", "done"].includes(String(item.status)) ||
          !Number.isSafeInteger(item.sort_order) ||
          Number(item.sort_order) < 0
        )
          throw new HttpError(400, "Invalid order.");
        return { id, status: item.status, sort_order: item.sort_order };
      });
      if (new Set(items.map((t: { id: string }) => t.id)).size !== items.length)
        throw new HttpError(400, "Duplicate item.");
      ({ error } = await db.rpc("reorder_tasks", {
        target_board: board.id,
        items,
      }));
    } else throw new HttpError(400, "Unknown action.");
    if (error)
      throw new HttpError(
        400,
        "Couldn’t save this change. Refresh and try again.",
      );
    return json(await ownerBoard(await owner()));
  } catch (e) {
    return failure(e);
  }
}
