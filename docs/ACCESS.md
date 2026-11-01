# Access guide (multi-account Chrome)

## What went wrong

1. **HTTP 400** on “Choose account” — Google Account Chooser only accepts a **Google** continue URL. Continuing to `github.io` is rejected as malformed.
2. **Drive error** on the script link — Chrome rewrites the app to `/macros/u/0/` or `/u/3/` when several Google accounts share one browser profile. That path is broken.

## Reliable setup (recommended)

Create **two Chrome profiles** (or Brave profiles):

| Profile name | Sign in with | Use for |
|--------------|--------------|---------|
| SHE Admin | Your **personal Admin** Gmail only | Daily admin / approvals |
| SHE Group | **Group** Gmail only | Drive / script owner tasks |

In each profile, bookmark only:

`https://script.google.com/macros/s/AKfycbz9lQgBtWBMaa6eJXIwhlqTOyRppxKHUpMZowWLPGRQqEn2s_MNWoWU63NRf1jzaQWg/exec`

One account per profile = no `/u/N/` bug.

## Launcher pages

- https://christopher-erick.github.io/Google-workflow/open.html  
- https://christopher-erick.github.io/Google-workflow/app.html  

Optional: enter your Gmail on `open.html` before opening (helps `authuser=`).

## Brave

Shields **Down** on `script.google.com`.

## Optional: Google Site (org-wide link)

1. Group Gmail → [sites.google.com](https://sites.google.com) → New site  
2. Embed → URL → paste the `/exec` link above  
3. Publish → share the Site link with members  

Members open the **Site** URL instead of `script.google.com`.
