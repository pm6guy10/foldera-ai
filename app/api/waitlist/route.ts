import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

// Lazy initialization functions to avoid build-time errors
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );
}

function getResend() {
  return new Resend(process.env.RESEND_API_KEY || 'dummy-key-for-build');
}

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Early bird limit
const EARLY_BIRD_LIMIT = 100;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, name } = body;
    
    const supabase = getSupabase();
    const resend = getResend();

    // Validate email
    if (!email || !EMAIL_REGEX.test(email)) {
      return NextResponse.json(
        { error: 'Need a real email address' },
        { status: 400 }
      );
    }

    // Check for duplicate
    const { data: existing } = await supabase
      .from('waitlist')
      .select('email, early_bird_pricing, committed_price')
      .eq('email', email.toLowerCase())
      .single();

    if (existing) {
      // Return their existing pricing info
      return NextResponse.json(
        { 
          error: "You're already on the list",
          pricing: {
            amount: existing.committed_price || 47,
            locked: true,
            earlyBird: existing.early_bird_pricing,
            message: existing.early_bird_pricing 
              ? "Locked in at $47/mo forever" 
              : "Locked in at $97/mo"
          }
        },
        { status: 409 }
      );
    }

    // Get current waitlist count to determine early bird eligibility
    const { count: currentCount } = await supabase
      .from('waitlist')
      .select('*', { count: 'exact', head: true });

    const position = (currentCount || 0) + 1;
    const isEarlyBird = position <= EARLY_BIRD_LIMIT;
    const committedPrice = isEarlyBird ? 47.00 : 97.00;

    // Insert into waitlist
    const { data: newEntry, error: insertError } = await supabase
      .from('waitlist')
      .insert([
        {
          email: email.toLowerCase(),
          name: name || null,
          early_bird_pricing: isEarlyBird,
          tier: 'professional',
          committed_price: committedPrice,
          pricing_locked_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (insertError) {
      console.error('Supabase insert error:', insertError);
      return NextResponse.json(
        { error: 'Something broke. Try again?' },
        { status: 500 }
      );
    }

    // Send confirmation email
    try {
      const emailSubject = isEarlyBird 
        ? "You're locked in at $47/mo (forever)"
        : "You're on the waitlist";

      const emailHtml = isEarlyBird ? `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <p style="font-size: 16px; line-height: 1.6; color: #333; margin-bottom: 20px;">
            Hey${name ? ' ' + name : ''},
          </p>
          
          <p style="font-size: 16px; line-height: 1.6; color: #333; margin-bottom: 20px;">
            You're in. And you just locked in something valuable.
          </p>
          
          <p style="font-size: 16px; line-height: 1.6; color: #333; margin-bottom: 20px;">
            You're getting the AI chief of staff that makes you look like a genius in every meeting — for <strong style="color: #10b981;">$47/mo forever</strong>.
          </p>
          
          <p style="font-size: 16px; line-height: 1.6; color: #666; margin-bottom: 30px;">
            (Regular price after first 100: $97/mo)
          </p>
          
          <div style="background: #f9fafb; border-left: 4px solid #10b981; padding: 20px; margin: 30px 0;">
            <p style="font-size: 16px; font-weight: 600; color: #333; margin-bottom: 15px;">
              Here's what you secured:
            </p>
            <ul style="list-style: none; padding: 0; margin: 0;">
              <li style="padding: 8px 0; color: #333;">✓ $47/mo for life (never increases)</li>
              <li style="padding: 8px 0; color: #333;">✓ Unlimited meeting briefs</li>
              <li style="padding: 8px 0; color: #333;">✓ Full access to all features</li>
              <li style="padding: 8px 0; color: #333;">✓ Priority support as an early believer</li>
            </ul>
          </div>
          
          <p style="font-size: 16px; line-height: 1.6; color: #333; margin-bottom: 20px;">
            You're number <strong>${position}</strong> in line. We're launching in 2-3 weeks.
          </p>
          
          <p style="font-size: 16px; line-height: 1.6; color: #333; margin-bottom: 20px;">
            We'll email you the moment you can start looking brilliant in meetings.
          </p>
          
          <p style="font-size: 16px; line-height: 1.6; color: #333; margin-top: 40px; margin-bottom: 10px;">
            PS - This price is locked for you. Even if we charge $200/mo later, you stay at $47. Forever.
          </p>
          
          <p style="font-size: 16px; line-height: 1.6; color: #333; margin-top: 40px;">
            - Brandon
          </p>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 40px 0;" />
          
          <p style="font-size: 14px; line-height: 1.6; color: #666;">
            Questions? Just reply to this email.<br />
            Your early-bird pricing is locked. We'll never raise it on you.
          </p>
        </div>
      ` : `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <p style="font-size: 16px; line-height: 1.6; color: #333; margin-bottom: 20px;">
            Hey${name ? ' ' + name : ''},
          </p>
          
          <p style="font-size: 16px; line-height: 1.6; color: #333; margin-bottom: 20px;">
            You're in. We're building the AI chief of staff that makes you look like a genius in every meeting.
          </p>
          
          <p style="font-size: 16px; line-height: 1.6; color: #333; margin-bottom: 20px;">
            Your price: <strong>$97/mo</strong> (locked in for life). You're number <strong>${position}</strong> in line.
          </p>
          
          <p style="font-size: 16px; line-height: 1.6; color: #333; margin-bottom: 20px;">
            We'll email you when it's ready to test (next 2-3 weeks).
          </p>
          
          <p style="font-size: 16px; line-height: 1.6; color: #333; margin-top: 40px;">
            - Brandon
          </p>
        </div>
      `;

      const emailText = isEarlyBird ? `Hey${name ? ' ' + name : ''},

You're in. And you just locked in something valuable.

You're getting the AI chief of staff that makes you look like a genius in every meeting — for $47/mo forever.

(Regular price after first 100: $97/mo)

Here's what you secured:
✓ $47/mo for life (never increases)
✓ Unlimited meeting briefs
✓ Full access to all features
✓ Priority support as an early believer

You're number ${position} in line. We're launching in 2-3 weeks.

We'll email you the moment you can start looking brilliant in meetings.

PS - This price is locked for you. Even if we charge $200/mo later, you stay at $47. Forever.

- Brandon

---
Questions? Just reply to this email.
Your early-bird pricing is locked. We'll never raise it on you.` : `Hey${name ? ' ' + name : ''},

You're in. We're building the AI chief of staff that makes you look like a genius in every meeting.

Your price: $97/mo (locked in for life). You're number ${position} in line.

We'll email you when it's ready to test (next 2-3 weeks).

- Brandon`;

      await resend.emails.send({
        from: 'Context <onboarding@context.app>',
        to: email,
        subject: emailSubject,
        html: emailHtml,
        text: emailText,
      });
    } catch (emailError) {
      console.error('Resend email error:', emailError);
      // Don't fail the request if email fails
    }

    return NextResponse.json({
      success: true,
      email: email,
      position,
      pricing: {
        amount: committedPrice,
        locked: true,
        earlyBird: isEarlyBird,
        message: isEarlyBird ? "Locked in at $47/mo forever" : "Locked in at $97/mo"
      },
      message: "You're on the list!",
    });
  } catch (error) {
    console.error('Waitlist API error:', error);
    return NextResponse.json(
      { error: 'Something broke. Try again?' },
      { status: 500 }
    );
  }
}


