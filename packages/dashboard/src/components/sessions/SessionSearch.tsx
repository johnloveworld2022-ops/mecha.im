"use client";

import { SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";

interface SessionSearchProps {
  value: string;
  onChange: (value: string) => void;
}

export function SessionSearch({ value, onChange }: SessionSearchProps) {
  return (
    <div className="relative px-2 pb-2">
      <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search sessions..."
        className="h-7 pl-7 text-xs bg-sidebar"
      />
    </div>
  );
}
