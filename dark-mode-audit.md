# Dark Mode Audit - Trade Tracker

## Overview
This document provides context for auditing the dark mode implementation in the Trade Tracker application. The goal is to identify any remaining color contrast issues, readability problems, or inconsistencies between light and dark modes.

## File Structure
- `styles.css` - All styles including dark mode overrides
- `index.html` - HTML structure
- `app.js` - Application logic (not relevant for CSS audit)

## How Dark Mode Works

### Two Selector Patterns
Dark mode is implemented using two parallel selector patterns to support both explicit theme selection and system preference:

1. **Explicit theme**: `[data-theme="dark"]` - When user manually selects dark mode
2. **System preference**: `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }` - When following system setting

**Important**: Any dark mode fix must be applied to BOTH selector patterns.

### CSS Variables
The app uses CSS variables that change between themes. Key variables in dark mode:

```css
[data-theme="dark"] {
    --color-primary: #60a5fa;        /* Light blue (was dark navy) */
    --color-primary-hover: #3b82f6;
    --color-accent: #93c5fd;
    --color-success: #86efac;        /* Light green */
    --color-warning: #fbbf24;        /* Amber/gold */
    --color-error: #f87171;          /* Light red */

    /* Grays are INVERTED in dark mode */
    --color-gray-50: #27272a;        /* Dark (was light) */
    --color-gray-100: #18181b;       /* Darkest */
    --color-gray-700: #e4e4e7;       /* Light (was dark) */
    --color-gray-900: #ffffff;       /* White (was near-black) */
}
```

## Known Issues Fixed

### 1. Sync Status Buttons (Header)
**Problem**: The sync status button in the header had contrast issues:
- "Synced" state: Light green on light blue header (clashed)
- "Syncing" state: Blue text (`var(--color-primary)`) on gold background (poor contrast)

**Fix Applied** (lines 2846-2871 and 3055-3081):
```css
[data-theme="dark"] .sync-status.synced {
    background: #166534;    /* Dark green */
    color: #86efac;         /* Light green text */
}

[data-theme="dark"] .sync-status.syncing {
    background: #854d0e;    /* Dark amber */
    color: #fef3c7;         /* Cream text */
}
```

### 2. Preset Buttons (Calculator)
**Problem**: No visual indication of which preset (1%, 2%, etc.) is selected in dark mode.

**Fix Applied**: Added explicit `.preset-btn.active` dark mode styles with blue background.

### 3. Input Fields with Buttons
**Problem**: `.input-with-buttons input` had hardcoded `background-color: white` which wasn't overridden.

**Fix Applied**: Added `[data-theme="dark"] .input-with-buttons input { background-color: #27272a; }`

### 4. Trade Card (Snapshot Display)
**Problem**: `.trade-card` had hardcoded `background: white` with no dark mode override.

**Fix Applied**: Added comprehensive dark mode styling for trade card and its children.

### 5. Table Row Hover, Native UI, and Modal Contrast
**Problem**:
- Table row hovers were invisible in dark mode and matching background in light mode.
- Native UI elements (scrollbars, checkboxes) remained light.
- Modal backdrops were too light (50%) for dark mode.
- Conflicting border definitions for inputs.

**Fix Applied** (Jan 31, 2026):
- Changed light mode hover to `white` and dark mode to `#3f3f46`.
- Added `color-scheme: dark` to dark mode selectors.
- Increased modal backdrop opacity to 75% in dark mode.
- Removed conflicting input border rules.

## Areas to Audit

### High Priority - Check These First

1. **Header area** (`header`, `.sync-status`, `.theme-toggle`)
   - Verify sync button states are readable against blue header background
   - Check theme toggle visibility

2. **Calculator panel** (`.calculator-panel`, `.calc-inputs-row`, `.preset-btn`)
   - Input fields should have dark backgrounds
   - Preset buttons should show active state clearly
   - R-level items should be readable

3. **Trade table** (`table`, `thead`, `tbody`, `.btn-view`, `.btn-edit`, `.btn-delete`)
   - Table headers readable
   - Row hover states visible
   - Action buttons have appropriate contrast

4. **Modals** (`.modal-content`, `.trade-details-modal-content`)
   - Modal backgrounds should be dark
   - Text readable
   - Form inputs styled correctly

5. **Forms** (`.form-group`, `input`, `select`, `textarea`)
   - All inputs have dark backgrounds
   - Placeholder text visible but muted
   - Focus states visible

### Medium Priority

6. **Toast notifications** (`.toast`)
   - Background and text contrast

7. **Watchlist** (`.watchlist-pill`, `.watchlist-quick-add`)
   - Pills readable
   - Quick-add input styled

8. **Buttons** (`.btn-primary`, `.btn-secondary`, `.btn-ghost`)
   - All button variants have appropriate contrast
   - Hover states visible

### Lower Priority

9. **Flatpickr date picker** (`.flatpickr-calendar`)
   - Calendar popup styled for dark mode

10. **Keyboard shortcuts modal** (`.shortcut-key`, `.shortcut-row`)
    - Key indicators visible

## How to Test

1. Open the app in a browser
2. Toggle dark mode using the theme button in the header
3. Check each component listed above
4. Also test with system dark mode preference (set OS to dark mode, ensure no explicit theme is set)

## Suggesting Fixes

When suggesting fixes, please provide:

1. **The problem**: What element has the issue and what's wrong
2. **The selector**: The CSS selector(s) affected
3. **The fix**: The CSS to add/modify
4. **Both patterns**: Remember to suggest fixes for BOTH `[data-theme="dark"]` AND `@media (prefers-color-scheme: dark)` patterns

### Example Fix Format:

```
**Issue**: [Description of the problem]
**Affected element**: [CSS selector]
**Current behavior**: [What it looks like now]
**Expected behavior**: [What it should look like]

**Suggested fix**:
```css
/* Add to dark mode explicit overrides section (~line 2820) */
[data-theme="dark"] .selector {
    property: value;
}

/* Add to @media (prefers-color-scheme: dark) block (~line 3053) */
:root:not([data-theme="light"]) .selector {
    property: value;
}
```

## File Locations in styles.css

- **CSS Variables**: Lines 1-146
- **Base styles**: Lines 148-270
- **Sync status**: Lines 183-269
- **Buttons**: Lines 276-366
- **Forms**: Lines 368-480
- **Trade table**: Lines 700-860
- **Modals**: Lines 980-1090
- **Calculator**: Lines 1530-2100
- **Dark mode explicit overrides**: Lines 2820-3050
- **System preference dark mode**: Lines 3053-3320
- **Trade details modal**: Lines 3616-3864
