# FUSE PREP v3 — Whatnot CSV Builder

An offline-first, installable, no-subscription PWA for prepping vintage Whatnot inventory. **The workspace table, photo bucket and hosted web address are yours.** This is not affiliated with Whatnot.

## Start here

- **First time / beginner:** Open `SETUP.html` on any browser or follow the on-screen `☁ Cloud sync` instructions.
- **Instant Mac preview (no accounts):** Double-click the separate `FusePrep-Open-Now.html` at the top of the ZIP. This version works locally, but may have browser restrictions on local photo persistence and cannot be installed as a PWA until hosted.
- **Install on phone and Mac:** Host the `fuse-prep-app/` directory as a static site on free GitHub Pages. See SETUP.html.
- **Cross-device sync and Whatnot-ready hosted image URLs:** Create a free Supabase project, run `supabase-setup.sql`, enter the public project URL and publishable/anon key in app, and create/sign in to an account.

## Main features

- 100 blank slots, add 25 at a time, reset with confirmation
- Batch PRICE ALL, per-item price and title/description, fill empty titles
- XS / S / M / L / XL / XXL / XXXL buttons (title suffix and uppercase `SIZE: XX` in description)
- Add 100–300 camera roll photos and keep their upload order
- Auto-assign 1–8 consecutive photos per listing, plus drag-and-drop and tap-to-assign
- Compress images (maximum 1440px long side, JPEG 79%) to reduce free storage usage
- Autosave listing metadata in browser localStorage and photo blobs in IndexedDB
- Optional Supabase Authentication, Row Level Security, hosted public URLs, cloud workspace autosave
- CSV export with exactly 21 columns in exactly the sequence from the uploaded Whatnot CSV template
- Download/restore JSON metadata backup; URLs survive when uploaded, local-only photos do not travel within the backup

## Important notes

1. **No external signup is needed to use local mode**, but Chrome/Firefox may block file:// browser storage. Prefer the hosted version for reliability.
2. GitHub Pages uses public repositories on the free tier. Only app source is public, not account data (which is held in per-user Supabase rows).
3. Supabase's *public-read* image bucket is intentionally public, because Whatnot must be able to download pictures without authenticating. Database rows remain restricted to the signed-in owner. Uploaded photo URLs may be viewed if shared.
4. The CSV preserves the uploaded template's headers, but the provided template contained only example data, **not the separate Whatnot Values tab**. You must enter official valid category, subcategory, condition, and shipping values.
5. Whatnot supports importing drafts without photos; inventory drafts need an image before publishing. If local photos haven't been uploaded, choose the clearly labeled photo-free export option.
6. Test with 1–2 listings. The tool cannot guarantee successful Whatnot import in the face of changing Whatnot field values or seller/account constraints.
7. Free Supabase projects have limits (currently 1GB storage, 500MB DB, and inactivity pause). Do not use paid upgrades unless you intentionally choose them.
8. If using two devices, finish and sync on one before editing on the other; concurrent editing is last-write-wins.
9. Imported Whatnot CSVs create new drafts each time. Duplicates can occur if the same file is imported repeatedly.
10. Hosted photos aren't deleted automatically on removal, as previous Whatnot listings may still point to those URLs. Free storage can fill up; manage obsolete hosted files yourself in Supabase if no longer referenced.

## Folder

- `index.html` — app
- `styles.css` — app styling
- `app.js` — UI, IndexedDB, optional Supabase REST client
- `core.mjs` — reusable, pure CSV/schema helpers
- `sw.js` and `manifest.webmanifest` — PWA/offline install support
- `icon.svg`, `icon-*.png` — install icons
- `SETUP.html` — beginner instructions
- `supabase-setup.sql` — optional one-time cloud database/storage setup

## Developer smoke checks

`node --check app.js && node --check core.mjs`

For development: `python3 -m http.server 8080` inside `fuse-prep-app`, then visit `http://localhost:8080`.

## Primary documentation

- Whatnot bulk CSV import: https://help.whatnot.com/hc/en-us/articles/7440530071821-Bulk-import-products-from-a-CSV-file
- GitHub Pages: https://docs.github.com/en/pages/quickstart
- Supabase free plan: https://supabase.com/pricing
