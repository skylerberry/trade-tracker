# Trade Tracker

A simple web app for logging and managing swing trades. Designed as a replacement for Excel/Google Sheets trade tracking.

## Features

- **Trade Logging**: Track ticker, entry price, entry date, initial/current stop loss
- **Sale Tracking**: Log unlimited partial sales with portion (1/5, 1/4, 1/3, 1/2), price, and date
- **Status Management**: Filter by open, partially closed, fully closed, or stopped out
- **Position Size Calculator**: Calculate position size based on account size, risk %, and stop loss
  - R-multiple calculations (1R-5R levels)
  - Target price profit projections
  - Max position % limit
  - Preset buttons for common risk/max values
- **PDF Export**: Generate shareable PDF reports of open trades
- **Cross-Device Sync**: Sync trades and calculator settings across devices using GitHub Gist
- **Undo Support**: Cmd+Z / Ctrl+Z to undo form field changes
- **Input Icons**: Visual glyphs for form fields ($, calendar, chart icons)

## Setup

### Local Development
```bash
# Clone the repo
git clone https://github.com/skylerberry/trade-tracker.git
cd trade-tracker

# Start a local server
python3 -m http.server 8000

# Open http://localhost:8000
```

### Cross-Device Sync (GitHub Gist)

1. Click "Configure Sync" in the app
2. Follow the setup guide to create a GitHub Personal Access Token
3. Save & Sync to create a new Gist
4. On other devices, use the same token and Gist ID to sync

## Live Site

- **Netlify**: https://trackyourtrades.netlify.app
- **GitHub Pages**: https://skylerberry.github.io/trade-tracker

## Tech Stack

- Vanilla HTML/CSS/JavaScript
- [Flatpickr](https://flatpickr.js.org/) for date pickers
- [jsPDF](https://github.com/parallax/jsPDF) for PDF export
- localStorage + GitHub Gist API for data persistence

## Testing

```bash
npm install
npx playwright test
```
