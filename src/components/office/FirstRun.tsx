"use client";

import { useState } from "react";
import { chooseMainRoom } from "@/app/office-actions";
import { RepoPicker } from "./RepoPicker";

/** A fresh clone: pick the folder for the main room before the office opens. */
export function FirstRun({ takenPaths }: { takenPaths: string[] }) {
  const [used] = useState(() => new Set(takenPaths));
  const choose = async (path: string): Promise<string | null> => {
    const res = await chooseMainRoom(path).catch(() => null);
    if (!res) return "Couldn't reach the server.";
    return res.ok ? null : res.error;
  };
  return (
    <div className="stage min-h-dvh">
      <RepoPicker
        title="Welcome to Mini Office"
        hint="Each room is a folder, and the agents you spawn in a room work in it. Pick the folder for your main room, in the middle of the office; you can add rooms around it later."
        pickLabel="Choose"
        pendingText="Setting up your office…"
        usedPaths={used}
        onPick={choose}
      />
    </div>
  );
}
