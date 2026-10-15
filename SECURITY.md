# Security policy

## Supported versions

Only the latest commit on `master`, which is what GitHub Pages serves, gets fixes.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting ("Report a vulnerability" under the
Security tab of this repository) rather than a public issue. Include the steps to reproduce
and what you think the impact is. I aim to reply within a week.

## What is in place

- The game is a static page with no backend, accounts, cookies or network requests after load.
- A Content Security Policy meta tag allows scripts, styles and images from the page's own
  origin only, and blocks plugins, form posts and `<base>` changes.
- No third-party scripts, fonts, trackers or CDNs.
- Data read back from `localStorage` (settings and best scores) is treated as untrusted:
  every field is type-checked and range-checked, and anything invalid falls back to defaults.
- CI runs `npm audit`, CodeQL, and installs dependencies with `--ignore-scripts`. GitHub
  Actions are pinned to full commit SHAs and run with read-only tokens, except the Pages
  deploy job, which can only write to Pages.
- Dependabot opens weekly update PRs for npm packages and actions.
