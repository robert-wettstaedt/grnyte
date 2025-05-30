<script lang="ts">
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
</script>

<svelte:head>
  <title>Cookie Policy - {PUBLIC_APPLICATION_NAME}</title>
  <meta
    name="description"
    content="Cookie Policy for {PUBLIC_APPLICATION_NAME} - Learn about the cookies we use and how to manage your preferences."
  />
</svelte:head>

<div class="prose prose-invert max-w-none">
  <h1>Cookie Policy</h1>

  <p><strong>Effective Date:</strong> January 1, 2025</p>
  <p><strong>Last Updated:</strong> January 1, 2025</p>

  <h2>1. What Are Cookies?</h2>
  <p>
    Cookies are small text files that are stored on your device (computer, tablet, or mobile) when you visit a website.
    They are widely used to make websites work more efficiently and provide information to website owners.
  </p>

  <h2>2. How We Use Cookies</h2>
  <p>
    {PUBLIC_APPLICATION_NAME} uses cookies to enhance your experience and ensure the application functions properly. We prioritize
    your privacy and only use cookies that are necessary for the service to work.
  </p>

  <h2>3. Types of Cookies We Use</h2>

  <h3>3.1 Essential Cookies</h3>
  <p>These cookies are strictly necessary for the application to function and cannot be disabled.</p>

  <div class="overflow-x-auto">
    <table class="border-surface-500 min-w-full border">
      <thead>
        <tr class="bg-surface-200-800">
          <th class="border-surface-500 border px-4 py-2 text-left">Cookie Name</th>
          <th class="border-surface-500 border px-4 py-2 text-left">Purpose</th>
          <th class="border-surface-500 border px-4 py-2 text-left">Duration</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="border-surface-500 border px-4 py-2"><code>sb-*-auth-token</code></td>
          <td class="border-surface-500 border px-4 py-2">Supabase authentication and session management</td>
          <td class="border-surface-500 border px-4 py-2">Session/7 days</td>
        </tr>
      </tbody>
    </table>
  </div>

  <h3>3.2 Functionality Cookies</h3>
  <p>Currently, we do not use any additional functionality cookies beyond the essential authentication cookie above.</p>

  <h3>3.3 Analytics Cookies (Optional)</h3>
  <p>
    Currently, we do not use analytics cookies. If we implement analytics in the future, we will update this policy and
    request your consent.
  </p>

  <h3>3.4 Advertising Cookies</h3>
  <p>
    We do not use advertising cookies. {PUBLIC_APPLICATION_NAME} is a hobby project and we do not display advertisements.
  </p>

  <h2>4. Third-Party Cookies</h2>
  <p>Some cookies are set by third-party services we use:</p>

  <h3>4.1 Supabase</h3>
  <p>
    Supabase, our authentication and database provider, may set cookies for security and session management. These are
    essential for the application to function.
  </p>

  <h3>4.2 Vercel</h3>
  <p>Vercel, our hosting provider, may set cookies for performance and security purposes.</p>

  <h2>5. Managing Your Cookie Preferences</h2>

  <h3>5.1 Browser Settings</h3>
  <p>You can control cookies through your browser settings. Most browsers allow you to:</p>
  <ul>
    <li>View what cookies are stored</li>
    <li>Delete some or all cookies</li>
    <li>Block cookies from specific sites</li>
    <li>Block all cookies</li>
  </ul>

  <div class="card preset-filled-warning-500 my-4 p-4">
    <h4 class="h4 mb-2">⚠️ Important Note</h4>
    <p>
      Disabling essential cookies will prevent the application from functioning properly. You may not be able to log in
      or save your climbing data if essential cookies are blocked.
    </p>
  </div>

  <h3>5.2 Browser-Specific Instructions</h3>

  <h4>Chrome</h4>
  <ol>
    <li>Click the three dots menu → Settings</li>
    <li>Privacy and security → Cookies and other site data</li>
    <li>Choose your preferred settings</li>
  </ol>

  <h4>Firefox</h4>
  <ol>
    <li>Click the menu button → Settings</li>
    <li>Privacy & Security panel</li>
    <li>Cookies and Site Data section</li>
  </ol>

  <h4>Safari</h4>
  <ol>
    <li>Safari menu → Preferences</li>
    <li>Privacy tab</li>
    <li>Choose your cookie settings</li>
  </ol>

  <h2>6. Cookie Consent</h2>
  <p>
    By using {PUBLIC_APPLICATION_NAME}, you consent to the use of essential cookies that are necessary for the
    application to function. We will ask for your explicit consent before using any non-essential cookies.
  </p>

  <h2>7. Data Protection and GDPR</h2>
  <p>Under the General Data Protection Regulation (GDPR), you have rights regarding cookies and data processing:</p>
  <ul>
    <li>Right to be informed about cookie usage</li>
    <li>Right to consent to non-essential cookies</li>
    <li>Right to withdraw consent</li>
    <li>Right to object to cookie processing</li>
  </ul>

  <h2>8. Updates to This Policy</h2>
  <p>
    We may update this Cookie Policy from time to time to reflect changes in our practices or legal requirements. We
    will notify you of any significant changes by updating the "Last Updated" date at the top of this page.
  </p>

  <h2>9. Contact Us</h2>
  <p>If you have any questions about our use of cookies or this Cookie Policy, please contact us:</p>
  <ul>
    <li><strong>Email:</strong> info@grnyte.rocks</li>
    <li><strong>Subject:</strong> Cookie Policy Inquiry</li>
  </ul>

  <h2>10. More Information</h2>
  <p>For more information about cookies and how they work, visit:</p>
  <ul>
    <li><a href="https://www.allaboutcookies.org" target="_blank">All About Cookies</a></li>
    <li><a href="https://www.youronlinechoices.eu" target="_blank">Your Online Choices (EU)</a></li>
    <li><a href="https://ico.org.uk/for-the-public/online/cookies/" target="_blank">ICO Cookies Guidance (UK)</a></li>
  </ul>

  <hr class="my-8" />

  <p class="text-sm opacity-75">
    This Cookie Policy is designed to be transparent about our cookie usage while ensuring the application functions
    properly for all users.
  </p>
</div>
