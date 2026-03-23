# Resend DNS Setup for foldera.ai

Sending domain: `foldera.ai`
From address: `Foldera <brief@foldera.ai>`

## Required DNS Records

Add these records at your domain registrar (wherever foldera.ai DNS is managed).

### 1. DKIM (Resend verification)

After adding the domain in the Resend dashboard (https://resend.com/domains), Resend will provide specific DKIM CNAME records. They typically look like:

| Type  | Name                              | Value                                          |
|-------|-----------------------------------|-------------------------------------------------|
| CNAME | `resend._domainkey.foldera.ai`    | (provided by Resend dashboard after domain add) |

There may be up to 3 CNAME records for DKIM. Copy the exact values from Resend.

### 2. SPF

Add Resend's sending servers to your SPF record. If you already have an SPF record, add `include:amazonses.com` to it.

| Type | Name         | Value                                              |
|------|--------------|----------------------------------------------------|
| TXT  | `foldera.ai` | `v=spf1 include:amazonses.com ~all`                |

If you already have an SPF record (e.g., for Google Workspace), merge them:
```
v=spf1 include:_spf.google.com include:amazonses.com ~all
```

### 3. DMARC

| Type | Name                 | Value                                           |
|------|----------------------|-------------------------------------------------|
| TXT  | `_dmarc.foldera.ai`  | `v=DMARC1; p=none; rua=mailto:dmarc@foldera.ai` |

Start with `p=none` (monitor only). After confirming deliverability, tighten to `p=quarantine` or `p=reject`.

### 4. Return-Path / Bounce Domain (optional but recommended)

| Type  | Name                    | Value                              |
|-------|-------------------------|------------------------------------|
| CNAME | `bounces.foldera.ai`    | (provided by Resend dashboard)     |

## Setup Steps

1. Go to https://resend.com/domains
2. Click "Add Domain" and enter `foldera.ai`
3. Resend will show the exact DNS records to add (DKIM CNAMEs + verification TXT)
4. Add all records at your registrar
5. Click "Verify" in Resend dashboard
6. Once verified, update these env vars in Vercel:
   - `RESEND_FROM_EMAIL` = `Foldera <brief@foldera.ai>`
7. Send a test email and check headers for `dkim=pass`, `spf=pass`, `dmarc=pass`

## Current Status

- [ ] Domain added in Resend dashboard
- [ ] DKIM records added
- [ ] SPF record added
- [ ] DMARC record added
- [ ] Domain verified in Resend
- [ ] `RESEND_FROM_EMAIL` updated in Vercel production env
- [ ] Test email lands in inbox (not spam)
