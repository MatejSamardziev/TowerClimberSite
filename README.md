# TowerClimber website

Three files. They exist to satisfy three store requirements at once:

| File | Satisfies |
| --- | --- |
| `app-ads.txt` | AdMob's app-ads.txt verification (KAN-10) — **both** Android and iOS |
| `privacy.html` | The privacy policy URL Google Play and the App Store both require |
| `index.html` | The developer/support site the stores link to, and the account-deletion request route Google requires |

## Before deploying

The support address is `support.allstarstudios@gmail.com`, already filled into
both HTML files. Nothing else needs editing before deploy.

Check `app-ads.txt` against the snippet AdMob shows you under
**Apps → app-ads.txt → How to set up**. It should read:

```
google.com, pub-8467500314143352, DIRECT, f08c47fec0942fa0
```

The publisher ID came from the AdMob app IDs in `app.json`. Trust AdMob's own
snippet over this file if they ever disagree.

## The one rule that breaks this

**`app-ads.txt` must sit at the root of the domain.** The crawler fetches
exactly `https://yourdomain/app-ads.txt` and nowhere else.

That rules out a GitHub Pages *project* site, which serves from
`username.github.io/repo-name/` — a subdirectory. The file would be ignored and
verification would silently never pass.

## Deploying free, on GitHub Pages

Use a **user site**, which serves from the root:

1. Create a public repo named exactly `<your-github-username>.github.io`.
2. Put these three files in its root and push to `main`.
3. Repo → Settings → Pages → Source: **Deploy from a branch**, branch `main`, folder `/`.
4. Wait a minute, then confirm `https://<username>.github.io/app-ads.txt` returns the line as plain text.

That URL is your developer website. `github.io` is a public suffix, so your
subdomain counts as its own root domain and the crawler accepts it.

A custom domain (~$10/year, set via a `CNAME` file plus DNS) is more reliable
long-term and looks better on a store listing, but is not required.

Netlify, Cloudflare Pages, and Vercel all serve from the root too and work
equally well.

## After deploying — where each URL goes

- **Google Play Console** → Store settings → Store listing contact details →
  **Website**. This is the field AdMob crawls to find `app-ads.txt`. It must be
  the root domain, not a path.
- **Play Console** → Data safety form → account deletion section → the
  deletion request URL: `https://yourdomain/#deleting-your-account`, or just the
  root URL.
- **Play Console** → Store listing → **Privacy policy** URL:
  `https://yourdomain/privacy.html`
- **App Store Connect** (when you get there) → App Information → **Marketing URL**
  = the root domain, and **Privacy Policy URL** = the privacy page. AdMob reads
  the marketing URL for iOS app-ads.txt verification.

AdMob rechecks roughly every 24 hours. Status shows under **Apps → app-ads.txt**
and moves from "Not found" to "Verified" on its own once the URL is live in the
store listing.

## Known gap

`privacy.html` and `index.html` currently point account deletion at email,
because **the app has no in-app delete button**. The backend implements
`DELETE /account` (`AuthService.deleteAccount`), but nothing in the frontend
calls it. Google requires an in-app deletion path *as well as* a web one for
apps with accounts. Wire a button into `AccountScreen.tsx` before submitting,
then update the deletion wording on both pages.
