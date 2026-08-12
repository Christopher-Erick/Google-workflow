# Stable access (fix “unable to open the file”)

## What causes the Drive error

Chrome/Brave rewrites the web app link to:

`https://script.google.com/macros/u/0/s/.../exec`  
or `/u/3/` etc.

That `/u/N/` form often shows **Sorry, unable to open the file at present** when several Google accounts are signed in — even in Incognito after a bad redirect.

## Permanent entry link

Use the launcher (no `/u/N/`):

**https://christopher-erick.github.io/Google-workflow/docs/open.html**

(or the Pages URL shown after enabling GitHub Pages)

It always:

1. Uses the clean `/macros/s/.../exec` URL  
2. Opens Google **Account Chooser** so you pick personal Admin or group Gmail  

Bookmark **that** page for both Chrome profiles.

## One-time repair if the app still fails for everyone

Do this signed into the **group Gmail**:

1. [script.google.com](https://script.google.com) → **NAZ SHE Workflow**
2. Open `Setup.gs` → select function **`runInitialSetup`** → **Run**
3. **Review permissions** → Allow all (needed after new scopes)
4. **Deploy → Manage deployments → pencil → New version → Deploy**
5. Copy the **Web app URL**
6. Confirm it looks like:
   `https://script.google.com/macros/s/AKfycb.../exec`  
   **not** `.../macros/u/0/s/...`
7. Paste that URL into Setup → Web app URL → Save  
8. If the deployment ID changed, update GitHub secret `CLASP_DEPLOYMENT_ID` and the `EXEC_URL` in `docs/open.html`

## Browser tips

- Prefer **Chrome** for this app; if using **Brave**, disable Shields on `script.google.com`
- Personal Admin Gmail = day-to-day admin work  
- Group Gmail = Drive/script owner only when needed  
- Never keep a bookmark that contains `/u/0/` or `/u/3/`
