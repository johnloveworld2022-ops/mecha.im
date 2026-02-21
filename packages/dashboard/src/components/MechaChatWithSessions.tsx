"use client";

import { useState } from "react";
import { SessionPicker } from "./SessionPicker";
import { MechaChat } from "./MechaChat";

export function MechaChatWithSessions({ mechaId }: { mechaId: string }) {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  return (
    <div>
      <SessionPicker
        mechaId={mechaId}
        selectedSessionId={selectedSessionId}
        onSelectSession={setSelectedSessionId}
      />
      <MechaChat mechaId={mechaId} sessionId={selectedSessionId} />
    </div>
  );
}
