"use client";

import { PlusIcon, SettingsIcon } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import Link from "next/link";

export function RailFooter() {
  return (
    <div className="flex flex-col items-center gap-2 pb-14">
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href="/create"
            className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all"
          >
            <PlusIcon className="size-5" />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">New Mecha</TooltipContent>
      </Tooltip>
      <ThemeToggle />
    </div>
  );
}
