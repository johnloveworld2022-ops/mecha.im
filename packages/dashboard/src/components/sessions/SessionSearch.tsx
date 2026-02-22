"use client";

import { SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";

interface SessionSearchProps {
  value: string;
  onChange: (value: string) => void;
}

export function SessionSearch({ value, onChange }: SessionSearchProps) {
  return (
    <div className="px-2 pb-2">
      <div className="relative flex items-center">
        <SearchIcon className="absolute left-2 size-3.5 text-muted-foreground pointer-events-none" />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search sessions..."
          className="h-7 pl-7 text-xs bg-sidebar"
        />
      </div>
    </div>
  );
}
