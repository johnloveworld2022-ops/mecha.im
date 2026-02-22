---
globs:
  - "packages/dashboard/**/*.tsx"
  - "packages/dashboard/**/*.ts"
  - "packages/dashboard/**/*.css"
  - "packages/ui/**/*.tsx"
---

# No Hard-Coded Values

STOP before writing any literal CSS value. Every visual property must reference the design system — tokens, Tailwind scale, or CSS custom properties. Hard-coded values create drift, break dark mode, and resist future theming.

## Colors

**NEVER** use raw color literals anywhere: no `#hex`, `rgb()`, `rgba()`, `hsl()`, `hsla()`, `oklch()` in component code.

```tsx
// WRONG
className="text-[#666]"
className="bg-[rgba(0,0,0,0.5)]"
className="border-[#e5e7eb]"
style={{ color: "#4f46e5" }}

// RIGHT
className="text-muted-foreground"
className="bg-background/50"
className="border-border"
className="text-primary"
```

The ONLY place raw oklch values belong is `globals.css` inside `:root` and `.dark` blocks.

## Spacing & Sizing

**NEVER** use arbitrary pixel/rem values. Use the Tailwind spacing scale (multiples of 4px).

```tsx
// WRONG
className="p-[13px]"
className="gap-[7px]"
className="mt-[22px]"
className="w-[347px]"
className="h-[53px]"

// RIGHT
className="p-3"         // 12px
className="gap-2"       // 8px
className="mt-5"        // 20px (round to nearest scale step)
className="w-full"      // or w-80, w-96, max-w-sm, etc.
className="h-14"        // 56px (nearest scale step)
```

**Allowed exceptions** for arbitrary spacing:
- Container max-widths that match a design breakpoint: `max-w-[1200px]`
- Fixed aspect ratios via `aspect-[4/3]`
- Grid template definitions: `grid-cols-[auto_1fr_auto]`

## Font Size & Weight

**NEVER** use arbitrary font sizes or weights. Use the Tailwind type scale.

```tsx
// WRONG
className="text-[15px]"
className="text-[0.8rem]"
className="font-[450]"

// RIGHT
className="text-sm"      // 14px (round down from 15px)
className="text-xs"      // 12px
className="font-medium"  // 500
```

Scale: `text-xs` (12) → `text-sm` (14) → `text-base` (16) → `text-lg` (18) → `text-xl` (20) → `text-2xl` (24)
Weights: `font-normal` (400) → `font-medium` (500) → `font-semibold` (600) → `font-bold` (700)

## Border Radius

**NEVER** use arbitrary radius values. Use the radius tokens from the theme.

```tsx
// WRONG
className="rounded-[8px]"
className="rounded-[0.5rem]"

// RIGHT
className="rounded-md"   // 8px (calc(var(--radius) - 2px))
className="rounded-lg"   // 10px (var(--radius))
```

Scale: `rounded-sm` (6px) → `rounded-md` (8px) → `rounded-lg` (10px) → `rounded-xl` (14px) → `rounded-full`

## Shadows

**NEVER** use arbitrary shadow values. Use the Tailwind shadow scale.

```tsx
// WRONG
className="shadow-[0_2px_8px_rgba(0,0,0,0.1)]"

// RIGHT
className="shadow-sm"    // or shadow-md, shadow-lg
```

## Opacity

**NEVER** use arbitrary opacity values. Use the Tailwind opacity scale or token `/` syntax.

```tsx
// WRONG
className="opacity-[0.65]"
className="bg-[rgba(0,0,0,0.15)]"

// RIGHT
className="opacity-60"        // or 0, 5, 10, 15, 20, 25, 30, ..., 100
className="bg-background/15"
```

## Line Height & Letter Spacing

Use Tailwind's `leading-*` and `tracking-*` scales.

```tsx
// WRONG
className="leading-[1.35]"
className="tracking-[0.02em]"

// RIGHT
className="leading-snug"   // 1.375
className="tracking-wide"  // 0.025em
```

## Z-Index

Use the Tailwind z-index scale: `z-0`, `z-10`, `z-20`, `z-30`, `z-40`, `z-50`.

```tsx
// WRONG
className="z-[999]"
className="z-[15]"

// RIGHT
className="z-50"
className="z-10"
```

## Inline Styles

**NEVER** use the `style={}` prop for visual properties. If Tailwind doesn't cover it, define a CSS custom property in `globals.css`.

```tsx
// WRONG
style={{ padding: "12px 16px" }}
style={{ fontSize: 14, color: "#333" }}
style={{ borderRadius: 8 }}

// RIGHT — use Tailwind classes for everything
className="px-4 py-3 text-sm text-foreground rounded-md"
```

**Allowed exceptions** for `style={}`:
- Dynamic values computed at runtime: `style={{ transform: \`translateX(${offset}px)\` }}`
- CSS custom property overrides: `style={{ "--progress": \`${percent}%\` } as React.CSSProperties}`

## Summary: What Goes Where

| Property | Source | Example |
|---|---|---|
| Colors | Design tokens | `text-foreground`, `bg-primary/80` |
| Spacing | Tailwind scale | `p-4`, `gap-2`, `mt-6` |
| Font size | Tailwind scale | `text-sm`, `text-lg` |
| Font weight | Tailwind scale | `font-medium`, `font-semibold` |
| Radius | Theme tokens | `rounded-md`, `rounded-lg` |
| Shadow | Tailwind scale | `shadow-sm`, `shadow-md` |
| Z-index | Tailwind scale | `z-10`, `z-50` |
| Breakpoints | Tailwind screens | `sm:`, `md:`, `lg:` |
| Raw values | `globals.css` only | `:root { --my-token: ... }` |
