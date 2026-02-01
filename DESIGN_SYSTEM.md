# Trade Tracker Design System

This document defines the visual language and design principles for the Trade Tracker application. **All design changes must follow these guidelines to maintain consistency.**

---

## Design Philosophy

**Flat, Clean, Timeless** - The design prioritizes clarity and simplicity. No gradients, no glassmorphism, no trendy effects. Just clean, functional design that won't look dated.

### Core Principles

1. **Flat design** - No gradients, no glassmorphism, no 3D effects
2. **Solid color backgrounds** - Cards use solid fills, not semi-transparent overlays
3. **Consistent color usage** - The same color should be used everywhere that color appears
4. **Subtle depth** - Use borders and slight background color differences, not shadows
5. **Theme parity** - Light and dark mode should feel like the same app with matching visual hierarchy

### What NOT to Do

- **NO gradients** - Ever. Not for backgrounds, not for buttons, not for cards
- **NO glassmorphism** - No frosted glass effects, no backdrop-blur
- **NO trendy effects** - If it looks like a 2024 design trend, don't use it
- **NO inconsistent colors** - If one button is navy, ALL buttons should be navy
- **NO "heavy" headers** - Headers use light backgrounds with colored top border accents

---

## Theme Parity Strategy

Both light and dark modes share the same visual hierarchy:

| Element | Light Mode | Dark Mode |
|---------|------------|-----------|
| Header background | Light gray `#f8fafc` | Dark charcoal `#1f1f22` |
| Header top border | 3px navy `#1a365d` | 3px blue `#3b82f6` |
| Header text | Navy `#1a365d` | Light gray `#f4f4f5` |
| Sync status | Minimalist dot + muted text | Minimalist dot + muted text |
| Table headers | Light gray `#f3f4f6` | Dark charcoal `#1f1f22` |
| Primary buttons | Navy `#1a365d` | Blue `#3b82f6` |
| Toast accent | 3px navy left border | 3px blue left border |

---

## Color Palette

### Light Mode

#### Blue Hierarchy Strategy (Light Mode)

| Type | Color | Usage |
|------|-------|-------|
| **Primary Action** | `#1a365d` | Solid backgrounds for high-intent buttons |
| **Secondary/Interactive** | `#4b5563` | Ghost buttons, utility actions |

#### Primary Brand Color
```css
--color-primary: #1a365d;        /* Navy blue - solid button backgrounds */
--color-primary-hover: #2d4a7c;  /* Slightly lighter for hover */
--color-accent: #1a365d;         /* Same as primary for consistency */
```

#### Header (Light Mode)
```css
background: #f8fafc;             /* Very light gray */
border-top: 3px solid #1a365d;   /* Navy accent */
color: #1a365d;                  /* Navy text */
```

#### Status Colors
```css
--color-success: #22c55e;        /* Green - synced, gains, closed trades */
--color-warning: #fbbf24;        /* Amber - syncing, warnings */
--color-error: #ef4444;          /* Red - errors, losses, delete actions */
```

#### Sync Status (Light Mode)
```css
/* Minimalist dot style */
background: transparent;
color: #6b7280;                  /* Muted text */

/* Status dot (::before pseudo-element) */
width: 8px;
height: 8px;
border-radius: 50%;
background: #22c55e;             /* Green for synced */
background: #fbbf24;             /* Amber for syncing/not-synced */
background: #ef4444;             /* Red for error */
```

#### Table Headers (Light Mode)
```css
background: #f3f4f6;             /* Light gray */
color: #1a365d;                  /* Navy text */
```

#### Toast (Light Mode)
```css
background: #ffffff;
color: #374151;
border: 1px solid #d1d5db;
border-left: 3px solid #1a365d;  /* Navy accent */
border-radius: 8px;
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

#### Blue Hierarchy Strategy (Dark Mode)

The dark mode uses a two-tier blue system to create visual hierarchy:

| Type | Color | Usage |
|------|-------|-------|
| **Primary Action** | `#3b82f6` | Solid backgrounds for high-intent buttons (Log Trade, Paste Alert, Add New Trade) |
| **Secondary/Interactive** | `#93c5fd` | Ghost buttons, links, hover states (Sync Settings, Watchlist Pills, icon hovers) |

**Why this distinction?** If every interactive element uses the same vibrant blue, users won't know where to look. The lighter `#93c5fd` creates visual breathing room for utility actions that shouldn't compete with primary actions.

#### Primary Brand Color (Dark Mode)
```css
--color-primary: #3b82f6;        /* Medium blue - solid button backgrounds */
--color-primary-hover: #2563eb;  /* Slightly darker for hover */
--color-accent: #93c5fd;         /* Ice blue - ghost buttons, links, secondary actions */
```

**Why blue instead of navy?** The charcoal background (`#27272a`) is too close in value to muted navy, resulting in poor contrast. `#3b82f6` provides good contrast without being too bright.

#### Header (Dark Mode)
```css
background: #1f1f22;             /* Dark charcoal */
border-top: 3px solid #3b82f6;   /* Blue accent */
color: #f4f4f5;                  /* Light text */
```

#### Sync Status (Dark Mode)
```css
/* Minimalist dot style - same as light mode */
background: transparent;
color: #a1a1aa;                  /* Muted text */

/* Status dots use same colors as light mode */
```

#### Table Headers (Dark Mode)
```css
background: #1f1f22;             /* Dark charcoal - matches header */
color: #71717a;                  /* Muted gray text */
```

#### Toast (Dark Mode)
```css
background: #27272a;             /* Card background */
color: #f4f4f5;                  /* Bright text */
border: 1px solid #3f3f46;
border-left: 3px solid #3b82f6;  /* Blue accent */
border-radius: 8px;
```

#### Dark Mode Backgrounds
```css
#18181b                          /* Page background */
#1f1f22                          /* Header, table headers */
#27272a                          /* Card/panel backgrounds */
#2d2d30                          /* Slightly elevated surfaces */
#3f3f46                          /* Borders, dividers */
```

#### Calculator Card Colors (Dark Mode)
```css
/* Position Card */
background: #3b82f6;             /* Blue - matches header accent */

/* Target Card - Gain */
background: #1a4d3a;             /* Softer forest green */

/* Target Card - Loss */
background: #6b2c2c;             /* Softer burgundy */

/* Target Card - Inactive/Empty */
background: #2d2d30;             /* Slightly lighter than surroundings */
border: 2px dashed #3f3f46;      /* Creates inset effect */

/* R-Level Items (inactive) */
background: #2d2d30;             /* Matches inactive target card */
border: 1px solid #3f3f46;       /* Solid border (not dashed) */
color: #71717a;                  /* Label text - muted */
/* Price: #e4e4e7, Profit: #22c55e */

/* R-Level Items (active) */
background: #3b82f6;             /* Primary blue */
border-color: #3b82f6;
/* All text: white */
```

---

## Component Specifications

### Theme Toggle
```css
/* Light Mode */
background: transparent;
border: 1px solid #d1d5db;
color: #6b7280;

/* Light Mode Hover */
background: #f3f4f6;
border-color: #9ca3af;
color: #374151;

/* Dark Mode */
border-color: #52525b;
color: #a1a1aa;

/* Dark Mode Hover */
background: #3f3f46;
border-color: #71717a;
color: #e4e4e7;
```

### Primary Button
```css
/* Light Mode */
background-color: #1a365d;
color: white;

/* Dark Mode */
background-color: #3b82f6;
color: white;
```

**Used for:** Position Size Calculator, Log Trade, Paste Alert, Export, Save, Submit

### Secondary Button (Ghost Style)
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

### Utility Button (Ice Blue Ghost - Dark Mode Only)
```css
/* Dark Mode */
background: transparent;
border: 1px solid #93c5fd;
color: #93c5fd;

/* Dark Mode Hover */
background: rgba(147, 197, 253, 0.1);
```

**Used for:** Sync Settings, Watchlist Pills (text), Icon button hovers

**Why separate from Secondary?** These use the accent blue (`#93c5fd`) to indicate interactivity without competing with primary action buttons. They create visual breathing room for utility functions.

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
box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.35);
```

### Date Picker (Flatpickr)
```css
/* Selected day - uses primary color */
.flatpickr-day.selected {
    background: var(--color-primary);
    border-color: var(--color-primary);
}

/* Today indicator */
.flatpickr-day.today {
    border-color: var(--color-primary);
}
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
--radius-lg: 8px;    /* Cards, panels, toasts */
--radius-xl: 12px;   /* Large cards, modals */
--radius-full: 9999px;  /* Pills, theme toggle */
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
- [ ] Does it maintain theme parity (matching visual hierarchy)?

---

## Quick Reference: Light Mode Colors

| Element | Color |
|---------|-------|
| Header background | `#f8fafc` |
| Header top border | `#1a365d` |
| Primary buttons, active states | `#1a365d` |
| Primary hover | `#2d4a7c` |
| Table header background | `#f3f4f6` |
| Table header text | `#1a365d` |
| Sync status text | `#6b7280` |
| Toast background | `#ffffff` |
| Toast left accent | `#1a365d` |
| Theme toggle border | `#d1d5db` |
| Theme toggle icon | `#6b7280` |

## Quick Reference: Dark Mode Colors

| Element | Color |
|---------|-------|
| Header background | `#1f1f22` |
| Header top border | `#3b82f6` |
| Primary buttons, active states | `#3b82f6` |
| Primary hover | `#2563eb` |
| Page background | `#18181b` |
| Card/panel background | `#27272a` |
| Table header background | `#1f1f22` |
| Table header text | `#71717a` |
| Borders, dividers | `#3f3f46` |
| Secondary borders | `#52525b` |
| Sync status text | `#a1a1aa` |
| Muted text | `#71717a` |
| Secondary text | `#a1a1aa` |
| Primary text | `#e4e4e7` |
| Bright text | `#f4f4f5` |
| Toast background | `#27272a` |
| Toast left accent | `#3b82f6` |
| Theme toggle border | `#52525b` |
| Theme toggle icon | `#a1a1aa` |
| Position card | `#3b82f6` |
| Gain card | `#1a4d3a` |
| Loss card | `#6b2c2c` |
