# Continuous deploy (GitHub → Apps Script)

When code is pushed to `master`, GitHub Actions runs **clasp** to:

1. `clasp push` — upload `.gs` / HTML / `appsscript.json` into your Apps Script project  
2. `clasp deploy` — create a **new version** on your existing Web app deployment (same `/exec` URL)

You do **not** need to paste files by hand after this is configured.

---

## One-time setup (about 10 minutes)

### 1. Enable the Apps Script API

1. Sign in as the **group Gmail**.
2. Open: [https://script.google.com/home/usersettings](https://script.google.com/home/usersettings)
3. Turn **Google Apps Script API** **On**.

### 2. Copy your Script ID

1. [script.google.com](https://script.google.com) → **NAZ SHE Workflow**
2. **Project Settings** (gear)
3. Copy **Script ID** (long string under “IDs”)

You will add this as GitHub secret `CLASP_SCRIPT_ID`.

### 3. Copy your Deployment ID

1. **Deploy → Manage deployments**
2. On the Web app deployment, copy the **Deployment ID**  
   (same `AKfycb…` value that appears in your `/exec` URL)

You will add this as GitHub secret `CLASP_DEPLOYMENT_ID`.

### 4. Create clasp login credentials (on your PC)

Use a computer where you can install Node.js, signed into the **group Gmail** in the browser when prompted.

```bash
npm install --global @google/clasp@2.4.2
clasp login
```

Browser opens → allow access with the **group Gmail**.

Then locate the credentials file:

- Windows: `C:\Users\<You>\.clasprc.json`
- Mac/Linux: `~/.clasprc.json`

Open that file → select all → copy the **entire JSON**.

You will add this as GitHub secret `CLASPRC_JSON` (paste the whole JSON as the secret value).

**Never commit** `.clasprc.json` to the repo.

### 5. Add GitHub secrets

1. Open: https://github.com/Christopher-Erick/Google-workflow/settings/secrets/actions  
2. **New repository secret** for each:

| Secret name | Value |
|-------------|--------|
| `CLASP_SCRIPT_ID` | Script ID from step 2 |
| `CLASP_DEPLOYMENT_ID` | Deployment ID from step 3 |
| `CLASPRC_JSON` | Full contents of `.clasprc.json` from step 4 |

### 6. Turn on Actions (if needed)

Repo → **Settings → Actions → General** → allow Actions / allow GitHub-hosted runners.

### 7. Test

Push any small change to `master`, or run:

**Actions → Deploy Apps Script → Run workflow**

When it finishes green, refresh the Web app URL — your latest code should be live.

---

## Local push (optional)

```bash
npm install --global @google/clasp@2.4.2
clasp login
# create .clasp.json locally (gitignored) with your scriptId:
# { "scriptId": "YOUR_SCRIPT_ID", "rootDir": "." }
clasp push --force
clasp deploy -i YOUR_DEPLOYMENT_ID -d "manual"
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Invalid credentials` / login errors | Re-run `clasp login`, update `CLASPRC_JSON` secret |
| `Script ID not found` / 404 | Check `CLASP_SCRIPT_ID`; API must be On for group account |
| `Requested entity was not found` on deploy | Deployment ID is wrong or deleted. Apps Script → **Deploy → Manage deployments** → copy **Deployment ID** → update GitHub secret `CLASP_DEPLOYMENT_ID` → re-run Actions |
| Push works but `/exec` looks old | Check `CLASP_DEPLOYMENT_ID` matches Manage deployments |
| Permission denied | `clasprc` must be from the **group Gmail** that owns the script |

---

## Security notes

- `CLASPRC_JSON` grants push access to the Apps Script project — treat it like a password.
- Rotate by running `clasp login` again and updating the secret.
- Prefer only maintainers with Admin rights on the GitHub repo.
