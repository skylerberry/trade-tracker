# Trade Tracker Design System

This document defines the visual language and design principles for the Trade Tracker application. **All design changes must follow these guidelines to maintain consistency.**

---

## Design Philosophy

**Flat, Clean, Timeless** - The design prioritizes clarity and simplicity. No gradients, no glassmorphism, no trendy effects. Just clean, functional design that won't look dated.

### Core Principles

1. **Flat design** - No gradients, no glassmorphism, no 3D effects
2. **Solid color backgrounds** - Cards use solid fills, not semi-transparent overlays
3. **Consistent color usage** - The same blue should be used everywhere blue appears
4. **Subtle depth** - Use borders and slight background color differences, not shadows
5. **Theme parity** - Light and dark mode should feel like the same app, just inverted

### What NOT to Do

- **NO gradients** - Ever. Not for backgrounds, not for buttons, not for cards
- **NO glassmorphism** - No frosted glass effects, no backdrop-blur
- **NO trendy effects** - If it looks like a 2024 design trend, don't use it
- **NO inconsistent colors** - If one button is navy, ALL buttons should be navy

---

## Color Palette

### Light Mode

#### Primary Brand Color
```css
--color-primary: #1a365d;        /* Navy blue - THE brand color */
--color-primary-hover: #2d4a7c;  /* Slightly lighter for hover */
```

**This navy blue is used for:**
- Header background
- All primary buttons (Position Size Calculator, Log Trade, Paste Alert, etc.)
- Active/selected preset buttons (1%, 2%, etc.)
- Active R-level items
- Form headings
- Watchlist pill hover states

#### Status Colors
```css
--color-success: #22c55e;        /* Green - synced, gains, closed trades */
--color-warning: #fbbf24;        /* Amber - syncing, warnings */
--color-error: #ef4444;          /* Red - errors, losses, delete actions */
```

#### Calculator Card Colors (Light Mode)
```css
/* Position Card */
background: #1a365d;             /* Navy - same as primary */

/* Target Card - Gain */
background: #2d6a4f;             /* Muted forest green */

/* Target Card - Loss */
background: #9b2226;             /* Muted burgundy */

/* Target Card - Inactive/Empty */
background: #f3f4f6;             /* Light gray */
border: 2px dashed #d1d5db;      /* Dashed border creates depth */
```

### Dark Mode

#### Primary Brand Color (Dark Mode)
```css
#3b82f6                          /* Medium blue - good contrast against charcoal */
#2563eb                          /* Hover state - slightly darker */
```

**This blue is used for ALL the same elements as light mode:**
- Header background
- All primary buttons
- Active/selected preset buttons
- Active R-level items
- Watchlist pill hover states
- Shortcut key recording state

**CRITICAL: Every blue interactive element must use `#3b82f6` in dark mode. No exceptions.**

**Why not muted navy?** The charcoal background (`#27272a`) is too close in value to muted navy (`#1e3a5f`), resulting in poor contrast. `#3b82f6` provides good contrast without being too bright.

#### Dark Mode Backgrounds
```css
#18181b                          /* Page background */
#27272a                          /* Card/panel backgrounds */
#2d2d30                          /* Slightly elevated (e.g., inactive card interior) */
#3f3f46                          /* Borders, dividers */
```

#### Calculator Card Colors (Dark Mode)
```css
/* Position Card */
background: #3b82f6;             /* Medium blue - matches header/buttons */

/* Target Card - Gain */
background: #1a4d3a;             /* Softer forest green */

/* Target Card - Loss */
background: #6b2c2c;             /* Softer burgundy */

/* Target Card - Inactive/Empty */
background: #2d2d30;             /* Slightly lighter than surroundings */
border: 2px dashed #3f3f46;      /* Creates inset effect */
```

**Note:** Dark mode colors should be SOFTER and more muted than light mode. Harsh bright colors are jarring on dark backgrounds.

---

## Theme Consistency Rules

### Rule 1: Matching Elements Must Match
If two elements look the same in light mode, they MUST look the same in dark mode.

**Example:** In light mode, the "Paste Alert" button and the active "1%" preset button are both navy. In dark mode, they must BOTH be `#1e3a5f`.

### Rule 2: Structural Parity
If light mode has a dashed border empty state, dark mode must also have a dashed border empty state.

### Rule 3: No Dark-Mode-Only Effects
Don't add visual effects (gradients, glows, special borders) to dark mode that don't exist in light mode.

### Rule 4: Test Both Themes
Before committing any CSS change, verify it looks correct in BOTH light and dark mode.

---

## Component Specifications

### Buttons

#### Primary Button
```css
/* Light Mode */
background-color: #1a365d;
color: white;

/* Dark Mode */
background-color: #1e3a5f;
color: white;

/* Hover - Both Modes */
background-color: [slightly lighter shade];
```

**Used for:** Position Size Calculator, Log Trade, Paste Alert, Export, Save, Submit

#### Secondary Button
```css
/* Light Mode */
background: transparent;
border: 1px solid #d1d5db;
color: #4b5563;

/* Dark Mode */
background: transparent;
border: 1px solid #52525b;
color: #a1a1aa;
```

**Used for:** Cancel, Close, secondary actions

#### Preset Buttons (Risk %, Max %)
```css
/* Inactive - Light Mode */
background: white;
border: 1px solid #d1d5db;
color: #374151;

/* Inactive - Dark Mode */
background: #3f3f46;
border: 1px solid #52525b;
color: #e4e4e7;

/* Active - Light Mode */
background: #1a365d;
border-color: #1a365d;
color: white;

/* Active - Dark Mode */
background: #1e3a5f;
border-color: #1e3a5f;
color: white;
```

### Form Inputs

```css
/* Light Mode */
background: white;
border: 1px solid #d1d5db;
color: #374151;

/* Dark Mode */
background: #27272a;
border: 1px solid #52525b;
color: #f4f4f5;

/* Focus Ring - Light Mode */
box-shadow: 0 0 0 3px rgba(26, 54, 93, 0.15);

/* Focus Ring - Dark Mode */
box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.25);
```

### Select Dropdown Arrow
The dropdown arrow SVG must be visible in both themes:
```css
/* Light Mode */
fill: #6b7280;

/* Dark Mode */
fill: #a1a1aa;
```

### Calculator Result Cards

Cards should be **solid colors**, not gradients or semi-transparent.

```css
/* Position Card */
Light: #1a365d (navy)
Dark:  #1e3a5f (muted navy)

/* Target Card - Active Gain */
Light: #2d6a4f (forest green)
Dark:  #1a4d3a (softer forest green)

/* Target Card - Active Loss */
Light: #9b2226 (burgundy)
Dark:  #6b2c2c (softer burgundy)

/* Target Card - Inactive/Empty */
Light: #f3f4f6 background, 2px dashed #d1d5db border
Dark:  #2d2d30 background, 2px dashed #3f3f46 border
```

**The inactive state should have visible depth** - the interior should be slightly different from the border area.

### Header

```css
/* Light Mode */
background: #1a365d;
color: white;

/* Dark Mode */
background: #1e3a5f;
color: white;
```

### Sync Status Pills (in Header)

```css
/* Synced - Dark Mode */
background: #166534;
color: #86efac;

/* Syncing - Dark Mode */
background: #854d0e;
color: #fef3c7;

/* Error - Dark Mode */
background: #7f1d1d;
color: #fca5a5;
```

---

## Typography

```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
```

No custom fonts. System fonts only.

---

## Spacing

Base unit: 4px

Common values: 8px, 12px, 16px, 20px, 24px, 30px

---

## Border Radius

```css
--radius-sm: 4px;    /* Badges, small elements */
--radius-md: 6px;    /* Buttons, inputs */
--radius-lg: 8px;    /* Cards, panels */
--radius-xl: 12px;   /* Large cards */
--radius-full: 9999px;  /* Pills */
```

---

## Shadows

Minimal. Prefer borders for definition.

```css
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
--shadow-md: 0 2px 8px rgba(0, 0, 0, 0.1);
--shadow-lg: 0 10px 40px rgba(0, 0, 0, 0.2);  /* Modals only */
```

---

## Dark Mode Implementation

### Two Selector Patterns Required

Every dark mode style must be defined twice:

```css
/* 1. Explicit theme selection */
[data-theme="dark"] .element {
    /* styles */
}

/* 2. System preference */
@media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) .element {
        /* same styles */
    }
}
```

### Native UI Elements

```css
[data-theme="dark"] {
    color-scheme: dark;  /* Required for scrollbars, checkboxes, etc. */
}
```

---

## Checklist for Design Changes

Before making any visual change, verify:

- [ ] Does it follow the flat design principle (no gradients, no glassmorphism)?
- [ ] Does the color match existing elements of the same type?
- [ ] Have you added BOTH `[data-theme="dark"]` AND `@media (prefers-color-scheme: dark)` styles?
- [ ] Does it look correct in light mode?
- [ ] Does it look correct in dark mode?
- [ ] Do interactive states (hover, active, focus) exist for both themes?
- [ ] Is there structural parity between themes (same borders, same layout)?

---

## Quick Reference: Dark Mode Colors

| Element | Color |
|---------|-------|
| Primary buttons, header, active states | `#3b82f6` |
| Primary hover | `#2563eb` |
| Page background | `#18181b` |
| Card/panel background | `#27272a` |
| Elevated surface (inactive card interior) | `#2d2d30` |
| Borders, dividers | `#3f3f46` |
| Secondary borders | `#52525b` |
| Muted text | `#71717a` |
| Secondary text | `#a1a1aa` |
| Primary text | `#e4e4e7` |
| Bright text | `#f4f4f5` |
| Position card | `#3b82f6` |
| Gain card | `#1a4d3a` |
| Loss card | `#6b2c2c` |
