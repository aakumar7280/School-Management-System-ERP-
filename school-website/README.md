# School Website (Standalone)

This is a basic standalone school website created outside the ERP folder.

## Location

`/Users/aarushkumar/Desktop/Work/School Managment System/school-website`

## Files

- `index.html` — website structure
- `styles.css` — styling
- `script.js` — mobile menu + dynamic ERP link support
- `assets/photos/` — add school/campus images here

## ERP Login Button

The top `ERP Login` button points to:

`https://school-management-system-erp-cw3u2j7t2-aakumar7280s-projects.vercel.app/login`

You can change this in:

- `index.html` (`id="erpLoginBtn"` and `id="erpFooterLink"`)

or quickly pass it as query param while testing:

`index.html?erp=https://your-erp-domain.com/login`

## Add School Photos

Replace gallery placeholders with actual images by:

1. Adding files to `assets/photos/`
2. Updating the gallery section in `index.html` with `<img src="assets/photos/your-image.jpg" alt="..." />`

## Run / Preview

Quick preview options:

- Open `index.html` directly in browser, or
- From this folder run a local server, e.g.:
  - `python3 -m http.server 8080`
  - then open `http://localhost:8080`

## Deploy Website (Vercel)

1. Push `school-website` to a GitHub repository (same repo or separate is fine).
2. In Vercel, click **Add New Project** and import that repo.
3. Set root directory to `school-website`.
4. Deploy (no build settings required for this static site).
5. Open the deployed website and click **ERP Login** — it opens your live ERP login.

Tip: if ERP URL changes later, update `id="erpLoginBtn"` and `id="erpFooterLink"` in `index.html`.

## What’s Included

- Sticky header with navigation
- Top ERP Login button
- Hero section + CTAs
- About, Academics, Admissions, Facilities
- Gallery placeholders
- Notices/Announcements
- Testimonials
- Contact section + embedded map
- Footer with ERP Login link
