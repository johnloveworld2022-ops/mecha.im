"use client";

import { useCallback, useState } from "react";
import {
  ClockIcon,
  CopyIcon,
  CoinsIcon,
  HashIcon,
  ArrowDownIcon,
  ArrowUpIcon,
} from "lucide-react";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";

export interface SessionUsage {
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalDurationMs: number;
  turnCount: number;
}

export interface SessionDetailData {
  sessionId: string;
  title: string;
  state: string;
  messageCount: number;
  createdAt: string;
  usage?: SessionUsage;
  config: Record<string, unknown>;
}

interface SessionInfoProps {
  detail: SessionDetailData;
  sessionId: string;
}

function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function formatDuration(ms: number): string {
  if (ms === 0) return "0s";
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return remaining > 0 ? `${minutes}m ${remaining}s` : `${minutes}m`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function SessionInfo({ detail, sessionId }: SessionInfoProps) {
  const [copied, setCopied] = useState(false);

  const copyId = useCallback(() => {
    navigator.clipboard.writeText(sessionId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [sessionId]);

  const usage = detail.usage;
  const config = detail.config ?? {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">
          {detail.title || "(untitled session)"}
        </h2>
        <div className="flex items-center gap-2">
          <code className="text-xs font-mono text-muted-foreground">{sessionId}</code>
          <TooltipIconButton
            tooltip={copied ? "Copied!" : "Copy session ID"}
            className="size-5 p-0.5"
            onClick={copyId}
          >
            <CopyIcon className="size-3" />
          </TooltipIconButton>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
              detail.state === "busy"
                ? "bg-warning/15 text-warning"
                : "bg-success/15 text-success"
            }`}
          >
            {detail.state}
          </span>
        </div>
      </div>

      {/* Usage grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <UsageCard
          icon={<CoinsIcon className="size-3.5" />}
          label="Cost"
          value={formatCost(usage?.totalCostUsd ?? 0)}
        />
        <UsageCard
          icon={<HashIcon className="size-3.5" />}
          label="Turns"
          value={String(usage?.turnCount ?? 0)}
        />
        <UsageCard
          icon={<ArrowDownIcon className="size-3.5" />}
          label="Input tokens"
          value={formatTokens(usage?.totalInputTokens ?? 0)}
        />
        <UsageCard
          icon={<ArrowUpIcon className="size-3.5" />}
          label="Output tokens"
          value={formatTokens(usage?.totalOutputTokens ?? 0)}
        />
        <UsageCard
          icon={<ClockIcon className="size-3.5" />}
          label="Duration"
          value={formatDuration(usage?.totalDurationMs ?? 0)}
        />
        <UsageCard
          icon={<HashIcon className="size-3.5" />}
          label="Messages"
          value={String(detail.messageCount)}
        />
      </div>

      {/* Config section (read-only) */}
      <div>
        <h3 className="text-sm font-medium mb-2">Configuration</h3>
        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          <ConfigRow label="Model" value={config.model as string | undefined} fallback="(default)" mono />
          <ConfigRow label="Permission mode" value={config.permissionMode as string | undefined} fallback="(default)" />
          <ConfigRow
            label="System prompt"
            value={config.systemPrompt as string | undefined}
            fallback="(none)"
            truncate
          />
          <ConfigRow
            label="Max turns"
            value={config.maxTurns != null ? String(config.maxTurns) : undefined}
            fallback="(unlimited)"
          />
          <ConfigRow
            label="Max budget"
            value={config.maxBudgetUsd != null ? `$${config.maxBudgetUsd}` : undefined}
            fallback="(unlimited)"
          />
        </div>
      </div>
    </div>
  );
}

function UsageCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        {icon}
        <span className="uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-sm font-semibold font-mono">{value}</div>
    </div>
  );
}

function ConfigRow({
  label,
  value,
  fallback,
  mono,
  truncate,
}: {
  label: string;
  value?: string;
  fallback: string;
  mono?: boolean;
  truncate?: boolean;
}) {
  const display = value ?? fallback;
  const isDefault = !value;
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-xs text-muted-foreground whitespace-nowrap">{label}</span>
      <span
        className={`text-sm text-right ${isDefault ? "text-muted-foreground" : "text-foreground"} ${mono ? "font-mono" : ""} ${truncate ? "truncate max-w-48" : ""}`}
        title={truncate ? display : undefined}
      >
        {display}
      </span>
    </div>
  );
}
