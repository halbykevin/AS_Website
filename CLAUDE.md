# AS Company Website

Single-page "Coming Soon" landing page for **AS Company (Absolute Solutions SAL)** — market leader in telecommunication and electronics in Lebanon since 2008.

## Stack

- **React 18** + **Vite 5** (build tooling, `type: module`)
- **Tailwind CSS 3** for styling (utility-first, configured in `tailwind.config.js`)
- PostCSS + Autoprefixer

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview the production build locally |

## Structure

```
index.html              # HTML shell, fonts, favicon, meta
src/
  main.jsx              # React entry point — mounts <App /> into #root
  App.jsx               # The entire page (logo + "Coming Soon" + contact list)
  index.css             # Tailwind directives + base body styles
public/
  ASCompanyLogo.jpg     # Main logo used on the page
  as-store-logo.png     # Favicon
tailwind.config.js      # Theme: brand colors, Inter font, animations
```

> The page is intentionally a **single self-contained component** (`src/App.jsx`). There are no sub-components — keep it that way unless the site grows beyond the coming-soon stage.

## Brand

Defined in `tailwind.config.js`:

- `as-red` — `#A41E22` (with `.dark` `#82161A` and `.light` `#C53A3F`)
- `as-charcoal` — `#383F41`
- `as-gray` — `#B6B7B8`
- Font: **Inter** (loaded via Google Fonts in `index.html`)

## Contact details (single source of truth)

These appear in the contact list on the page. Update here and in `src/App.jsx` together:

- **Email:** `info@as.com.lb`
- **WhatsApp:** `https://wa.me/message/EHISICDXT6DJC1`
- **Instagram:** `https://www.instagram.com/ascompany.lb/` (@ascompany.lb)

## Conventions

- **Responsive first** — every layout uses mobile-first Tailwind breakpoints (`sm:`, `lg:`). Always verify changes look good from ~320px wide up to desktop.
- Keep markup accessible: meaningful `alt` text, real `<a>` links, external links use `target="_blank" rel="noreferrer"`.
- Logo uses `mix-blend-multiply` so the JPG's white background blends into the page.
