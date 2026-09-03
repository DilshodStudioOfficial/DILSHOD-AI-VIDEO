# DILSHOD AI VIDEO — COMPLETE CUSTOMER + STRIPE

This package adds customer accounts, per-user credits, Stripe Checkout, Stripe webhook crediting, generation history, a protected admin panel, generation charging/refunds, and the existing Kling 3 text/image video generation.

## Render Environment
Required:
- FAL_KEY
- STRIPE_SECRET_KEY
- STRIPE_WEBHOOK_SECRET
- SESSION_SECRET (long random value)
- PUBLIC_URL (your Render URL, e.g. https://dilshod-ai-video0.onrender.com)
- SITE_USER
- SITE_PASSWORD

Optional:
- ADMIN_EMAIL (recommended: your owner email; this email gets /admin access)
- DATA_FILE

## Stripe webhook
Create a Stripe webhook endpoint:
`https://YOUR-DOMAIN/api/stripe/webhook`
Subscribe to `checkout.session.completed` and put the signing secret into `STRIPE_WEBHOOK_SECRET`.

## Important storage note
This version stores accounts and history in `data.json`. On Render Free, local disk is ephemeral. For real customer volume, connect a persistent database (Supabase/Postgres) before launch. The application logic is separated so the store can be migrated later.

Never put FAL_KEY or STRIPE_SECRET_KEY in GitHub or frontend code.
