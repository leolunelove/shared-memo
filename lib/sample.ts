import type { Board, Task } from "./types";
const date = "2026-09-23T07:22:00.000Z";
export const sampleBoard: Board = {
  id: "sample",
  title: "LEO × JAMES",
  updated_at: date,
  tasks: [
    [
      "Lunch Club motion graphic",
      "Final animation and export",
      "pending",
      "Leo",
    ],
    ["Approve A-frame copy", "", "pending", "James"],
    [
      "Upload corporate photos",
      "Selects from the September shoot",
      "pending",
      "Leo",
    ],
    ["Printer confirmation", "Waiting on the final proof", "waiting", "James"],
    ["Smoothie recipes", "", "waiting", "James"],
    ["Matcha menu", "", "done", null],
    ["Lunch Club launch post", "", "done", null],
    ["Staff badges", "", "done", null],
  ].map(([title, note, status, assigned_to], i) => ({
    id: `sample-${i}`,
    board_id: "sample",
    title,
    note,
    status,
    assigned_to,
    sort_order: i * 1024,
    created_at: date,
    updated_at: date,
    completed_at: status === "done" ? date : null,
  })) as Task[],
};
