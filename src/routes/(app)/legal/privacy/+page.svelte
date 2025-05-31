<script lang="ts">
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
</script>

<svelte:head>
  <title>Privacy Policy - {PUBLIC_APPLICATION_NAME}</title>
  <meta
    name="description"
    content="Privacy Policy for {PUBLIC_APPLICATION_NAME} - How we collect, use, and protect your climbing data."
  />
</svelte:head>

<div class="prose prose-invert max-w-none">
  <h1>Privacy Policy</h1>

  <p><strong>Effective Date:</strong> January 1, 2025</p>
  <p><strong>Last Updated:</strong> January 1, 2025</p>

  <h2>1. Introduction</h2>
  <p>
    Welcome to {PUBLIC_APPLICATION_NAME}, a secure boulder topo and session tracker. This Privacy Policy explains how we
    collect, use, store, and protect your personal information when you use our application.
  </p>
  <p>
    This is a hobby project, not a commercial service. However, we take your privacy seriously and comply with
    applicable data protection laws including the General Data Protection Regulation (GDPR) and California Consumer
    Privacy Act (CCPA).
  </p>

  <h2>2. Contact Information</h2>
  <p>
    <strong>Data Controller:</strong> grnyte Development Team<br />
    <strong>Email:</strong> info@grnyte.rocks<br />
    <strong>Contact for Privacy Matters:</strong> grnyte Development Team
  </p>

  <h2>3. Information We Collect</h2>

  <h3>3.1 Account Information</h3>
  <ul>
    <li>Email address (for account creation and authentication)</li>
    <li>Username (for identification within the app)</li>
    <li>Password (encrypted and stored securely)</li>
  </ul>

  <h3>3.2 Climbing Data</h3>
  <ul>
    <li>Climbing ascents and session logs</li>
    <li>Notes about climbing routes and areas</li>
    <li>Photos and videos you upload</li>
    <li>Location data for climbing areas (when provided by you)</li>
    <li>Route grades and difficulty ratings</li>
  </ul>

  <h3>3.3 Technical Information</h3>
  <ul>
    <li>IP address</li>
    <li>Browser type and version</li>
    <li>Device information</li>
    <li>Usage patterns and app interactions</li>
    <li>Log files and error reports</li>
  </ul>

  <h2>4. How We Use Your Information</h2>
  <ul>
    <li><strong>Service Provision:</strong> To provide and maintain the climbing tracker functionality</li>
    <li><strong>Authentication:</strong> To verify your identity and secure your account</li>
    <li><strong>Data Storage:</strong> To save your climbing progress and statistics</li>
    <li><strong>Communication:</strong> To respond to your inquiries and provide support</li>
    <li><strong>Technical Maintenance:</strong> To troubleshoot issues and improve app performance</li>
    <li><strong>Security:</strong> To protect against unauthorized access and maintain data integrity</li>
  </ul>

  <h2>5. Legal Basis for Processing (GDPR)</h2>
  <ul>
    <li>
      <strong>Consent:</strong> You have given clear consent for us to process your personal data for the specified purposes
    </li>
    <li>
      <strong>Legitimate Interest:</strong> Processing is necessary for our legitimate interests in providing the service
    </li>
    <li><strong>Contract Performance:</strong> Processing is necessary to provide the services you've requested</li>
  </ul>

  <h2>6. Data Sharing and Third Parties</h2>

  <h3>6.1 Service Providers</h3>
  <p>We use the following third-party services:</p>
  <ul>
    <li>
      <strong>Supabase:</strong> Database hosting and authentication (see
      <a href="https://supabase.com/privacy" target="_blank">Supabase Privacy Policy</a>)
    </li>
    <li><strong>Nextcloud:</strong> File storage for photos and videos (if configured)</li>
    <li><strong>Vercel:</strong> Application hosting and delivery</li>
  </ul>

  <h3>6.2 External Integrations</h3>
  <p>The app may link to external climbing platforms:</p>
  <ul>
    <li>8a.nu</li>
    <li>27crags</li>
    <li>theCrag</li>
  </ul>
  <p>
    These links are provided for convenience. We do not share your data with these platforms unless you explicitly
    choose to do so.
  </p>

  <h3>6.3 No Sale of Data</h3>
  <p>We do not sell, rent, or trade your personal information to third parties for marketing purposes.</p>

  <h2>7. Data Storage and Security</h2>
  <ul>
    <li><strong>Encryption:</strong> All data is transmitted using HTTPS encryption</li>
    <li><strong>Access Controls:</strong> Only authorized users can access your personal climbing data</li>
    <li><strong>Database Security:</strong> Supabase provides enterprise-grade security for data storage</li>
    <li><strong>Regular Backups:</strong> Data is regularly backed up to prevent loss</li>
  </ul>

  <h2>8. Data Retention</h2>
  <p>
    We retain your personal data for as long as your account is active or as needed to provide services. You can request
    deletion of your account and all associated data at any time.
  </p>
  <ul>
    <li><strong>Account Data:</strong> Retained until account deletion</li>
    <li><strong>Climbing Logs:</strong> Retained until account deletion</li>
    <li><strong>Log Files:</strong> Automatically deleted after 30 days</li>
  </ul>

  <h2>9. Your Rights</h2>
  <p>Under GDPR and other privacy laws, you have the following rights:</p>

  <h3>9.1 Access (Article 15 GDPR)</h3>
  <p>Request a copy of all personal data we hold about you.</p>

  <h3>9.2 Rectification (Article 16 GDPR)</h3>
  <p>Request correction of inaccurate or incomplete data.</p>

  <h3>9.3 Erasure (Article 17 GDPR)</h3>
  <p>Request deletion of your personal data ("right to be forgotten").</p>

  <h3>9.4 Portability (Article 20 GDPR)</h3>
  <p>Request a copy of your data in a machine-readable format.</p>

  <h3>9.5 Objection (Article 21 GDPR)</h3>
  <p>Object to processing based on legitimate interests.</p>

  <h3>9.6 California Rights (CCPA)</h3>
  <p>
    California residents have additional rights under the CCPA, including the right to opt-out of the sale of personal
    information (though we don't sell data).
  </p>

  <h2>10. Cookies and Tracking</h2>
  <p>
    We use essential cookies for authentication and app functionality. We do not use tracking cookies for advertising or
    analytics without your consent. See our <a href="/legal/cookies">Cookie Policy</a> for more details.
  </p>

  <h2>11. International Data Transfers</h2>
  <p>
    Your data may be transferred to and processed in countries outside your residence, including the United States. We
    ensure appropriate safeguards are in place for international transfers as required by applicable data protection
    laws.
  </p>

  <h2>12. Children's Privacy</h2>
  <p>
    This service is not intended for children under 16 years of age. We do not knowingly collect personal information
    from children under 16. If you believe we have collected information from a child under 16, please contact us
    immediately.
  </p>

  <h2>13. Changes to This Policy</h2>
  <p>
    We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the new
    Privacy Policy on this page and updating the "Last Updated" date.
  </p>

  <h2>14. Contact Us</h2>
  <p>If you have any questions about this Privacy Policy or wish to exercise your rights, please contact us:</p>
  <ul>
    <li><strong>Email:</strong> info@grnyte.rocks</li>
    <li><strong>Subject:</strong> Privacy Policy Inquiry</li>
  </ul>

  <h2>15. Supervisory Authority</h2>
  <p>
    If you believe we have not addressed your privacy concerns adequately, you have the right to lodge a complaint with
    your local data protection supervisory authority.
  </p>

  <hr class="my-8" />

  <p class="text-sm opacity-75">
    This Privacy Policy is part of our commitment to transparency and data protection. As a hobby project, we strive to
    maintain the highest standards of privacy and security for our users.
  </p>
</div>
