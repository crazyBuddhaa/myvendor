# myvendor WhatsApp Bot — Setup Guide

This guide walks you through connecting the WhatsApp bot to your Supabase database and Meta WhatsApp Business account.

---

## Prerequisites

- A [Supabase](https://supabase.com) project with the myvendor schema applied
- A [Meta Developer](https://developers.facebook.com) account with a WhatsApp Business app
- (Optional) An [Anthropic](https://console.anthropic.com) API key for natural-language replies

---

## Step 1 — Supabase

1. Go to your Supabase project → **Settings → API**
2. Copy the **Project URL** — this is your `SUPABASE_URL`
3. Copy the **service_role** key (not the anon key) — this is your `SUPABASE_SERVICE_ROLE_KEY`

> ⚠️ The service_role key bypasses Row Level Security. Never expose it in client-side code.

Set these as secrets in your deployment environment:

```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

---

## Step 2 — Meta WhatsApp Business App

### 2a. Create or open your app

1. Go to [developers.facebook.com](https://developers.facebook.com) → **My Apps → Create App**
2. Choose **Business** type
3. Add the **WhatsApp** product to your app

### 2b. Get your Phone Number ID and Access Token

1. In your app sidebar → **WhatsApp → API Setup**
2. Under **Step 1**, copy the **Phone Number ID** — this is your `WA_PHONE_NUMBER_ID`
3. Generate a **temporary access token** for testing, or create a **System User** token for production:
   - Meta Business Suite → Settings → System Users → Add → generate token with `whatsapp_business_messaging` permission
   - That token is your `WA_ACCESS_TOKEN`

### 2c. Get your App Secret

1. In your app sidebar → **Settings → Basic**
2. Click **Show** next to **App Secret** — this is your `WA_APP_SECRET`

> This is used to verify that incoming webhooks actually come from Meta.

### 2d. Choose a Verify Token

Pick any string you want — e.g. `myvendor-webhook-2024`. You'll enter this exact string in both:
- Your environment secrets as `WA_VERIFY_TOKEN`
- The Meta webhook configuration (Step 3 below)

---

## Step 3 — Register the Webhook with Meta

1. In your app sidebar → **WhatsApp → Configuration**
2. Click **Edit** next to the Webhook section
3. Enter:
   - **Callback URL**: `https://your-domain.com/api/whatsapp/webhook`
   - **Verify Token**: the string you chose in Step 2d
4. Click **Verify and Save** — Meta will call your endpoint with a challenge; the server responds automatically
5. Under **Webhook Fields**, subscribe to **messages**

> Your server must be publicly reachable before this step. If running locally, use a tunnel like [ngrok](https://ngrok.com): `ngrok http 5000` and use the `https://xxxx.ngrok.io` URL.

---

## Step 4 — Environment Variables Summary

Set all of the following as secrets in your deployment environment:

| Variable | Required | Where to find it |
|----------|----------|-----------------|
| `SUPABASE_URL` | ✅ | Supabase → Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase → Settings → API → service_role key |
| `WA_APP_SECRET` | ✅ | Meta app → Settings → Basic → App Secret |
| `WA_VERIFY_TOKEN` | ✅ | Any string you choose (must match Step 3) |
| `WA_ACCESS_TOKEN` | ✅ | Meta → WhatsApp → API Setup → access token |
| `WA_PHONE_NUMBER_ID` | ✅ | Meta → WhatsApp → API Setup → Phone Number ID |
| `ANTHROPIC_API_KEY` | ⬜ Optional | [console.anthropic.com](https://console.anthropic.com) → API Keys |

> Without `ANTHROPIC_API_KEY`, the bot still works — unknown messages get a "Type *help*" reply instead of an AI response.

---

## Step 5 — Vendor Phone Number Format

When vendors add their WhatsApp number in their profile settings, they can use either format:

- **International**: `2348012345678` (no + prefix)
- **Local Nigerian**: `08012345678`

The bot normalises both automatically.

---

## Step 6 — Test the Bot

Send one of these messages to your WhatsApp Business number:

| Message | Expected reply |
|---------|---------------|
| `hi` | Welcome message with command list |
| `orders` | Today's order count + pending list |
| `revenue` | Monthly earnings |
| `products` | Inventory summary |
| `stats` | Full store overview |
| `help` | Command reference |

If your `ANTHROPIC_API_KEY` is set, you can also ask in plain English:
- *"How many orders did I get today?"*
- *"What's my best-selling month so far?"*

---

## Webhook Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/whatsapp/webhook` | Meta verification challenge |
| `POST` | `/api/whatsapp/webhook` | Incoming messages |

---

## Security Notes

- All incoming POST requests are verified against `X-Hub-Signature-256` using your `WA_APP_SECRET`
- Message IDs are deduplicated in memory — duplicate deliveries from Meta produce only one reply
- The service_role key is only used server-side and never exposed to clients
