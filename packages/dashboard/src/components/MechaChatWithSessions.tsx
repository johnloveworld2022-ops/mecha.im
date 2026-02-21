"use client";

import { useCallback, useRef, useState } from "react";
import { SessionPicker, type SessionPickerHandle } from "./SessionPicker";
import { MechaChat } from "./MechaChat";

export function MechaChatWithSessions({ mechaId }: { mechaId: string }) {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const pickerRef = useRef<SessionPickerHandle>(null);

  const handleStreamComplete = useCallback(() => {
    pickerRef.current?.refreshSessions();
  }, []);

  return (
    <div>
      <SessionPicker
        ref={pickerRef}
        mechaId={mechaId}
        selectedSessionId={selectedSessionId}
        onSelectSession={setSelectedSessionId}
      />
      {/* key forces full re-mount when session changes, resetting runtime state */}
      <MechaChat
        key={selectedSessionId ?? "stateless"}
        mechaId={mechaId}
        sessionId={selectedSessionId}
        onStreamComplete={handleStreamComplete}
      />
    </div>
  );
}
