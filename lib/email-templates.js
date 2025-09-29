// Email templates for activation and onboarding

export const activationEmailTemplate = (userName, insights, upgradeUrl) => ({
  subject: `Your Foldera briefing found ${insights.length} critical insights`,
  html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #1e293b; color: white; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <img src="https://foldera.ai/foldera-glyph.svg" alt="Foldera" style="width: 60px; height: 60px;">
        <h1 style="color: #06b6d4; margin: 20px 0;">🎯 Your First Insights</h1>
      </div>

      <div style="background: #334155; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <h2 style="color: #06b6d4;">Hi ${userName || 'there'}!</h2>
        <p>Your first briefing just analyzed your documents and found <strong>${insights.length} key insights</strong>.</p>
        <p>This is just the beginning - imagine what Foldera could find in your full document library!</p>
      </div>

      <div style="background: #065f46; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <h3 style="color: #10b981;">🚀 Upgrade to Pro - $79/month</h3>
        <p>Unlock unlimited document analysis and advanced AI features:</p>
        <ul style="color: #10b981;">
          <li>• 100 documents per month</li>
          <li>• Advanced conflict detection</li>
          <li>• Real-time insights</li>
          <li>• Priority support</li>
        </ul>
        <a href="${upgradeUrl}" style="display: inline-block; background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 15px;">Upgrade Now</a>
      </div>

      <div style="text-align: center; color: #64748b; font-size: 14px;">
        <p>Questions? Reply to this email or visit our support center.</p>
        <p>&copy; 2024 Foldera. All rights reserved.</p>
      </div>
    </div>
  `
});

export const limitReachedEmailTemplate = (userName, currentUsage, limit, upgradeUrl) => ({
  subject: `You've reached your ${limit} document limit`,
  html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #1e293b; color: white; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <img src="https://foldera.ai/foldera-glyph.svg" alt="Foldera" style="width: 60px; height: 60px;">
        <h1 style="color: #f59e0b;">📊 Usage Limit Reached</h1>
      </div>

      <div style="background: #92400e; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <h2 style="color: #f59e0b;">Hi ${userName || 'there'}!</h2>
        <p>You've reached your monthly limit of <strong>${limit} documents</strong>.</p>
        <p>You've processed <strong>${currentUsage} documents</strong> this month and gotten great value from Foldera!</p>
      </div>

      <div style="background: #065f46; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <h3 style="color: #10b981;">🚀 Ready for More?</h3>
        <p>Upgrade to Pro for unlimited document analysis:</p>
        <ul style="color: #10b981;">
          <li>• 100 documents per month</li>
          <li>• Advanced AI analysis</li>
          <li>• Real-time insights</li>
          <li>• Export capabilities</li>
        </ul>
        <a href="${upgradeUrl}" style="display: inline-block; background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 15px;">Upgrade to Pro - $79/month</a>
      </div>

      <div style="text-align: center; color: #64748b; font-size: 14px;">
        <p>Your documents are safe and available when you upgrade.</p>
        <p>&copy; 2024 Foldera. All rights reserved.</p>
      </div>
    </div>
  `
});
