const dataStore = require('./dataStore');

// In-memory or file-backed simulated email inbox for dev/testing
const emailInbox = [];

const emailService = {
  async sendEmail({ to, subject, html, text, type, metadata = {} }) {
    const emailEntry = {
      id: `mail-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      to,
      subject,
      html: html || `<p>${text}</p>`,
      text: text || '',
      type: type || 'general',
      metadata,
      sent_at: new Date().toISOString()
    };

    emailInbox.unshift(emailEntry);
    if (emailInbox.length > 50) emailInbox.pop();

    console.log(`\n================= [EMAIL NOTIFICATION] =================`);
    console.log(`TO: ${to}`);
    console.log(`SUBJECT: ${subject}`);
    console.log(`CONTENT: ${text || html}`);
    console.log(`========================================================\n`);

    return { success: true, emailId: emailEntry.id };
  },

  async sendTemporaryPassword(user, tempPassword, reason = 'Account Creation') {
    const subject = `Connect - Your Temporary Credentials (${reason})`;
    const isEmployeeNumberUser = user.role !== 'admin';
    const loginIdentifier = isEmployeeNumberUser 
      ? `Employee Number: <strong>${user.employee_number}</strong>` 
      : `Email: <strong>${user.email}</strong>`;

    const text = `Hello ${user.full_name},\n\nYour account has been created/reset for Connect (Store: Particles Electronics).\n\nLogin Identifier: ${isEmployeeNumberUser ? user.employee_number : user.email}\nTemporary Password: ${tempPassword}\n\nPlease note: You will be forced to change this temporary password on your first login.\n`;
    
    const html = `
      <div style="font-family: sans-serif; background-color: #121826; color: #f1f5f9; padding: 24px; border-radius: 8px;">
        <h2 style="color: #38bdf8;">Connect - Retail Management</h2>
        <p>Hello <strong>${user.full_name}</strong>,</p>
        <p>Your account credentials for <strong>Connect</strong> are:</p>
        <div style="background-color: #1e293b; padding: 16px; border-radius: 6px; border-left: 4px solid #38bdf8;">
          <p style="margin: 4px 0;">Role: <strong>${user.role.toUpperCase()}</strong></p>
          <p style="margin: 4px 0;">${loginIdentifier}</p>
          <p style="margin: 4px 0;">Temporary Password: <code style="font-size: 16px; color: #f43f5e; font-weight: bold;">${tempPassword}</code></p>
        </div>
        <p style="margin-top: 16px; color: #fbbf24;">⚠️ You will be required to set a permanent password immediately upon logging in.</p>
      </div>
    `;

    return this.sendEmail({ to: user.email, subject, text, html, type: 'credentials', metadata: { userId: user.user_id } });
  },

  getRecentEmails() {
    return emailInbox;
  }
};

module.exports = emailService;
