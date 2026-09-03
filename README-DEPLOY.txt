DILSHOD AI VIDEO 4.0 — DEPLOY

1. Replace the files in GitHub with this package.
2. Render should run: npm install -> npm start.
3. Add Environment variables:
FAL_KEY = existing fal key
STRIPE_SECRET_KEY = your Stripe secret key
STRIPE_WEBHOOK_SECRET = Stripe webhook signing secret
SESSION_SECRET = long random secret
PUBLIC_URL = https://dilshod-ai-video0.onrender.com
SITE_USER = your private owner login
SITE_PASSWORD = your private owner password
ADMIN_EMAIL = your email used for the owner account
4. Stripe webhook URL:
https://dilshod-ai-video0.onrender.com/api/stripe/webhook
Event: checkout.session.completed
5. Save, rebuild and deploy.
6. Register a normal customer account to test. It starts with 0 CR.
7. Buy a package. Stripe payment must complete and the webhook must arrive before credits are added.
8. Open /admin with your owner account to see users, credits, payments and generations.

WARNING: data.json is not persistent on Render Free. Use persistent Postgres/Supabase before accepting serious customer volume.
