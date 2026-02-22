"use client";

import { MessageSquareIcon, InfoIcon, TerminalIcon, SearchCodeIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActiveTab } from "@/lib/store";

interface SessionTabsProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
}

const tabs: Array<{ id: ActiveTab; label: string; icon: typeof MessageSquareIcon }> = [
  { id: "chat", label: "Chat", icon: MessageSquareIcon },
  { id: "overview", label: "Info", icon: InfoIcon },
  { id: "terminal", label: "Term", icon: TerminalIcon },
  { id: "inspect", label: "Env", icon: SearchCodeIcon },
];

export function SessionTabs({ activeTab, onTabChange }: SessionTabsProps) {
  return (
    <div className="flex items-center border-t border-sidebar-border">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors",
              activeTab === tab.id
                ? "text-sidebar-primary"
                : "text-muted-foreground hover:text-sidebar-foreground",
            )}
          >
            <Icon className="size-4" />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
