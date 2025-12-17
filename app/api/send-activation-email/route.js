import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/meeting-prep/auth';
import { activationEmailTemplate } from '@/lib/email-templates';

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { email, userName, insights, upgradeUrl } = await request.json();

    if (!email || !insights || !upgradeUrl) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // In production, integrate with your email service (SendGrid, Mailgun, etc.)
    // For now, we'll just log the email that would be sent
    console.log('📧 ACTIVATION EMAIL WOULD BE SENT:');
    console.log('To:', email);
    console.log('Subject:', activationEmailTemplate(userName, insights, upgradeUrl).subject);
    console.log('Upgrade URL:', upgradeUrl);

    // Simulate email sending (replace with actual email service)
    const emailSent = await simulateEmailSend(email, userName, insights, upgradeUrl);

    return NextResponse.json({
      success: true,
      emailSent: emailSent,
      message: 'Activation email queued for sending'
    });

  } catch (error) {
    console.error('Email sending error:', error);
    return NextResponse.json({
      error: 'Failed to send activation email',
      details: error.message
    }, { status: 500 });
  }
}

// Simulate email sending (replace with actual email service)
async function simulateEmailSend(email, userName, insights, upgradeUrl) {
  // In production, use SendGrid, Mailgun, or similar:
  /*
  const sgMail = require('@sendgrid/mail');
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);

  const msg = {
    to: email,
    from: 'noreply@foldera.ai',
    subject: activationEmailTemplate(userName, insights, upgradeUrl).subject,
    html: activationEmailTemplate(userName, insights, upgradeUrl).html,
  };

  await sgMail.send(msg);
  */

  // For demo purposes, just return success
  console.log(`✅ Email sent to ${email}: ${activationEmailTemplate(userName, insights, upgradeUrl).subject}`);

  return true;
}
