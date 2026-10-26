# Splooshly

A kitchen and home inventory app for you and your wife, installed straight to your iPhone home screens. Tracks meat and frozen packages down to the exact weight, seasoning, oils, and home essentials like shampoo and toilet paper, with a shared shopping list and real usage analytics.

## What it does

- **Meat and frozen**: every package you add is tracked individually with its own weight and date. Packages of the same item group together and expand to show each one, so you can remove the exact package you used.
- **Seasoning, Oils, Home essentials, Produce, Pantry, Other**: simple one-line rows. Tap Restock to pull an item from inventory and drop it straight onto the shared shopping list.
- **Home essentials** additionally get a quantity stepper (−/+) so you can nudge the count down as you use something without fully restocking it.
- **Shopping list**: fed entirely by Restock. Tap Purchased once it's bought, and it disappears.
- **Meat usage analytics**: pick 1, 3, 9, or 12 months and see average pounds-per-week consumed, per meat type, based on real removal history.
- **Search**: a global search tab, plus a live search box at the top of every category.
- **Add items** by scanning a barcode (free auto-lookup of the product name), snapping a photo (optional AI identification), or typing manually.
- **Two-person login**, so only you and your wife can see or edit your household's inventory.
- Full Splooshly branding: the real logo, Sprout green accent, Gabarito type, installs to the iPhone home screen with the Splooshly app icon.

## Updating to v2 (Oct 2026 redesign) — read before deploying

v2 adds canonical products, Use vs Delete, Insights with a meat runway, restock suggestions, a real shopping list, and fixes the "lb / week" unit bug. **Existing data is kept**:

1. **Run the database update first.** In Supabase › SQL Editor › New query, paste all of `supabase/migrations/2026-10-25_redesign.sql` and click Run.
   - It first copies every table into a private `splooshly_backup` schema.
   - It only *adds* tables and columns and never deletes or overwrites existing values.
   - It runs as one transaction and is safe to run twice.
   - The result shows row counts next to the backup counts, and they should match.
   - The current app keeps working after this step.
2. **Then deploy the code** (push to `main`; Vercel redeploys).
3. **Open the app once.** It links your existing items and usage history to products. Naming variants like "Boneless Chicken Breasts" and "Boneless Chicken Breast" are grouped, and the other spelling is kept as an alias. It only fills in the new `product_id` column.
4. Look-alikes that aren't exact variants (e.g. "Shrimp" vs "Raw Shrimp") are *not* merged automatically. Merge them yourself in Settings › Merge duplicates.

If the new code is deployed before step 1, the app shows a "One database step first" screen instead of loading. Nothing is touched until the SQL has run.

Run the math tests with `npm test`.

## Cost

Free for a two-person household, realistically:

- Hosting on Vercel: free tier.
- Database, auth, and photo storage on Supabase: free tier (500MB database, 1GB storage) — comfortably enough for a household inventory.
- Barcode lookups: free, no API key (Open Food Facts).
- AI photo identification: optional. Skip it and photo-add just lets you snap a reference photo and type the name yourself. Turn it on and it uses OpenAI's cheapest vision model (gpt-4o-mini), roughly $0.001–0.003 per photo, well under $1/month at normal use.

## Publish it live: step by step

You'll need two free accounts: **Supabase** (database, login, photo storage) and **Vercel** (hosting). Both let you sign up with GitHub in a couple of clicks. Total time: about 15–20 minutes.

### Step 1 — Create the Supabase project

1. Go to [supabase.com](https://supabase.com) and sign up.
2. Click **New project**. Give it any name (e.g. "Splooshly"), pick a database password (save it somewhere), and choose the region closest to you.
3. Once it's created, open the **SQL Editor** in the left sidebar, click **New query**, paste in the entire contents of `supabase/schema.sql` from this project, and click **Run**. This creates every table, the security rules, and the photo storage bucket in one go.
4. Go to **Project Settings → API**. You'll need two values from this page in Step 3: the **Project URL** and the **anon public** key.

### Step 2 — Put the code on GitHub

1. Go to [github.com](https://github.com) and create a new empty repository (e.g. `splooshly`).
2. Unzip the project you downloaded from this chat, open a terminal in that folder, and run:
   ```bash
   git init
   git add .
   git commit -m "Initial Splooshly build"
   git branch -M main
   git remote add origin https://github.com/<your-username>/splooshly.git
   git push -u origin main
   ```

### Step 3 — Deploy to Vercel

1. Go to [vercel.com](https://vercel.com), sign up, and click **Add New → Project**.
2. Import the `splooshly` repo you just pushed.
3. Before deploying, expand **Environment Variables** and add:
   - `NEXT_PUBLIC_SUPABASE_URL` → the Project URL from Step 1
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → the anon public key from Step 1
   - `OPENAI_API_KEY` → optional, only needed if you want AI photo identification (get a key at platform.openai.com)
4. Click **Deploy**. In about a minute you'll get a live URL like `splooshly-yourname.vercel.app`.

### Step 4 — Create your household and sign in

1. Open the Vercel URL on your phone, tap **New here? Create an account**, and sign up with your email. Do the same on your wife's phone.
2. Back in Supabase, go to **Authentication → Users** and copy both of your **User UID** values.
3. In the Supabase **SQL Editor**, run this (swap in your real UUIDs):
   ```sql
   insert into households (id, name) values ('11111111-1111-1111-1111-111111111111', 'Our Kitchen');
   insert into household_members (user_id, household_id, display_name) values
     ('<your-user-id>', '11111111-1111-1111-1111-111111111111', 'Alec'),
     ('<wife-user-id>', '11111111-1111-1111-1111-111111111111', 'Wife');
   ```
4. Reload the app on both phones. You'll now see the same shared inventory.

### Step 5 — Add it to your iPhone home screen

Open the live URL in Safari, tap the Share icon, then **Add to Home Screen**. It'll launch full-screen with the Splooshly icon from then on, no browser bar, just like a native app.

### After that: pushing updates

Any time you want to change something, edit the code, commit, and `git push`. Vercel automatically redeploys on every push to `main`, no extra steps.

## Running it locally (optional, for making changes before you deploy)

```bash
npm install
cp .env.local.example .env.local   # fill in your Supabase URL and anon key
npm run dev
```

Open http://localhost:3000. To test camera features (barcode scanning, photo capture) on your phone against a local server, use a tool like `ngrok`, since Safari requires HTTPS for camera access.

## Project structure

- `src/app` — pages: home, category browse, search, add, shopping list, analytics, account, login
- `src/components` — Logo, Header, NavBar, BarcodeScanner, MeatGroupList (grouped packages), SimpleItemList (flat rows with Restock)
- `src/lib` — Supabase client, inventory/shopping-list/analytics data access, auth context, types
- `src/app/api/identify` — server route that calls OpenAI vision for photo identification
- `supabase/schema.sql` — full database schema, including the shopping list and security rules
- `public/brand` — the source Splooshly logo files
- `brand.md` / `brand.css` — the full brand spec this build was styled against

## Ideas for later, if useful

- Push notifications a few days before something expires (Supabase Edge Functions + a cron job).
- A "what can I make?" view that cross-references a recipe's ingredient list against current inventory.
- Barcode scanning for quick removal, not just adding (scan what you just used).
- Auto-adding low or expired items to the shopping list without a manual Restock tap.
