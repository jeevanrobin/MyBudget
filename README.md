# MyBudget

A simple daily budget tracker that runs in the browser and installs on your iPhone home screen like a normal app. It works offline, and all data stays on your device.

## Features

- **Today view**: how much you can still spend today. The rest of the month's budget is spread evenly over the days left, so a cheap day gives you more to spend tomorrow.
- **Quick add**: tap **+**, enter an amount, pick a category, and save. Tap an entry to edit or delete it.
- **Swipe** left or right on Today to move between days. Tap the date to jump back to today.
- **History**: every entry grouped by day, with search.
- **Stats**: monthly spend against your budget, a daily spending chart, and a breakdown by category.
- **Settings**: monthly budget, currency symbol, the day your month starts (for example your payday), and your own expense categories.
- **Backup**: export a CSV, or export and restore a full JSON backup.
- Light and dark mode follow your iPhone setting.

## Install on iPhone

1. Open the app's URL in **Safari**. After GitHub Pages is enabled, it is `https://jeevanrobin.github.io/MyBudget/`.
2. Tap the **Share** button, then **Add to Home Screen**.
3. Open **MyBudget** from your home screen. It runs full screen and works offline.

> Data lives in the browser storage of the installed app. Deleting the home-screen app deletes its data, so use **Settings → Export backup** now and then.

## Hosting (GitHub Pages)

The workflow in `.github/workflows/pages.yml` deploys the site on every push to `main`.
If the first run fails, enable Pages once: **Settings → Pages → Build and deployment → Source: GitHub Actions**, then re-run the workflow.

## Run locally

No build step is needed. The site is plain HTML, CSS and JavaScript.

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

When you change any app file, bump `CACHE` in `sw.js` (for example `mybudget-v2`) so installed copies pick up the update.
