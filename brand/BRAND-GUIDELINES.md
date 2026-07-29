# EasyFile Brand Guidelines

## Brand positioning

**EasyFile** is a practical, browser-based business toolkit designed to make everyday administration faster and easier. The brand should communicate simplicity, capability, trust, and operational clarity.

Recommended descriptor:

> Practical business tools for quotes, invoices, orders, records, payroll, inventory, CRM, assets, and inspections.

Recommended short tagline:

> Business paperwork, made easier.

## Primary logo

Use [`/icon.png`](../icon.png) as the primary EasyFile logo asset.

The logo combines a rounded blue application tile, a file-folder symbol, an upload arrow, and the EasyFile wordmark. Use the original asset without redrawing, stretching, skewing, rotating, outlining, recolouring, or adding effects.

### Minimum sizes

- Browser favicon: 32 × 32 px
- Interface navigation: 40 × 40 px
- App launcher or social avatar: 96 × 96 px
- Print use: at least 25 mm wide

### Clear space

Keep clear space around the logo equal to at least one quarter of the logo's displayed width. Do not place text, borders, or other symbols inside this area.

### Backgrounds

Preferred backgrounds:

- White or Cloud Grey
- EasyFile Blue
- Midnight Navy
- Simple, low-detail imagery with adequate contrast

## Colour system

### Primary palette

| Token | Hex | Use |
|---|---:|---|
| EasyFile Blue | `#2563EB` | Primary buttons, navigation, links, active states |
| Deep Blue | `#1D4ED8` | Hover states, emphasis, darker brand applications |
| Sky Blue | `#349CF4` | Logo-aligned highlights, gradients, illustrations |
| Blue Soft | `#DBEAFE` | Informational backgrounds, badges, selected states |

### Neutral palette

| Token | Hex | Use |
|---|---:|---|
| Midnight | `#0B1220` | Dark-mode page background |
| Slate | `#0F172A` | Dark-mode cards and panels |
| Ink | `#111827` | Primary text on light backgrounds |
| Muted Slate | `#4B5563` | Secondary text on light backgrounds |
| Cool Grey | `#94A3B8` | Secondary text on dark backgrounds |
| Border Grey | `#E5E7EB` | Borders, separators, input outlines |
| Cloud | `#F3F4F6` | Light-mode page background |
| White | `#FFFFFF` | Cards, forms, documents, negative space |

### Status colours

| Meaning | Hex |
|---|---:|
| Success | `#16A34A` |
| Warning | `#D97706` |
| Error | `#DC2626` |
| Information | `#0891B2` |

Status colours communicate system state and must not replace EasyFile Blue as the primary brand colour.

## Typography

### Primary typeface

Use **Inter** in brand, marketing, and Canva materials.

### Product fallback stack

```css
Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
"Segoe UI", Roboto, Arial, sans-serif
```

### Recommended hierarchy

- Display heading: Inter ExtraBold or Black
- Section heading: Inter Bold
- Interface label: Inter SemiBold
- Body copy: Inter Regular
- Supporting text: Inter Regular with reduced emphasis
- Numeric data: tabular numerals where supported

Use sentence case for headings and controls. Avoid unnecessary all-capital text except short document labels such as INVOICE or RECEIPT.

## Interface style

The EasyFile interface should retain the current product language:

- Blue primary navigation
- White or slate cards
- Rounded corners between 8 and 24 px
- Pill-shaped badges for status and category labels
- Subtle slate shadows rather than heavy black shadows
- Strong, visible focus rings
- Generous spacing based on an 8 px grid
- Light and dark themes using the same semantic tokens

## Photography and illustration

Use clean, realistic business scenes involving small businesses, contractors, field teams, office administrators, and service providers. Screens should look practical and operational rather than abstract or futuristic.

Illustrations may use simple line icons, document metaphors, folders, checklists, arrows, and modular cards. Use EasyFile Blue as the dominant accent.

## Voice and tone

EasyFile copy should be:

- Direct and practical
- Clear about where data is stored and how features work
- Helpful without being informal or vague
- Confident without making unsupported compliance claims
- Written in plain business language

Prefer: **Create and print a professional invoice in your browser.**

Avoid: **Revolutionise your entire financial universe instantly.**

## Naming

Use **EasyFile** as the master brand. Use **Easy Suite** as the collective product-suite descriptor where needed.

Recommended module pattern:

- EasyQUOTE
- EasyINV
- EasyPO
- EasySO
- EasyREC
- EasySTAT
- EasyPAY
- EasyCRM

## Accessibility

- Maintain WCAG 2.2 AA colour contrast for text and controls.
- Do not communicate status using colour alone.
- Provide visible keyboard focus states.
- Use meaningful alternative text for informative images.
- Use an empty `alt` attribute for the logo when adjacent text already says EasyFile.
- Respect reduced-motion preferences.

## Implementation assets

- Primary logo: [`/icon.png`](../icon.png)
- Shared brand tokens: [`/assets/css/easyfile-brand-tokens.css`](../assets/css/easyfile-brand-tokens.css)
- Shared navigation: [`/partials/easy-nav.html`](../partials/easy-nav.html)
- Shared runtime branding: [`/assets/js/easy-suite-core.js`](../assets/js/easy-suite-core.js)
