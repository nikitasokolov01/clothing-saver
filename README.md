# Clothing Saver MVP

A wardrobe shortlist and personal closet. Paste a clothing product link to import its image, price, colors, sizes, and availability, then keep it on your account until you buy it.

## Run locally

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Without Supabase environment variables, the app runs in local preview mode and stores data in the browser.

## Supabase accounts

1. Create a Supabase project.
2. Copy `.env.example` to `.env.local` and add the project URL and publishable key from the Supabase Connect dialog.
3. Apply the SQL files in `supabase/migrations` in timestamp order from the project's SQL Editor or your normal Supabase migration workflow.
4. Restart `npm run dev`.

The migration creates account-owned `products` and `profiles` tables. Row Level Security is enabled on both, and every operation checks that `auth.uid()` owns the row. Never put a Supabase secret or service-role key in a `NEXT_PUBLIC_` environment variable.

## Current MVP

- Imports product metadata from public retailer pages
- Recognizes Mulebuy links backed by Weidian, Taobao, Tmall, and 1688 while preserving the original Mulebuy link
- Lets you review and correct imported details
- Supports email/password sign-up, login, session refresh, and logout with Supabase
- Saves products and size preferences per account when Supabase is configured
- Falls back to browser storage for local UI development
- Filters items by clothing category
- Tracks a requested size and its current stock state
- Stores a size profile and matches acceptable sizes by clothing category
- Moves purchased items from Saved pieces into a separate Closet inventory
- Creates shareable profile links at `/u/username`
- Supports public or private profiles with follow requests
- Includes follow-request notifications and a feed of shared pieces
- Lets each profile share Saved, Closet, both, or neither
- Rechecks a saved product through the import endpoint
- Opens the original retailer page when a product capsule is clicked

Some retailer sites block automated page requests or publish incomplete product data. In those cases the review screen supports manual entry.

## Checks

```bash
npm test
npm run lint
npm run build
```

Deployment can move from localhost to Vercel after the Supabase project variables are added to the Vercel project.
