# Foldera Billing System Setup Guide

## Overview
This guide walks you through setting up the complete billing and subscription system for Foldera.

## Prerequisites
- Stripe account (https://stripe.com)
- Supabase project set up
- Node.js and npm installed

## Step 1: Stripe Configuration

### 1.1 Create Stripe Account
1. Sign up at https://stripe.com
2. Complete account verification
3. Switch to **Test Mode** for development

### 1.2 Create Products and Prices
1. Go to **Products** in Stripe Dashboard
2. Create two products:

**Pro Plan:**
- Name: "Foldera Pro"
- Price: $29/month
- Billing period: Monthly
- Copy the Price ID (starts with `price_`)

**Team Plan:**
- Name: "Foldera Team"
- Price: $99/month
- Billing period: Monthly
- Copy the Price ID (starts with `price_`)

### 1.3 Get API Keys
1. Go to **Developers** > **API keys**
2. Copy:
   - Publishable key (pk_test_...)
   - Secret key (sk_test_...)

### 1.4 Set up Webhook
1. Go to **Developers** > **Webhooks**
2. Click **Add endpoint**
3. Enter your webhook URL: `https://your-domain.com/api/billing/webhook`
4. Select events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Copy the **Signing secret** (whsec_...)

## Step 2: Environment Variables

Add these to your `.env.local` file:

```env
# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_STRIPE_PRO_PRICE_ID=price_...
NEXT_PUBLIC_STRIPE_TEAM_PRICE_ID=price_...

# Application
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

## Step 3: Database Migration

Run the billing system migration:

```bash
# If using Supabase CLI
supabase db push

# Or run the SQL file manually in Supabase Dashboard
# File: supabase/migrations/20250130000000_billing_system.sql
```

This creates:
- `subscriptions` table
- `usage_tracking` table
- `referrals` table
- Indexes and RLS policies

## Step 4: Test the System

### 4.1 Test Checkout Flow
1. Navigate to `/pricing`
2. Click "Start Free Trial" on Pro or Team plan
3. Use Stripe test card: `4242 4242 4242 4242`
4. Any future date and any 3-digit CVC
5. Complete checkout

### 4.2 Test Webhook
1. Install Stripe CLI: https://stripe.com/docs/stripe-cli
2. Run: `stripe listen --forward-to localhost:3000/api/billing/webhook`
3. Complete a test checkout
4. Verify webhook events are received

### 4.3 Test Usage Limits
1. As a free user, process 3 documents
2. Try to process a 4th - should see upgrade prompt
3. Upgrade to Pro
4. Verify you can now process more documents

## Step 5: Billing Portal

The billing portal allows users to:
- Update payment methods
- View invoices
- Cancel subscriptions
- Update billing information

Access via: POST to `/api/billing/portal` with user ID

## API Endpoints

### Create Checkout Session
```
POST /api/billing/create-checkout
Body: { userId, email, planName }
Returns: { sessionId, url }
```

### Webhook Handler
```
POST /api/billing/webhook
Headers: stripe-signature
Body: Stripe event
```

### Billing Portal
```
POST /api/billing/portal
Body: { userId }
Returns: { url }
```

### Get Usage
```
GET /api/billing/usage?userId={userId}
Returns: { usage, message, warningLevel }
```

## Testing Cards

Use these Stripe test cards:

- **Success**: 4242 4242 4242 4242
- **Decline**: 4000 0000 0000 0002
- **Requires authentication**: 4000 0025 0000 3155

## Going Live

### 1. Switch to Production Mode
1. Toggle Stripe Dashboard to **Live Mode**
2. Create production products and prices
3. Get production API keys
4. Update environment variables

### 2. Update Webhook
1. Create production webhook endpoint
2. Update webhook URL to production domain
3. Update STRIPE_WEBHOOK_SECRET

### 3. Compliance
- Add Terms of Service
- Add Privacy Policy
- Add Refund Policy
- Consider PCI compliance requirements

## Monitoring

### Key Metrics to Track
1. **Conversion Rate**: Free → Paid
2. **Churn Rate**: Cancellations per month
3. **MRR (Monthly Recurring Revenue)**
4. **ARPU (Average Revenue Per User)**

### Stripe Dashboard
- Monitor in real-time at https://dashboard.stripe.com
- Set up email notifications for failed payments
- Review subscription metrics weekly

## Troubleshooting

### Webhook Not Working
- Verify webhook URL is publicly accessible
- Check webhook signing secret matches
- Use Stripe CLI for local testing

### Checkout Not Redirecting
- Verify success_url and cancel_url are correct
- Check NEXT_PUBLIC_BASE_URL is set correctly

### Usage Limits Not Enforcing
- Verify database migration ran successfully
- Check usage_tracking table exists
- Verify RLS policies are enabled

## Support

For issues:
1. Check Stripe logs in Dashboard
2. Check application logs
3. Verify environment variables are set
4. Test in Stripe Test Mode first

## Next Steps

After billing is working:
1. Implement email notifications (welcome, upgrade, failed payment)
2. Add usage analytics dashboard
3. Build referral system
4. Create enterprise sales pipeline
5. Optimize pricing based on data
