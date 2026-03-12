# Orbex Design System

> Modern, dark, robotic aesthetic for an agentic AI knowledge graph

---

## Core Principles

1. **Dark & Minimal** - Pure blacks and grays, no visual clutter
2. **Robotic Precision** - Grid-based layouts, sharp edges, systematic spacing
3. **Breathable** - Generous whitespace, let elements float
4. **Technical Feel** - Monospace typography, subtle grid patterns, node aesthetics

---

## Color Palette

### Backgrounds
| Token | Hex | Usage |
|-------|-----|-------|
| `bg-primary` | `#000000` | Main background |
| `bg-secondary` | `#0A0A0A` | Cards, elevated surfaces |
| `bg-tertiary` | `#111111` | Hover states, subtle elevation |

### Borders & Lines
| Token | Hex | Usage |
|-------|-----|-------|
| `border-subtle` | `#1A1A1A` | Card borders, dividers |
| `border-default` | `#262626` | Input borders, stronger dividers |
| `border-hover` | `#333333` | Hover states |

### Text
| Token | Hex | Usage |
|-------|-----|-------|
| `text-primary` | `#FFFFFF` | Headings, important text |
| `text-secondary` | `#A1A1A1` | Body text, descriptions |
| `text-tertiary` | `#666666` | Muted text, placeholders |

### Functional (future)
| Token | Hex | Usage |
|-------|-----|-------|
| `accent` | TBD | Primary actions, highlights |
| `success` | TBD | Success states |
| `error` | `#EF4444` | Error states |

---

## Typography

### Font Families
- **Headings**: Inter (variable, sans-serif)
- **Body/Content**: Berkeley Mono (monospace)

### Scale
| Level | Size | Weight | Font | Line Height |
|-------|------|--------|------|-------------|
| `h1` | 48px / 3rem | 600 | Inter | 1.1 |
| `h2` | 32px / 2rem | 600 | Inter | 1.2 |
| `h3` | 24px / 1.5rem | 500 | Inter | 1.3 |
| `h4` | 18px / 1.125rem | 500 | Inter | 1.4 |
| `body` | 14px / 0.875rem | 400 | Berkeley Mono | 1.6 |
| `small` | 12px / 0.75rem | 400 | Berkeley Mono | 1.5 |
| `code` | 13px / 0.8125rem | 400 | Berkeley Mono | 1.5 |

---

## Spacing

Use 4px base unit:
- `4px` - Micro spacing (icon gaps)
- `8px` - Tight spacing
- `16px` - Default spacing
- `24px` - Medium spacing
- `32px` - Section spacing
- `48px` - Large spacing
- `64px` - XL spacing
- `96px` - Page sections

---

## Components

### Cards
```css
background: #0A0A0A;
border: 1px solid #1A1A1A;
border-radius: 8px;
padding: 24px;
```

### Inputs
```css
background: #000000;
border: 1px solid #262626;
border-radius: 6px;
padding: 12px 16px;
font-family: 'Berkeley Mono', monospace;
font-size: 14px;
color: #FFFFFF;

/* Focus state */
border-color: #333333;
outline: none;

/* Placeholder */
color: #666666;
```

### Buttons

**Primary (Ghost for now)**
```css
background: transparent;
border: 1px solid #262626;
border-radius: 6px;
padding: 12px 24px;
font-family: 'Berkeley Mono', monospace;
font-size: 14px;
color: #FFFFFF;

/* Hover */
background: #111111;
border-color: #333333;
```

**Solid (future with accent)**
```css
background: var(--accent);
border: none;
/* ... */
```

### Links
```css
color: #A1A1A1;
text-decoration: none;

/* Hover */
color: #FFFFFF;
```

---

## Patterns & Textures

### Dot Grid Background
Subtle dot pattern for depth:
```css
background-image: radial-gradient(#1A1A1A 1px, transparent 1px);
background-size: 24px 24px;
```

### Line Grid
For structured sections:
```css
background-image:
  linear-gradient(#1A1A1A 1px, transparent 1px),
  linear-gradient(90deg, #1A1A1A 1px, transparent 1px);
background-size: 48px 48px;
```

### Node Connectors
Use thin lines (`1px`, `#262626`) connecting elements to create network/graph feel.

---

## Layout

- Max content width: `1200px`
- Card max width: `480px` (forms), `600px` (content)
- Centered layouts for auth pages
- Generous vertical rhythm (`48px`+ between sections)

---

## Animations

Keep minimal and subtle:
- Transitions: `150ms ease`
- Hover effects only
- No bouncing, scaling, or attention-grabbing motion

---

## Reference Sites
- [Daytona](https://www.daytona.io/) - Infrastructure UI, dark cards, clean layout
- [Omnius](https://www.omnius.so/) - Robotic feel, grid patterns, minimal color

---

## Implementation Notes

### Tailwind CSS v4
Using CSS variables in `globals.css` for theming. Custom utilities defined there.

### Font Loading
- Inter: Google Fonts (variable)
- Berkeley Mono: Self-hosted or fallback to system monospace
