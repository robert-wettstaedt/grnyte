<script lang="ts">
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
</script>

<svelte:head>
  <title>Terms of Service - {PUBLIC_APPLICATION_NAME}</title>
  <meta
    name="description"
    content="Terms of Service for {PUBLIC_APPLICATION_NAME} - Rules and guidelines for using our climbing tracker application."
  />
</svelte:head>

<div class="prose prose-invert max-w-none">
  <h1>Terms of Service</h1>

  <p><strong>Effective Date:</strong> January 1, 2025</p>
  <p><strong>Last Updated:</strong> January 1, 2025</p>

  <h2>1. Acceptance of Terms</h2>
  <p>
    By accessing and using {PUBLIC_APPLICATION_NAME} ("the Application", "the Service"), you accept and agree to be bound
    by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.
  </p>

  <p>
    <strong>Registration Acceptance:</strong> When creating an account, you must explicitly agree to these Terms of Service
    and our Privacy Policy by checking the required acceptance checkbox. This constitutes your electronic signature and agreement
    to be bound by these terms.
  </p>

  <h2>2. Description of Service</h2>
  <p>
    {PUBLIC_APPLICATION_NAME} is a secure boulder topo and session tracker designed to help climbers:
  </p>
  <ul>
    <li>Create and manage bouldering areas, crags, and routes</li>
    <li>Log climbing ascents and track progress</li>
    <li>Store photos and videos of climbing areas</li>
    <li>Share climbing information with authorized users</li>
    <li>Create detailed topos of bouldering areas</li>
  </ul>
  <p>This is a hobby project provided free of charge with no commercial intent.</p>

  <h2>3. User Registration and Account</h2>
  <p>To use the Application, you must:</p>
  <ul>
    <li>Be at least 16 years of age</li>
    <li>Provide accurate and complete registration information</li>
    <li>Maintain the security of your account credentials</li>
    <li>Accept responsibility for all activities under your account</li>
    <li>Promptly notify us of any unauthorized use</li>
  </ul>

  <p><strong>Account Sharing:</strong> Your account is personal and non-transferable. You may not:</p>
  <ul>
    <li>Share your login credentials with others</li>
    <li>Allow others to access the Application using your account</li>
    <li>Create accounts on behalf of other individuals</li>
    <li>Use multiple accounts to circumvent regional access controls</li>
  </ul>
  <p>
    Each user must maintain their own individual account. Violation of this policy may result in account suspension or
    termination.
  </p>

  <h2>4. Acceptable Use</h2>

  <h3>4.1 Permitted Uses</h3>
  <p>You may use the Application to:</p>
  <ul>
    <li>Track your personal climbing activities</li>
    <li>Share climbing information with other authorized users</li>
    <li>Create topos and route descriptions</li>
    <li>Upload photos and videos related to climbing</li>
  </ul>

  <h3>4.2 Prohibited Uses</h3>
  <p>You agree NOT to use the Application to:</p>
  <ul>
    <li>Upload false, misleading, or inappropriate content</li>
    <li>Violate any local, state, or international laws</li>
    <li>Infringe on intellectual property rights</li>
    <li>Attempt to hack, disrupt, or damage the Application</li>
    <li>Share other users' data without permission</li>
    <li>Use the service for commercial purposes without permission</li>
    <li>Upload malicious code or files</li>
    <li>Impersonate other users or entities</li>
  </ul>

  <h2>5. Content and Intellectual Property</h2>

  <h3>5.1 Your Content</h3>
  <p>
    You retain ownership of all content you upload, including photos, videos, route descriptions, and climbing logs. By
    uploading content, you grant us a non-exclusive license to store, display, and share your content within the
    Application as necessary to provide the service.
  </p>

  <h3>5.2 Application Content</h3>
  <p>
    The Application's code, design, and functionality are protected by copyright and other intellectual property laws.
    You may not copy, modify, or redistribute the Application without permission.
  </p>

  <h3>5.3 Third-Party Content</h3>
  <p>
    You are responsible for ensuring you have the right to upload any content that includes third-party intellectual
    property, including photos of climbing areas that may be on private land.
  </p>

  <h2>6. Privacy and Data Protection</h2>
  <p>
    Your privacy is important to us. Please review our <a href="/privacy">Privacy Policy</a> to understand how we collect,
    use, and protect your personal information.
  </p>

  <h2>7. Climbing Safety Disclaimer</h2>

  <div class="card preset-filled-warning-500 my-4 p-4">
    <h4 class="h4 mb-2">⚠️ Important Safety Notice</h4>
    <p>
      <strong>Climbing is inherently dangerous and can result in serious injury or death.</strong> The information provided
      in this Application is for reference only and should not be your sole source of climbing information.
    </p>
  </div>

  <p>You acknowledge that:</p>
  <ul>
    <li>Route grades and descriptions may be inaccurate or outdated</li>
    <li>Rock conditions can change and become dangerous</li>
    <li>Access to climbing areas may be restricted or prohibited</li>
    <li>You climb at your own risk and are responsible for your safety</li>
    <li>You should verify all information independently</li>
    <li>You should respect local access restrictions and private property</li>
  </ul>

  <h2>8. Disclaimer of Warranties</h2>
  <p>
    The Application is provided "AS IS" and "AS AVAILABLE" without any warranties of any kind, either express or
    implied, including but not limited to:
  </p>
  <ul>
    <li>Merchantability or fitness for a particular purpose</li>
    <li>Accuracy or completeness of information</li>
    <li>Uninterrupted or error-free service</li>
    <li>Security of data transmission or storage</li>
  </ul>

  <h2>9. Limitation of Liability</h2>
  <p>
    <strong
      >To the maximum extent permitted by law, we shall not be liable for any direct, indirect, incidental,
      consequential, or punitive damages</strong
    > arising out of or relating to:
  </p>
  <ul>
    <li>Your use of the Application</li>
    <li>Any climbing activities or decisions based on information from the Application</li>
    <li>Loss of data or service interruptions</li>
    <li>Errors or inaccuracies in route information</li>
    <li>Unauthorized access to your account or data</li>
  </ul>

  <h2>10. Indemnification</h2>
  <p>
    You agree to indemnify and hold harmless the Application owner/operator from any claims, damages, or expenses
    arising from:
  </p>
  <ul>
    <li>Your use of the Application</li>
    <li>Your violation of these Terms</li>
    <li>Your infringement of any third-party rights</li>
    <li>Content you upload or share</li>
  </ul>

  <h2>11. Account Termination</h2>
  <p>We reserve the right to suspend or terminate your account if you:</p>
  <ul>
    <li>Violate these Terms of Service</li>
    <li>Engage in abusive or harmful behavior</li>
    <li>Upload inappropriate or illegal content</li>
    <li>Attempt to compromise the security of the Application</li>
  </ul>
  <p>You may delete your account at any time through the Application settings.</p>

  <h2>12. Data Retention and Deletion</h2>
  <p>
    Upon account deletion, we will remove your personal data in accordance with our Privacy Policy. Some information may
    be retained for legal or technical reasons as described in our Privacy Policy.
  </p>

  <h2>13. Service Availability</h2>
  <p>As a hobby project, we cannot guarantee:</p>
  <ul>
    <li>Continuous availability of the service</li>
    <li>Regular updates or maintenance</li>
    <li>Technical support response times</li>
    <li>Long-term availability of the service</li>
  </ul>

  <h2>14. Changes to Terms</h2>
  <p>
    We may update these Terms of Service from time to time. We will notify users of significant changes by updating the
    "Last Updated" date and posting a notice in the Application. Continued use of the Application after changes
    constitutes acceptance of the new terms.
  </p>

  <h2>15. Governing Law</h2>
  <p>
    These Terms shall be governed by and construed in accordance with the laws of [Your Jurisdiction]. Any disputes
    shall be resolved in the courts of [Your Jurisdiction].
  </p>

  <h2>16. Severability</h2>
  <p>
    If any provision of these Terms is found to be unenforceable, the remaining provisions shall remain in full force
    and effect.
  </p>

  <h2>17. Contact Information</h2>
  <p>If you have questions about these Terms of Service, please contact us:</p>
  <ul>
    <li><strong>Email:</strong> info@grnyte.rocks</li>
    <li><strong>Subject:</strong> Terms of Service Inquiry</li>
  </ul>

  <hr class="my-8" />

  <p class="text-sm opacity-75">
    These Terms of Service are designed to protect both users and the Application while acknowledging the inherent risks
    of climbing activities. By using the Application, you acknowledge that you understand and accept these terms.
  </p>
</div>
