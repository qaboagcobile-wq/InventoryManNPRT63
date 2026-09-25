const dataStore = require('./dataStore');
let nodemailer;
try {
  nodemailer = require('nodemailer');
} catch (_) {}

// Create SMTP transporter if configured in environment
let transporter = null;
if (process.env.SMTP_HOST && nodemailer) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

const emailService = {
  async sendEmail({ to, subject, html, text, type, recipientUserId, recipientRole, metadata = {} }) {
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const now = new Date().toISOString();

    const inboxEntry = {
      id: messageId,
      recipient_user_id: recipientUserId || null,
      recipient_email: (to || '').toLowerCase(),
      recipient_role: recipientRole || null,
      subject,
      html: html || `<p>${text}</p>`,
      text: text || '',
      type: type || 'general',
      read: false,
      metadata,
      created_at: now
    };

    // Store securely in persistent database-free inbox collection
    try {
      const messages = await dataStore.read('inbox_messages');
      messages.unshift(inboxEntry);
      // Keep up to 200 messages
      if (messages.length > 200) messages.pop();
      await dataStore.write('inbox_messages', messages);
    } catch (err) {
      console.error('[Inbox Error]', err);
    }

    // Also attempt real email delivery via SMTP if configured
    if (transporter && to) {
      try {
        await transporter.sendMail({
          from: process.env.SMTP_FROM || '"Connect Platform" <no-reply@connect-retail.com>',
          to,
          subject,
          text,
          html
        });
        console.log(`[Email Dispatched via SMTP] to: ${to}`);
      } catch (err) {
        console.warn(`[SMTP Warning] Failed to send email to ${to}:`, err.message);
      }
    } else {
      console.log(`[Notification Queued] To: ${to} | Subject: ${subject}`);
    }

    return { success: true, messageId };
  },

  async sendTemporaryPassword(user, tempPassword, reason = 'Account Creation') {
    const subject = `Connect - Your Credentials (${reason})`;
    const isEmployeeNumberUser = user.role !== 'admin';
    const loginIdentifier = isEmployeeNumberUser 
      ? `Employee Number: <strong>${user.employee_number}</strong>` 
      : `Email: <strong>${user.email}</strong>`;

    const text = `Hello ${user.full_name},\n\nYour account credentials for Connect have been created/updated (${reason}).\n\nLogin Identifier: ${isEmployeeNumberUser ? user.employee_number : user.email}\nTemporary Password: ${tempPassword}\n\nPlease note: You will be required to set a new password on your first login.\n`;
    
    const html = `
      <div style="font-family: sans-serif; background-color: #121826; color: #f1f5f9; padding: 24px; border-radius: 8px;">
        <h2 style="color: #38bdf8;">Connect - Retail Management</h2>
        <p>Hello <strong>${user.full_name}</strong>,</p>
        <p>Your account credentials for <strong>Connect</strong> are:</p>
        <div style="background-color: #1e293b; padding: 16px; border-radius: 6px; border-left: 4px solid #38bdf8;">
          <p style="margin: 4px 0;">Role: <strong>${user.role.toUpperCase()}</strong></p>
          <p style="margin: 4px 0;">${loginIdentifier}</p>
          <p style="margin: 4px 0;">Temporary Password: <code style="font-size: 16px; color: #38bdf8; font-weight: bold;">${tempPassword}</code></p>
        </div>
        <p style="margin-top: 16px; color: #fbbf24;">⚠️ You will be required to set a permanent password immediately upon logging in.</p>
      </div>
    `;

    return this.sendEmail({
      to: user.email,
      subject,
      text,
      html,
      type: 'credentials',
      recipientUserId: user.user_id,
      recipientRole: user.role,
      metadata: { userId: user.user_id, employeeNumber: user.employee_number }
    });
  },

  async getUserMessages(user) {
    const messages = await dataStore.read('inbox_messages');
    if (!user) return [];

    // User-scoped filtering: ONLY return messages addressed to this specific user
    return messages.filter(m => {
      if (m.recipient_user_id && m.recipient_user_id === user.user_id) return true;
      if (m.recipient_email && m.recipient_email === (user.email || '').toLowerCase()) return true;
      return false;
    });
  },

  async markAsRead(messageId, userId) {
    const messages = await dataStore.read('inbox_messages');
    const msg = messages.find(m => m.id === messageId && (m.recipient_user_id === userId || !m.recipient_user_id));
    if (msg) {
      msg.read = true;
      await dataStore.write('inbox_messages', messages);
    }
  }
};

module.exports = emailService;
