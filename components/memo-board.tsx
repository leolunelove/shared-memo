"use client";
import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Check,
  ChevronDown,
  GripVertical,
  LockKeyhole,
  MoreHorizontal,
  Plus,
  Share2,
  X,
  Link2,
  ArrowUp,
  ArrowDown,
  Trash2,
  LogOut,
} from "lucide-react";
import type { Board, Task, Status, Mode } from "@/lib/types";
import { isArchived } from "@/lib/archive";
const statuses: Status[] = ["pending", "waiting", "done"];
const labels = { pending: "Pending", waiting: "Waiting", done: "Done" };
async function api(url: string, method: string, body?: unknown) {
  const r = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const result = await r.json();
  if (!r.ok)
    throw new Error(result.error || "Couldn’t save. Please try again.");
  return result;
}
export function MemoBoard({
  initial,
  mode,
  demo = false,
}: {
  initial: Board;
  mode: Mode;
  demo?: boolean;
}) {
  const [board, setBoard] = useState(initial),
    [editing, setEditing] = useState<string | null>(null),
    [adding, setAdding] = useState(false),
    [collapsed, setCollapsed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [share, setShare] = useState(false),
    [link, setLink] = useState(""),
    [shareBusy, setShareBusy] = useState(false),
    [fresh, setFresh] = useState(true);
  const [showArchive, setShowArchive] = useState(false),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);
  const writable = mode !== "viewer";
  const inFlight = useRef(false);
  const revision = useRef(0);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 7 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  useEffect(() => {
    if (demo) return;
    let stopped = false;
    const refresh = async () => {
      if (document.hidden || inFlight.current || editing || adding) return;
      try {
        const refreshVersion = revision.current;
        const r = await fetch(`/api/board${writable ? "" : "?viewer=1"}`, {
          cache: "no-store",
        });
        if (!r.ok) {
          if (r.status === 401) {
            window.location.assign(writable ? "/login" : "/view");
            return;
          }
          throw new Error();
        }
        const data = await r.json();
        if (
          !stopped &&
          !inFlight.current &&
          refreshVersion === revision.current
        ) {
          setBoard(data);
          setFresh(true);
        }
      } catch {
        if (!stopped) setFresh(false);
      }
    };
    const timer = setInterval(refresh, 8000);
    window.addEventListener("focus", refresh);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [demo, writable, editing, adding]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(timer);
  }, [notice]);
  async function change(
    action: string,
    payload: Record<string, unknown>,
    optimistic: Board,
  ) {
    if (inFlight.current) return;
    const before = board;
    inFlight.current = true;
    revision.current++;
    setBusy(true);
    setError("");
    setBoard({ ...optimistic, updated_at: new Date().toISOString() });
    try {
      if (!demo) {
        const data = await api("/api/tasks", "POST", { action, ...payload });
        setBoard(data);
      }
      setFresh(true);
    } catch (e) {
      setBoard(before);
      setError((e as Error).message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  function update(task: Task, patch: Partial<Task>) {
    if (patch.status && patch.status !== task.status) {
      const completed_at =
        patch.status === "done" ? new Date().toISOString() : null;
      const optimisticPatch = { ...patch, completed_at };
      setEditing(null);
      void change(
        "update",
        { id: task.id, patch },
        {
          ...board,
          tasks: board.tasks.map((t) =>
            t.id === task.id ? { ...t, ...optimisticPatch } : t,
          ),
        },
      );
      return;
    }
    setEditing(null);
    void change(
      "update",
      { id: task.id, patch },
      {
        ...board,
        tasks: board.tasks.map((t) =>
          t.id === task.id ? { ...t, ...patch } : t,
        ),
      },
    );
  }
  function remove(task: Task) {
    setEditing(null);
    void change(
      "delete",
      { id: task.id },
      { ...board, tasks: board.tasks.filter((t) => t.id !== task.id) },
    );
  }
  function reorder(id: string, targetId: string) {
    if (busy || id === targetId) return;
    const task = board.tasks.find((t) => t.id === id);
    if (!task) return;
    const target = board.tasks.find((t) => t.id === targetId);
    const status =
      target?.status ??
      (statuses.includes(targetId as Status)
        ? (targetId as Status)
        : task.status);
    const ordered = board.tasks
      .filter((t) => t.id !== id && t.status === status && !isArchived(t, now))
      .sort((a, b) => a.sort_order - b.sort_order);
    let at = target
      ? ordered.findIndex((t) => t.id === targetId)
      : ordered.length;
    if (target && task.status === status && task.sort_order < target.sort_order)
      at++;
    ordered.splice(Math.max(0, at), 0, { ...task, status });
    const changes = ordered.map((t, i) => ({
      id: t.id,
      status,
      sort_order: i * 1024,
    }));
    void change(
      "reorder",
      { items: changes },
      {
        ...board,
        tasks: board.tasks.map((t) => {
          const changed = changes.find((c) => c.id === t.id);
          return changed
            ? {
                ...t,
                ...changed,
                completed_at:
                  changed.status !== t.status
                    ? changed.status === "done"
                      ? new Date().toISOString()
                      : null
                    : t.completed_at,
              }
            : t;
        }),
      },
    );
  }
  function onDragEnd(e: DragEndEvent) {
    if (e.over) reorder(String(e.active.id), String(e.over.id));
  }
  function nudge(task: Task, offset: number) {
    const group = board.tasks
      .filter(
        (t) => t.status === task.status && isArchived(t, now) === showArchive,
      )
      .sort((a, b) => a.sort_order - b.sort_order);
    const index = group.findIndex((t) => t.id === task.id);
    const to = index + offset;
    if (to < 0 || to >= group.length) return;
    [group[index], group[to]] = [group[to], group[index]];
    const changes = group.map((t, i) => ({
      id: t.id,
      status: t.status,
      sort_order: i * 1024,
    }));
    void change(
      "reorder",
      { items: changes },
      {
        ...board,
        tasks: board.tasks.map((t) => ({
          ...t,
          ...changes.find((c) => c.id === t.id),
        })),
      },
    );
  }
  async function generateLink() {
    setShareBusy(true);
    setError("");
    try {
      const result = await api("/api/share", "POST", {});
      setLink(result.url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setShareBusy(false);
    }
  }
  const date = new Date(board.updated_at);
  const time = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const sameDay = date.toDateString() === new Date().toDateString();
  const archived = board.tasks.filter((t) => isArchived(t, now));
  const content = (
    <>
      {(showArchive ? (["done"] as Status[]) : statuses).map((status) => {
        const tasks = board.tasks
          .filter(
            (t) => t.status === status && isArchived(t, now) === showArchive,
          )
          .sort((a, b) => a.sort_order - b.sort_order);
        return (
          <Section
            key={status}
            archived={showArchive}
            status={status}
            count={tasks.length}
            writable={writable}
            collapsed={!showArchive && status === "done" && collapsed}
            toggle={() => setCollapsed(!collapsed)}
          >
            <SortableContext
              items={tasks.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              {tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  writable={writable}
                  busy={busy}
                  editing={editing === task.id}
                  onEdit={() => setEditing(task.id)}
                  onCancel={() => setEditing(null)}
                  onSave={(patch) => update(task, patch)}
                  onDelete={() => remove(task)}
                  onMove={(offset) => nudge(task, offset)}
                />
              ))}
            </SortableContext>
            {tasks.length === 0 && (
              <p className="section-empty">
                {status === "pending"
                  ? "Nothing pending. A little breathing room."
                  : status === "waiting"
                    ? "Nothing waiting."
                    : showArchive
                      ? "No archived items yet."
                      : "Completed items will appear here."}
              </p>
            )}
          </Section>
        );
      })}
    </>
  );
  return (
    <main className="memo-shell">
      <div className="topbar">
        <div className="memo-label">
          <span className="memo-mark">
            <Check size={12} />
          </span>{" "}
          Shared memo
        </div>
        {writable ? (
          <div className="top-actions">
            {!demo && (
              <>
                <button
                  className="icon-button"
                  aria-label="Share private viewer link"
                  onClick={() => setShare(!share)}
                >
                  <Share2 size={19} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Sign out"
                  onClick={async () => {
                    await api("/api/auth/logout", "POST");
                    window.location.assign("/login");
                  }}
                >
                  <LogOut size={18} />
                </button>
              </>
            )}
            {demo && (
              <a className="small-link" href="/preview?view=reader">
                Viewer preview
              </a>
            )}
          </div>
        ) : (
          <span className="quiet-label">
            <LockKeyhole size={13} /> View only
          </span>
        )}
      </div>
      <header className="board-header">
        <div className="eyebrow">JUST BETWEEN US</div>
        <h1>
          {writable ? (
            <input
              className="board-title-input"
              aria-label="Board title"
              defaultValue={board.title}
              key={board.title}
              maxLength={100}
              disabled={busy}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") {
                  e.currentTarget.value = board.title;
                  e.currentTarget.blur();
                }
              }}
              onBlur={(e) => {
                const title = e.target.value.trim();
                if (!title) {
                  e.target.value = board.title;
                  return;
                }
                if (title !== board.title)
                  void change("rename", { title }, { ...board, title });
              }}
            />
          ) : (
            board.title
          )}
        </h1>
        <div className="updated" aria-live="polite" suppressHydrationWarning>
          {busy ? (
            "Saving…"
          ) : !fresh ? (
            "Offline · reconnecting…"
          ) : (
            <>
              <span className="sync-dot" />
              Updated{" "}
              {sameDay
                ? ""
                : date.toLocaleDateString([], {
                    month: "short",
                    day: "numeric",
                  }) + " at "}
              {time}
            </>
          )}
        </div>
      </header>
      {share && writable && !demo && (
        <div className="share-panel">
          <div className="share-heading">
            <h2>A private link for James</h2>
            <button
              className="icon-button"
              aria-label="Close sharing"
              onClick={() => setShare(false)}
            >
              <X size={17} />
            </button>
          </div>
          <p>Anyone with this link can view the memo. Only you can edit.</p>
          {link ? (
            <>
              <input
                className="share-input"
                value={link}
                readOnly
                aria-label="Private viewer URL"
                onFocus={(e) => e.target.select()}
              />
              <button
                className="solid-button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(link);
                    setNotice("Private link copied");
                  } catch {
                    setNotice("Select and copy the link above");
                  }
                }}
              >
                <Link2 size={16} />
                Copy private link
              </button>
              <p className="caption">
                Keep this link somewhere safe. Creating another link revokes the
                previous link and its sessions.
              </p>
            </>
          ) : (
            <>
              <button
                className="solid-button"
                disabled={shareBusy}
                onClick={generateLink}
              >
                {shareBusy ? "Creating…" : "Create a new viewer link"}
              </button>
              <p className="caption">
                This will revoke any previous viewer link.
              </p>
            </>
          )}
        </div>
      )}
      {error && (
        <div className="error-banner" role="alert">
          {error}
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {writable ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          {content}
        </DndContext>
      ) : (
        content
      )}
      {writable && !showArchive && (
        <div className="add-area">
          {adding ? (
            <TaskEditor
              onCancel={() => setAdding(false)}
              onSave={(patch) => {
                const now = new Date().toISOString();
                const task = {
                  id: crypto.randomUUID(),
                  board_id: board.id,
                  title: patch.title!,
                  note: patch.note || "",
                  status: patch.status || "pending",
                  assigned_to: patch.assigned_to || null,
                  sort_order:
                    Math.max(0, ...board.tasks.map((t) => t.sort_order)) + 1024,
                  created_at: now,
                  updated_at: now,
                  completed_at: patch.status === "done" ? now : null,
                };
                setAdding(false);
                void change(
                  "add",
                  { task },
                  { ...board, tasks: [...board.tasks, task] },
                );
              }}
            />
          ) : (
            <button
              className="add-button"
              disabled={busy}
              onClick={() => {
                setEditing(null);
                setAdding(true);
              }}
            >
              <Plus size={20} />
              Add item
            </button>
          )}
        </div>
      )}
      {writable && (
        <button
          className="archive-button"
          onClick={() => {
            setShowArchive(!showArchive);
            setEditing(null);
            setAdding(false);
          }}
        >
          {showArchive
            ? "← Back to memo"
            : `Archived${archived.length ? " · " + archived.length : ""}`}
        </button>
      )}
      <footer className="memo-footer">
        <LockKeyhole size={12} />
        <span>
          {demo
            ? "Sample board · changes aren’t saved"
            : "Private. Just the two of you."}
        </span>
        {demo && mode === "viewer" && (
          <a href="/preview">Back to owner preview</a>
        )}
      </footer>
      {notice && (
        <div className="toast" role="status">
          <Check size={16} />
          {notice}
        </div>
      )}
    </main>
  );
}
function Section({
  status,
  count,
  children,
  writable,
  collapsed,
  toggle,
  archived = false,
}: {
  archived?: boolean;
  status: Status;
  count: number;
  children: React.ReactNode;
  writable: boolean;
  collapsed: boolean;
  toggle: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
    disabled: !writable,
  });
  return (
    <section
      ref={setNodeRef}
      className={`task-section section-${status} ${isOver ? "drop-over" : ""}`}
      aria-label={labels[status]}
    >
      <div className="section-heading">
        {status === "done" && !archived ? (
          <button
            className="collapse-button"
            onClick={toggle}
            aria-expanded={!collapsed}
          >
            <ChevronDown
              size={14}
              className={collapsed ? "chevron collapsed" : "chevron"}
            />
            <h2>{labels[status]}</h2>
          </button>
        ) : (
          <h2>{archived ? "Archived" : labels[status]}</h2>
        )}
        <span className="section-count">{count}</span>
      </div>
      {!collapsed && <div className="task-list">{children}</div>}
    </section>
  );
}
function TaskRow({
  task,
  writable,
  busy,
  editing,
  onEdit,
  onCancel,
  onSave,
  onDelete,
  onMove,
}: {
  task: Task;
  writable: boolean;
  busy: boolean;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (patch: Partial<Task>) => void;
  onDelete: () => void;
  onMove: (offset: number) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, disabled: !writable || busy || editing });
  const [menu, setMenu] = useState(false);
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`task-row ${task.status} ${isDragging ? "dragging" : ""} ${editing ? "editing" : ""}`}
    >
      {writable ? (
        <button
          className="status-button"
          aria-label={
            task.status === "done"
              ? `Reopen ${task.title}`
              : `Complete ${task.title}`
          }
          disabled={busy}
          onClick={() =>
            onSave({ status: task.status === "done" ? "pending" : "done" })
          }
        >
          <span className={`status-circle ${task.status}`}>
            {task.status === "done" && <Check size={13} strokeWidth={2.4} />}
          </span>
        </button>
      ) : (
        <span className="status-readonly" aria-label={labels[task.status]}>
          <span className={`status-circle ${task.status}`}>
            {task.status === "done" && <Check size={13} strokeWidth={2.4} />}
          </span>
        </span>
      )}
      {editing ? (
        <TaskEditor task={task} onSave={onSave} onCancel={onCancel} />
      ) : (
        <>
          {writable ? (
            <button className="task-copy" disabled={busy} onClick={onEdit}>
              <span
                className="task-title"
                title={new Date(task.updated_at).toLocaleString()}
              >
                {task.title}
              </span>
              {task.note && <span className="task-note">{task.note}</span>}
            </button>
          ) : (
            <div className="task-copy">
              <span
                className="task-title"
                title={new Date(task.updated_at).toLocaleString()}
              >
                {task.title}
              </span>
              {task.note && <span className="task-note">{task.note}</span>}
            </div>
          )}
          {task.assigned_to && task.status !== "done" && (
            <span className="assignee">{task.assigned_to}</span>
          )}
          {writable && (
            <div className="row-tools">
              <button
                className="drag-handle icon-button"
                aria-label={`Reorder ${task.title}`}
                {...attributes}
                {...listeners}
                disabled={busy}
              >
                <GripVertical size={16} />
              </button>
              <button
                className="icon-button more-button"
                aria-label={`Options for ${task.title}`}
                aria-expanded={menu}
                disabled={busy}
                onClick={() => setMenu(!menu)}
              >
                <MoreHorizontal size={18} />
              </button>
              {menu && (
                <div
                  className="row-menu"
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setMenu(false);
                  }}
                >
                  <select
                    aria-label={`Status for ${task.title}`}
                    value={task.status}
                    onChange={(e) => {
                      onSave({ status: e.target.value as Status });
                      setMenu(false);
                    }}
                  >
                    {statuses.map((s) => (
                      <option key={s} value={s}>
                        {labels[s]}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      onMove(-1);
                      setMenu(false);
                    }}
                  >
                    <ArrowUp size={15} />
                    Move up
                  </button>
                  <button
                    onClick={() => {
                      onMove(1);
                      setMenu(false);
                    }}
                  >
                    <ArrowDown size={15} />
                    Move down
                  </button>
                  <button
                    className="danger"
                    onClick={() => {
                      onDelete();
                      setMenu(false);
                    }}
                  >
                    <Trash2 size={15} />
                    Delete item
                  </button>
                  <button onClick={() => setMenu(false)}>Close</button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
function TaskEditor({
  task,
  onSave,
  onCancel,
}: {
  task?: Task;
  onSave: (patch: Partial<Task>) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(task?.title || ""),
    [note, setNote] = useState(task?.note || ""),
    [status, setStatus] = useState<Status>(task?.status || "pending"),
    [assigned, setAssigned] = useState(task?.assigned_to || "");
  return (
    <form
      className="task-editor"
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim())
          onSave({
            title: title.trim(),
            note: note.trim(),
            status,
            assigned_to: (assigned as Task["assigned_to"]) || null,
          });
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <input
        autoFocus
        aria-label="Item title"
        placeholder="What needs to happen?"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={240}
        required
      />
      <input
        aria-label="Short note"
        placeholder="Add a short note…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={400}
      />
      <div className="editor-bottom">
        <select
          aria-label="Item status"
          value={status}
          onChange={(e) => setStatus(e.target.value as Status)}
        >
          {statuses.map((s) => (
            <option key={s} value={s}>
              {labels[s]}
            </option>
          ))}
        </select>
        <select
          aria-label="Assigned to"
          value={assigned}
          onChange={(e) => setAssigned(e.target.value)}
        >
          <option value="">Unassigned</option>
          <option>Leo</option>
          <option>James</option>
        </select>
        <span className="editor-spacer" />
        <button type="button" className="text-button" onClick={onCancel}>
          Cancel
        </button>
        <button className="save-button" type="submit" disabled={!title.trim()}>
          Save
        </button>
      </div>
    </form>
  );
}
