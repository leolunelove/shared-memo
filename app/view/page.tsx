"use client";
import { useEffect, useRef, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { BoardLoader } from "@/components/board-loader";
export default function Viewer() {
  const started = useRef(false);
  const [ready, setReady] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get("token");
    window.history.replaceState(null, "", "/view");
    if (!token) {
      fetch("/api/board?viewer=1", { cache: "no-store" })
        .then((r) => {
          if (!r.ok) throw new Error("Open the private link shared with you.");
          setReady(true);
        })
        .catch((e) => setError(e.message));
      return;
    }
    fetch("/api/viewer/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        setReady(true);
      })
      .catch((e) => setError(e.message));
  }, []);
  return ready ? (
    <BoardLoader mode="viewer" />
  ) : (
    <main className="access-page">
      <LockKeyhole size={27} />
      <h1>{error ? "This memo is private" : "Opening your memo…"}</h1>
      <p>{error || "Just a moment."}</p>
      {error && (
        <small>
          If your link no longer works, ask the owner for a new one.
        </small>
      )}
    </main>
  );
}
