import { Suspense } from "react";
import { io } from "next/cache";
import { FirstRun } from "@/components/office/FirstRun";
import { Office } from "@/components/office/Office";
import { getStore, officeSetup } from "@/server/office";

export default function Home() {
  return (
    <Suspense fallback={<Loading />}>
      <OfficeWithRooms />
    </Suspense>
  );
}

async function OfficeWithRooms() {
  // Rooms and setup live in JSON files that change at runtime, so read them per request.
  await io();
  const store = await getStore();
  // First run; rooms added under an earlier setup (if any) can't also be the main room.
  if ((await officeSetup()).status === "choose") return <FirstRun takenPaths={(await store.addedRooms()).map((r) => r.path)} />;
  return <Office initialRooms={await store.rooms()} />;
}

function Loading() {
  return (
    <div className="stage flex min-h-dvh items-center justify-center">
      <span className="animate-pulse font-pixel text-muted">Opening the office…</span>
    </div>
  );
}
