# Trade Tracker Design System

This document defines the visual language and design principles for the Trade Tracker application.

---

## Design Philosophy

**Flat, Clean, Professional** - The design prioritizes clarity and simplicity. No gradients, minimal shadows, and a focus on typography and spacing.

**Key Principles:**
- Flat design with subtle depth through borders and background colors
- Navy blue as the dominant brand color
- Generous whitespace
- Consistent border-radius (6px for inputs, 8px for cards/panels, 12px for large cards)
- Left-border accents for emphasis (toasts, alerts)

---

## Color Palette

### Primary Colors
```css
--color-primary: #1a365d;        /* Navy blue - main brand color */
--color-primary-hover: #2d4a7c;  /* Navy blue hover state */
--color-primary-light: rgba(26, 54, 93, 0.15);  /* Focus ring */
```

### Accent Colors
```css
--color-accent: #2563eb;         /* Bright blue - links, interactive elements */
--color-accent-hover: #1d4ed8;
```

### Status Colors
```css
/* Success - Green */
--color-success: #22c55e;
--color-success-light: #dcfce7;
--color-success-dark: #166534;

/* Warning - Yellow/Amber */
--color-warning: #fbbf24;
--color-warning-light: #fef3c7;
--color-warning-dark: #92400e;

/* Error - Red */
--color-error: #ef4444;
--color-error-light: #fee2e2;
--color-error-dark: #991b1b;

/* Info - Blue */
--color-info: #2563eb;
--color-info-light: #dbeafe;
--color-info-dark: #1e40af;
```

### Neutral Colors (Gray Scale)
```css
--color-gray-50: #f9fafb;   /* Backgrounds */
--color-gray-100: #f3f4f6;  /* Alt backgrounds */
--color-gray-200: #e5e7eb;  /* Borders, dividers */
--color-gray-300: #d1d5db;  /* Input borders */
--color-gray-400: #9ca3af;  /* Placeholder text */
--color-gray-500: #6b7280;  /* Secondary text */
--color-gray-600: #4b5563;  /* Body text */
--color-gray-700: #374151;  /* Headings */
--color-gray-800: #1f2937;
--color-gray-900: #111827;
```

---

## Typography

**Font Family:** System fonts for fast loading and native feel
```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
```

**Font Sizes:**
- Page title: 1.5rem (24px)
- Section heading: 1.25rem (20px)
- Body/inputs: 0.95rem (15px)
- Small/labels: 0.85rem (13.6px)
- Tiny/badges: 0.8rem (12.8px)
- Micro/tags: 0.75rem (12px)

**Font Weights:**
- Regular: 400
- Medium: 500
- Semi-bold: 600
- Bold: 700

---

## Spacing

Use consistent spacing multiples:
- Base unit: 4px
- Common values: 8px, 12px, 16px, 20px, 24px, 30px

**Component spacing:**
- Form group margin-bottom: 20px
- Section margin-bottom: 20px-30px
- Input padding: 10px 12px (standard), 14px 16px (large/calculator)
- Button padding: 10px 20px (standard), 8px 16px (small)
- Card padding: 25px-30px

---

## Border Radius

```css
--radius-sm: 4px;    /* Small elements, badges */
--radius-md: 6px;    /* Buttons, inputs */
--radius-lg: 8px;    /* Cards, panels */
--radius-xl: 12px;   /* Large cards, calculator result cards */
--radius-full: 9999px;  /* Pills, round buttons */
```

---

## Shadows

Minimal shadow usage - prefer borders for definition.

```css
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
--shadow-md: 0 2px 8px rgba(0, 0, 0, 0.1);   /* Cards, panels */
--shadow-lg: 0 10px 40px rgba(0, 0, 0, 0.2); /* Modals */
```

---

## Button Styles

### Primary Button (Main Actions)
Navy blue filled button for primary actions.
```css
.btn-primary {
    background-color: var(--color-primary);  /* Navy blue */
    color: white;
    border: none;
    border-radius: 6px;
    padding: 10px 20px;
    font-weight: 500;
}
```
**Use for:** Submit, Save, Import, Export actions

### Secondary Button (Cancel/Dismiss)
Ghost-style outlined button for secondary actions.
```css
.btn-secondary {
    background-color: transparent;
    color: var(--color-gray-600);
    border: 1px solid var(--color-gray-300);
    border-radius: 6px;
    padding: 10px 20px;
    font-weight: 500;
}
```
**Use for:** Cancel, Close, Dismiss actions

### Ghost Button (Subtle Actions)
Outlined button that fills on hover.
```css
.btn-ghost {
    background-color: transparent;
    color: var(--color-primary);
    border: 2px solid var(--color-primary);
}
```
**Use for:** Secondary navigation, toggle buttons (like Manage Watchlist)

### Danger Actions (Edit/Delete)
Outlined style that fills with color on hover.
```css
.btn-delete {
    background-color: transparent;
    color: var(--color-error);
    border: 1px solid var(--color-error);
}
/* Hover: fills with error color */
```

---

## Form Elements

### Text Inputs
```css
input {
    padding: 10px 12px;
    border: 1px solid var(--color-gray-300);
    border-radius: 6px;
    font-size: 0.95rem;
}

/* Focus state */
input:focus {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px var(--color-primary-light);
}

/* Error state */
input.error {
    border-color: var(--color-error);
}
```

### Labels
```css
label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-gray-700);
    margin-bottom: 6px;
}
```

---

## Cards & Panels

### Standard Panel
```css
.panel {
    background-color: var(--color-gray-50);  /* White/light gray */
    padding: 25px-30px;
    border-radius: 8px;
    box-shadow: var(--shadow-md);
}
```

### Result Cards (Calculator)
Colored cards with internal structure.
```css
.calc-result-card {
    background: var(--color-primary);  /* Navy */
    border-radius: 12px;
    padding: 25px;
    color: white;
}
```

---

## Feedback Elements

### Toast Notifications
Flat design with left border accent.
```css
.toast {
    background: white;
    color: var(--color-gray-700);
    padding: 12px 20px;
    border: 1px solid var(--color-gray-300);
    border-left: 3px solid var(--color-primary);  /* Accent border */
    border-radius: 6px;
}
```

### Status Badges
Pill-shaped with background color.
```css
.status-badge {
    padding: 4px 10px;
    border-radius: 20px;
    font-size: 0.8rem;
    font-weight: 500;
}

/* Example: Open status */
.status-open {
    background-color: var(--color-success-light);
    color: var(--color-success-dark);
}
```

---

## Watchlist Pills
Small clickable ticker pills.
```css
.watchlist-pill {
    padding: 6px 12px;
    font-size: 0.8rem;
    font-weight: 600;
    border: 1px solid var(--color-gray-300);
    border-radius: 20px;
    background: white;
    color: var(--color-primary);
}

/* Hover: fills with primary color */
.watchlist-pill:hover {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: white;
}
```

---

## Modal Design

```css
.modal {
    /* Backdrop */
    background: rgba(0, 0, 0, 0.5);
}

.modal-content {
    background: var(--color-gray-50);
    padding: 30px;
    border-radius: 12px;
    max-width: 450px;
    box-shadow: var(--shadow-lg);
}

/* Modal heading */
.modal-content h2 {
    color: var(--color-primary);
    margin-bottom: 20px;
}

/* Modal description */
.modal-description {
    color: var(--color-gray-500);
    font-size: 0.9rem;
}

/* Modal actions - button row */
.modal-actions {
    display: flex;
    gap: 10px;
    margin-top: 20px;
}
```

---

## Dark Mode

Dark mode uses a charcoal palette with blue accents.

### Key Color Mappings
| Light Mode | Dark Mode |
|------------|-----------|
| White backgrounds | #27272a (charcoal) |
| Navy primary | #60a5fa (light blue) |
| Gray-700 text | #f4f4f5 (near white) |
| Input borders | #52525b |

### Dark Mode Cards
Use dark slate backgrounds with top-border accents instead of solid bright colors.
```css
[data-theme="dark"] .calc-result-card {
    background: #1e293b;
    border: 1px solid #334155;
    border-top: 3px solid #60a5fa;  /* Blue accent */
}
```

---

## Responsive Breakpoints

```css
/* Tablet */
@media (max-width: 768px) { }

/* Mobile */
@media (max-width: 480px) { }
```

### Mobile Considerations
- Stack buttons vertically on mobile
- Single-column form layouts
- Adjust padding (15-20px instead of 25-30px)
- Disable hover effects for touch devices with `@media (hover: none)`

---

## Animation & Transitions

Keep animations subtle and fast.

```css
transition: all 0.2s;  /* Standard transition */
```

**Common transitions:**
- Button hover: background-color, color
- Input focus: border-color, box-shadow
- Modal: opacity, transform
- Toast: opacity, translateY

---

## Do's and Don'ts

### Do
- Use navy blue for primary actions
- Use left-border accents for emphasis
- Keep spacing consistent with 4px multiples
- Use white/light backgrounds with subtle borders
- Test all changes in both light and dark mode

### Don't
- Use gradients
- Use heavy drop shadows
- Mix different blue shades inconsistently
- Use bright colors for large filled areas (except result cards)
- Forget dark mode support
