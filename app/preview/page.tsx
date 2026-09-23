import { notFound } from "next/navigation";
import { MemoBoard } from "@/components/memo-board";
import { sampleBoard } from "@/lib/sample";
export const dynamic = "force-dynamic";
export default async function Preview({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  if (process.env.ENABLE_PREVIEW !== "true") notFound();
  const p = await searchParams;
  return (
    <MemoBoard
      initial={sampleBoard}
      mode={p.view === "reader" ? "viewer" : "preview"}
      demo
    />
  );
}
