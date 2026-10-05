# Voucher Manager — Netlify + Google Sheets

This build uses Netlify for the website/backend and your existing Google Sheet as the database.

Spreadsheet ID:
`1dzBPGwwCx0RN1XCXHL5tH6haayE7gGup-buXsl7Oilc`

Expected sheets:
Products, Voucher_Items, Voucher_History, Confirmed_Orders, Confirmed_Order_Items

## Before deployment
1. In Google Cloud Console create/select a project.
2. Enable Google Sheets API.
3. Create a Service Account and create a JSON key.
4. Copy the service-account email.
5. Share the Google Sheet with that email as Editor.
6. In Netlify Project configuration → Environment variables add:
   `SPREADSHEET_ID` = `1dzBPGwwCx0RN1XCXHL5tH6haayE7gGup-buXsl7Oilc`
   `GOOGLE_SERVICE_ACCOUNT_JSON` = the complete contents of the JSON key file.
7. Never commit the JSON key to GitHub.

## Deploy
Upload this project to GitHub, then in Netlify choose Add new project → Import an existing project → GitHub.
Publish directory: `public`
Build command: leave blank.
Netlify will install the function dependency and deploy the API.

## Features
- Product dropdown by product name.
- Editable unit price without changing master product price.
- Voucher numbering `V-YYYYMMDD-001`.
- History, confirm, delete, and today's reset guard.
- Current voucher PDF only.
- Mobile-first responsive layout.
- Real PDF file shared through the phone's native share sheet when the browser supports file sharing; otherwise it downloads.

## WhatsApp
A normal WhatsApp URL cannot force a PDF attachment. The app creates the actual PDF file first, then the Android/iPhone share sheet can send that file to WhatsApp.
