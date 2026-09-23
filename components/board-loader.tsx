"use client";
import { useEffect, useState } from "react";
import { LockKeyhole } from "lucide-react";
import type { Board } from "@/lib/types";
import { MemoBoard } from "./memo-board";
export function BoardLoader({ mode }: { mode: "owner" | "viewer" }) {
  const [board, setBoard] = useState<Board | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    fetch(`/api/board${mode === "viewer" ? "?viewer=1" : ""}`, {
      cache: "no-store",
    })
      .then(async (r) => {
        if (r.status === 401) {
          window.location.replace(
            mode === "owner" ? "/login" : "/view?expired=1",
          );
          return;
        }
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Couldn’t open this memo.");
        if (active) setBoard(data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [mode]);
  return board ? (
    <MemoBoard initial={board} mode={mode} />
  ) : (
    <main className="access-page">
      <LockKeyhole size={25} />
      <h1>{error ? "A moment, please" : "Opening your memo…"}</h1>
      <p>{error || "Just getting everything in place."}</p>
      {error && (
        <button
          className="solid-button"
          onClick={() => window.location.reload()}
        >
          Try again
        </button>
      )}
    </main>
  );
}
