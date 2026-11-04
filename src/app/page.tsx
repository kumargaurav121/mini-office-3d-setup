import { Suspense } from "react";
import { io } from "next/cache";
import { Office } from "@/components/office/Office";
import { getStore } from "@/server/office";

export default function Home() {
  return (
    <Suspense fallback={<Loading />}>
      <OfficeWithRooms />
    </Suspense>
  );
}

async function OfficeWithRooms() {
  // Rooms live in a JSON file that changes at runtime, so read it per request.
  await io();
  const rooms = await (await getStore()).rooms();
  return <Office initialRooms={rooms} />;
}

function Loading() {
  return (
    <div className="stage flex min-h-dvh items-center justify-center">
      <span className="animate-pulse font-pixel text-muted">Opening the office…</span>
    </div>
  );
}
