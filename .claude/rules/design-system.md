---
globs:
  - "packages/dashboard/**/*.tsx"
  - "packages/dashboard/**/*.ts"
  - "packages/dashboard/**/*.css"
  - "packages/ui/**/*.tsx"
---

# Design System Rules

When generating code from Figma designs or creating UI components, follow these rules exactly.

## Stack

- **Framework:** Next.js 15 App Router + React 19
- **Styling:** Tailwind CSS v4 (CSS-only config, NO tailwind.config.ts)
- **Components:** shadcn/ui (Radix primitives + CVA variants)
- **Icons:** lucide-react v0.575.0
- **Chat UI:** @assistant-ui/react v0.12
- **Dark mode:** next-themes with `.dark` class (`@custom-variant dark (&:is(.dark *))`)
- **Utility:** `cn()` from `@/lib/utils` (clsx + tailwind-merge)

## Color Tokens (OKLCH)

NEVER use raw hex/rgb colors. Always use CSS custom property references via Tailwind:

```
bg-background, text-foreground          — page bg/text
bg-card, text-card-foreground           — card surfaces
bg-primary, text-primary-foreground     — blue brand actions
bg-secondary, text-secondary-foreground — gray secondary
bg-muted, text-muted-foreground         — subdued backgrounds/text
bg-accent, text-accent-foreground       — interactive hover states
bg-destructive                          — red/danger actions
border-border, border-input             — borders
ring-ring                               — focus rings
bg-success, text-success                — green status (oklch 0.65 0.18 145)
bg-warning, text-warning                — yellow status (oklch 0.75 0.17 75)
bg-sidebar, text-sidebar-foreground     — sidebar-specific tokens
bg-sidebar-accent, bg-sidebar-primary   — sidebar states
```

For opacity variants: `bg-destructive/10`, `text-primary/80`, `bg-muted/50`

## Typography

System font stack (no imports needed):
```css
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
```

Size scale: `text-xs` (12), `text-sm` (14, default body), `text-base` (16), `text-lg` (18), `text-xl` (20), `text-2xl` (24)

Weight: `font-medium` (500) for labels, `font-semibold` (600) for headings

## Spacing

Base unit: 4px. Use Tailwind spacing: `gap-2` (8px), `px-3` (12px), `py-2` (8px), `px-4` (16px)

Most common patterns:
- Flex rows: `flex items-center gap-2`
- Form sections: `flex flex-col gap-2`
- Cards: `p-4` or `px-4 py-3`
- Page content: `p-5` or `px-6 py-4`

## Border Radius

```
rounded-sm   — calc(var(--radius) - 4px)  = 6px
rounded-md   — calc(var(--radius) - 2px)  = 8px  (most common)
rounded-lg   — var(--radius)              = 10px
rounded-xl   — calc(var(--radius) + 4px)  = 14px
rounded-full — circles/pills
rounded-2xl  — 16px (chat bubbles)
```

## Icons

Import from `lucide-react`. Default size: `size-4` (16px). Use `size-3` for compact, `size-5` for prominent.

```tsx
import { ChevronDownIcon, CopyIcon, CheckIcon } from "lucide-react";
<ChevronDownIcon className="size-4 text-muted-foreground" />
```

## Component Patterns

### Buttons
```tsx
import { Button } from "@/components/ui/button";
<Button variant="default" size="sm">Primary</Button>
<Button variant="outline" size="xs" className="border-success text-success">Start</Button>
<Button variant="destructive" size="sm">Remove</Button>
<Button variant="ghost" size="icon-sm"><CopyIcon /></Button>
```
Variants: default, destructive, outline, secondary, ghost, link
Sizes: default (h-9), xs (h-6), sm (h-8), lg (h-10), icon, icon-xs, icon-sm, icon-lg

### Status Indicators
```tsx
// Status dot pattern
<span className={`size-2 rounded-full ${state === "running" ? "bg-success" : state === "exited" ? "bg-destructive" : "bg-warning"}`} />

// Badge pattern
<span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-success/15 text-success">
  running
</span>
```

### Cards
```tsx
<div className="rounded-lg border border-border bg-card p-4">
  <div className="text-xs font-medium text-muted-foreground mb-2">LABEL</div>
  <div className="text-sm font-semibold text-card-foreground">Value</div>
</div>
```

### Monospace
Use `font-mono` for: container IDs, ports, paths, API keys, session IDs, log output, code snippets.

## Figma-to-Code Mapping

When reading Figma designs via MCP:

| Figma Property | Tailwind Class |
|---|---|
| Fill: near-white (#fafafa) | `bg-background` |
| Fill: dark (#161616) | `bg-background` (dark mode) |
| Fill: card gray (#f5f5f5 / #2a2a2a) | `bg-card` |
| Fill: blue (#4f46e5) | `bg-primary` |
| Fill: red (#ef4444) | `bg-destructive` |
| Fill: green (#4ade80) | `text-success` / `bg-success` |
| Border: gray | `border-border` |
| Text: primary | `text-foreground` |
| Text: secondary gray | `text-muted-foreground` |
| Font: system | (default, no class needed) |
| Font: monospace | `font-mono` |
| Shadow: sm/md/lg | `shadow-sm` / `shadow-md` / `shadow-lg` |

## File Organization

```
src/components/ui/          — shadcn primitives (auto-generated, rarely edit)
src/components/assistant-ui/ — chat thread, composer, attachments, tool fallback
src/components/sidebar/      — sidebar navigation components (NEW)
src/components/layout/       — topbar, tab nav (NEW)
src/components/             — feature components (MechaChat, LogViewer, etc.)
src/app/(dashboard)/        — authenticated dashboard routes
src/app/api/                — API routes (DO NOT modify for UI changes)
src/lib/                    — utilities, store, auth, docker client
```

## Anti-Patterns

- NEVER use inline `style={}` — always Tailwind classes
- NEVER use raw color values — always semantic tokens
- NEVER import CSS modules — Tailwind utilities only
- NEVER add `tailwind.config.ts` — config is in globals.css via `@theme inline`
- NEVER use `styled-components` or CSS-in-JS
- NEVER hardcode light/dark colors — use token pairs that auto-switch
