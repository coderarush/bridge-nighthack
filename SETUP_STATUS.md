# Setup Status — what's done, what's left

## ✅ Done for you (already working)

- **All the risky code is built and passes a production build**: the GitHub adapter
  (fetch → branch → commit → draft PR), exact-SHA CI polling, the deterministic
  patcher (9/9 tests), the scan/plan/patch/PR/validate API routes, and the room UI.
- **Supabase is live**: project `bridge-nighthack`, schema applied, one demo room
  seeded. Connection values are already in `prebuilt/bridge-app/.env.local`.
  - URL: `https://pniaffhgrtzcaxpwwrwa.supabase.co`
  - Publishable key: `sb_publishable_cqLdgFDuc6MoZUp0npqLlg_O5LuutsE` (public-safe)
  - Seeded demo room id: `f1386415-3de2-41ad-b499-36261d2eec91`
- (You paused the **Arova** Supabase project to free a slot — un-pause it anytime;
  Bridge uses its own separate project.)

## 🟡 Left for you — ~15 minutes total, only you can do these

### 1. GitHub — "how do I connect it?"
You do **not** connect GitHub like Vercel/Supabase. Bridge talks to GitHub with a
**token you paste into env**, not a connector. Two quick pieces:

**a) Push the demo repo** (2 min)
- On github.com, create an empty repo named **`atlas-store-demo`** (no README).
- Then:
  ```bash
  cd prebuilt/atlas-store-demo
  GH_OWNER=<your-github-username> ./push-to-github.sh
  ```
- In the repo's **Settings → General**, set the default branch to **`demo-base`**.

**b) Make a fine-grained token** (3 min)
- GitHub → **Settings → Developer settings → Fine-grained tokens → Generate new**.
- Repository access: **Only** `atlas-store-demo`.
- Permissions: **Contents Read/Write, Pull requests Read/Write, Actions Read, Checks Read**.
- Copy the token. You'll paste it as `GITHUB_TOKEN` in Vercel (step 3).

*(Optional: if you'd rather I push repos and open PRs for you in future sessions,
you can authorize the GitHub connector in claude.ai → Settings → Connectors. Not
required — the token is the real mechanism Bridge uses.)*

### 2. Deploy to Vercel (5 min) — you're already logged in
```bash
cd prebuilt/bridge-app
npx vercel@latest login      # if not already logged in
npx vercel@latest --prod --yes
```
Vercel auto-detects Next.js and gives you a public URL. First deploy renders the
landing + room (room falls back to seed if env isn't set yet).

### 3. Add env vars in Vercel, then redeploy (3 min)
Vercel dashboard → your project → **Settings → Environment Variables** → add:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://pniaffhgrtzcaxpwwrwa.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_cqLdgFDuc6MoZUp0npqLlg_O5LuutsE` |
| `NEXT_PUBLIC_DEMO_RUN_ID` | `f1386415-3de2-41ad-b499-36261d2eec91` |
| `NEXT_PUBLIC_APP_URL` | your Vercel URL (e.g. `https://bridge-xxx.vercel.app`) |
| `GITHUB_TOKEN` | the token from step 1b |
| `GITHUB_DEMO_OWNER` | your GitHub username |
| `GITHUB_DEMO_REPO` | `atlas-store-demo` |
| `GITHUB_DEMO_BASE_BRANCH` | `demo-base` |
| `DEMO_MODE` | `true` |

Then redeploy (`npx vercel@latest --prod --yes`).

## ✅ How you know it works
- Open your Vercel URL → landing loads.
- Click **Open a migration room** → the seeded room shows the change, 3 impacted
  files, timeline, and a draft-PR/CI panel (from the live database).
- Post a comment / approve → it persists (open a 2nd window to see it).
- Once `GITHUB_TOKEN` + owner are set: **Change → Create migration → Run migration**
  fetches the real files, opens a **real draft PR**, and polls CI until it's green.

## Want me to do more?
If you authorize the GitHub connector, next session I can push both repos and even
run the first migration end-to-end for you. Otherwise the steps above are the whole job.
