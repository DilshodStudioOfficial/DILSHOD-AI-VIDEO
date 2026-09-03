# DILSHOD AI VIDEO — Stripe + Kling 3

## Render Environment
Keep:
- FAL_KEY = your fal.ai key
- STRIPE_SECRET_KEY = your Stripe secret key
Add:
- SESSION_SECRET = a long random secret
- STRIPE_WEBHOOK_SECRET = the signing secret from your Stripe webhook
Optional:
- PUBLIC_URL = https://YOUR-RENDER-DOMAIN.onrender.com

## Stripe webhook
Create a webhook endpoint in Stripe:
https://YOUR-RENDER-DOMAIN.onrender.com/api/stripe/webhook

Select event:
checkout.session.completed

The webhook is required so credits are added only after Stripe confirms the checkout.

## Packages
50 CR = €5
150 CR = €12
400 CR = €25

Generation cost:
- 1 CR per second
- AI audio: +50%
- Pro: +25%

## Important
The included first-launch store is a JSON file. It is suitable for an end-to-end test, but Render Free storage is not durable across all redeploy/restart scenarios. Before taking real customer volume, move users/credits/purchases to Supabase/Postgres and use atomic credit transactions.

Never put FAL_KEY or STRIPE_SECRET_KEY in frontend JavaScript or GitHub.
