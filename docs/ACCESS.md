# Fix “unable to open the file” for good

## Why Account Chooser was not enough

After you pick an account, Google often still sends you to:

`/macros/u/0/s/.../exec` or `/macros/u/3/s/.../exec`

That form is broken for many multi-account browsers. Our launcher now avoids bookmarking that path.

## Use these links only

1. **Choose account:** https://christopher-erick.github.io/Google-workflow/open.html  
2. **Workflow window:** https://christopher-erick.github.io/Google-workflow/app.html  

`app.html` loads the script inside a stable page (not a `/u/N/` bookmark).

---

## If it STILL shows Drive error — recreate the Web app (required)

Do this while signed into the **group Gmail** (script owner):

### A) Re-authorise the script
1. [script.google.com](https://script.google.com) → **NAZ SHE Workflow**
2. Open any `.gs` file → function dropdown → **`runInitialSetup`** → **Run**
3. Click **Review permissions** → choose **group Gmail** → Advanced → Allow

### B) Create a brand-new deployment (do not only “edit” the old one)
1. **Deploy → New deployment**
2. Gear → **Web app**
3. Description: `SHE workflow stable`
4. **Execute as:** Me  
5. **Who has access:** Anyone with a Google account  
6. **Deploy**
7. Copy the new **Web app URL**  
   It must look like:  
   `https://script.google.com/macros/s/AKfycb....../exec`  
   with **no** `/u/0/` in it.

### C) Send the new URL to update the launcher
Paste only the new `/exec` URL in chat (or the `AKfycb…` id).  
We will update `docs/app.html`, `docs/open.html`, and the GitHub secret `CLASP_DEPLOYMENT_ID`.

### D) Brave
Shields → **Down** for `script.google.com`.

---

## Account roles reminder

| Account | Use |
|---------|-----|
| Personal Admin Gmail | Daily Admin work |
| Group Gmail | Owns Drive; use only when managing the script |
