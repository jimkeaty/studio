import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — Keaty Real Estate | Keaty Real Estate',
  description: 'Privacy Policy for the Keaty Real Estate platform operated by Keaty Real Estate.',
};

const EFFECTIVE_DATE = 'July 1, 2025';
const COMPANY_NAME = 'Keaty Real Estate';
const PLATFORM_NAME = 'Keaty Real Estate';
const CONTACT_EMAIL = 'admin@keatyrealestate.com';
const COMPANY_ADDRESS = 'Lafayette, Louisiana, United States';

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-[#f5f7fa] dark:bg-[#0f172a] text-gray-900 dark:text-gray-100">
      {/* Header bar */}
      <header className="bg-white dark:bg-[#1e293b] border-b border-gray-200 dark:border-white/10 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <span className="text-sm text-gray-500 dark:text-gray-400">← Back to Sign In</span>
        </Link>
        <span className="text-xs text-gray-400">Effective {EFFECTIVE_DATE}</span>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        {/* Title block */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Privacy Policy</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            {PLATFORM_NAME} — operated by {COMPANY_NAME}<br />
            Effective Date: {EFFECTIVE_DATE}
          </p>
        </div>

        <div className="space-y-8 text-sm leading-relaxed text-gray-700 dark:text-gray-300">

          {/* Intro */}
          <section>
            <p>
              {COMPANY_NAME} (&ldquo;Company,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) is committed
              to protecting the privacy of individuals who use the {PLATFORM_NAME} platform (the &ldquo;Platform&rdquo;). This
              Privacy Policy explains how we collect, use, disclose, and safeguard your information when you access or use the
              Platform. Please read this policy carefully. If you do not agree with its terms, please discontinue use of the
              Platform.
            </p>
            <p className="mt-2">
              This Privacy Policy applies to all users of the Platform, including licensed real estate agents, transaction
              coordinators, administrative staff, and other authorized personnel affiliated with {COMPANY_NAME}. It does not
              apply to third-party websites, services, or applications that may be linked to or integrated with the Platform.
            </p>
          </section>

          {/* 1 */}
          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">1. Information We Collect</h2>
            <p>We collect several categories of information in connection with your use of the Platform:</p>

            <h3 className="font-semibold text-gray-800 dark:text-gray-200 mt-4 mb-1">1.1 Information You Provide Directly</h3>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li><strong>Account information:</strong> Your name, email address, and profile photo, obtained through Google Sign-In at the time of account creation.</li>
              <li><strong>Contact information:</strong> Your mobile phone number, if you choose to provide it for SMS notification purposes.</li>
              <li><strong>Transaction data:</strong> Real estate transaction details you enter into the Platform, including property addresses, sale prices, commission amounts, client names, and closing dates.</li>
              <li><strong>Business plan data:</strong> Annual production goals, GCI targets, and other business planning information you enter.</li>
              <li><strong>Community board content:</strong> Buyer needs, coming soon listings, open house opportunities, agent help requests, and comments you post to the Platform.</li>
              <li><strong>Communications:</strong> Any messages, support requests, or other communications you send to us.</li>
            </ul>

            <h3 className="font-semibold text-gray-800 dark:text-gray-200 mt-4 mb-1">1.2 Information Collected Automatically</h3>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li><strong>Log data:</strong> IP address, browser type and version, operating system, referring URLs, pages viewed, and timestamps of your interactions with the Platform.</li>
              <li><strong>Device information:</strong> Device type, unique device identifiers, and mobile network information.</li>
              <li><strong>Usage data:</strong> Features used, actions taken within the Platform, and session duration.</li>
              <li><strong>Cookies and similar technologies:</strong> We use session cookies and local storage to maintain your authentication state and preferences. See Section 7 for more details.</li>
            </ul>

            <h3 className="font-semibold text-gray-800 dark:text-gray-200 mt-4 mb-1">1.3 Information from Third Parties</h3>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li><strong>Google:</strong> When you sign in with Google, we receive your name, email address, and profile photo as provided by Google. We do not receive your Google account password.</li>
              <li><strong>Firebase:</strong> Our Platform is hosted on Google Firebase, which may collect technical and usage data as described in Google&rsquo;s Privacy Policy.</li>
            </ul>
          </section>

          {/* 2 */}
          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">2. How We Use Your Information</h2>
            <p>We use the information we collect for the following purposes:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 pl-2">
              <li><strong>Platform operation:</strong> To provide, maintain, and improve the Platform and its features.</li>
              <li><strong>Authentication:</strong> To verify your identity and manage your account access.</li>
              <li><strong>Transaction management:</strong> To process, track, and report on real estate transactions entered into the Platform.</li>
              <li><strong>Performance reporting:</strong> To generate leaderboards, GCI reports, goal-tracking dashboards, and other performance metrics for agents and management.</li>
              <li><strong>Communications:</strong> To send you SMS and email notifications related to your use of the Platform, including transaction updates, community board alerts, renewal reminders, and open house information.</li>
              <li><strong>Business operations:</strong> To support brokerage management functions, including commission calculations, staff queue management, and compliance oversight.</li>
              <li><strong>Security:</strong> To detect, investigate, and prevent fraudulent activity, unauthorized access, and other security incidents.</li>
              <li><strong>Legal compliance:</strong> To comply with applicable laws, regulations, and legal processes, including Louisiana real estate licensing requirements.</li>
              <li><strong>Platform improvement:</strong> To analyze usage patterns and improve the functionality, performance, and user experience of the Platform.</li>
            </ul>
            <p className="mt-2">
              We do not sell your personal information to third parties. We do not use your personal information for targeted
              advertising or share it with advertising networks.
            </p>
          </section>

          {/* 3 */}
          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">3. How We Share Your Information</h2>
            <p>We may share your information in the following limited circumstances:</p>

            <h3 className="font-semibold text-gray-800 dark:text-gray-200 mt-4 mb-1">3.1 Within the Brokerage</h3>
            <p>
              Your transaction data, performance metrics, and community board posts are visible to other authorized users of
              the Platform, including brokerage management, administrative staff, and transaction coordinators, as necessary
              for business operations. Agent performance data, including GCI and closed transaction counts, may be displayed
              on leaderboards visible to all Platform users.
            </p>

            <h3 className="font-semibold text-gray-800 dark:text-gray-200 mt-4 mb-1">3.2 Service Providers</h3>
            <p>
              We share information with trusted third-party service providers who assist us in operating the Platform, subject
              to confidentiality obligations. These providers include:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 pl-2">
              <li><strong>Google Firebase:</strong> Data storage, hosting, and authentication services.</li>
              <li><strong>Twilio:</strong> SMS notification delivery.</li>
              <li><strong>Resend:</strong> Transactional email delivery.</li>
              <li><strong>Google (OAuth):</strong> Authentication services.</li>
            </ul>
            <p className="mt-2">
              Each of these providers has their own privacy policies governing their use of data. We encourage you to review
              their policies.
            </p>

            <h3 className="font-semibold text-gray-800 dark:text-gray-200 mt-4 mb-1">3.3 Legal Requirements</h3>
            <p>
              We may disclose your information if required to do so by law or in response to valid legal process, including
              a subpoena, court order, or government request. We may also disclose information to protect the rights, property,
              or safety of {COMPANY_NAME}, our users, or the public.
            </p>

            <h3 className="font-semibold text-gray-800 dark:text-gray-200 mt-4 mb-1">3.4 Business Transfers</h3>
            <p>
              In the event of a merger, acquisition, reorganization, sale of assets, or bankruptcy, your information may be
              transferred to a successor entity. We will provide notice before your information is transferred and becomes
              subject to a different privacy policy.
            </p>
          </section>

          {/* 4 */}
          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">4. Data Retention</h2>
            <p>
              We retain your personal information for as long as your account is active or as needed to provide you with
              access to the Platform. We also retain information as necessary to comply with legal obligations, resolve
              disputes, enforce our agreements, and support brokerage recordkeeping requirements under Louisiana law.
            </p>
            <p className="mt-2">
              Transaction data may be retained for a minimum of five (5) years in accordance with Louisiana real estate
              brokerage recordkeeping requirements. Upon termination of your affiliation with {COMPANY_NAME}, your account
              access will be revoked, but your transaction and performance data may be retained for compliance and historical
              reporting purposes.
            </p>
            <p className="mt-2">
              Community board posts (Buyer Needs, Coming Soon listings, Open House Opportunities, and Agent Help Requests)
              are subject to automatic archival after 14 days of inactivity and may be permanently deleted after 90 days
              in archived status.
            </p>
          </section>

          {/* 5 */}
          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">5. Your Rights and Choices</h2>

            <h3 className="font-semibold text-gray-800 dark:text-gray-200 mt-4 mb-1">5.1 Access and Correction</h3>
            <p>
              You may access and update certain personal information (such as your phone number and notification preferences)
              directly within the Platform under Settings. For other corrections or access requests, please contact us at{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="underline text-blue-600 dark:text-blue-400">{CONTACT_EMAIL}</a>.
            </p>

            <h3 className="font-semibold text-gray-800 dark:text-gray-200 mt-4 mb-1">5.2 Notification Preferences</h3>
            <p>
              You may manage your email and SMS notification preferences at any time through the Platform&rsquo;s Settings
              &rarr; Notifications page. You may opt out of SMS notifications by replying STOP to any SMS message or by
              disabling SMS in your notification preferences. Note that opting out of certain notifications may affect your
              ability to receive time-sensitive Platform alerts.
            </p>

            <h3 className="font-semibold text-gray-800 dark:text-gray-200 mt-4 mb-1">5.3 Account Deletion</h3>
            <p>
              If you wish to request deletion of your personal account information, please contact us at{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="underline text-blue-600 dark:text-blue-400">{CONTACT_EMAIL}</a>.
              Please note that we may be required to retain certain information for legal, compliance, or business purposes
              as described in Section 4, and that deletion of your account will not affect transaction records entered during
              your affiliation with the brokerage.
            </p>

            <h3 className="font-semibold text-gray-800 dark:text-gray-200 mt-4 mb-1">5.4 California Residents — CCPA Rights</h3>
            <p>
              If you are a California resident, you may have additional rights under the California Consumer Privacy Act
              (CCPA) and the California Privacy Rights Act (CPRA), including:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 pl-2">
              <li>The right to know what personal information we collect, use, disclose, and sell;</li>
              <li>The right to request deletion of your personal information, subject to certain exceptions;</li>
              <li>The right to opt out of the sale or sharing of your personal information (note: we do not sell personal information);</li>
              <li>The right to non-discrimination for exercising your privacy rights;</li>
              <li>The right to correct inaccurate personal information.</li>
            </ul>
            <p className="mt-2">
              To exercise these rights, please submit a verifiable consumer request to{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="underline text-blue-600 dark:text-blue-400">{CONTACT_EMAIL}</a>.
              We will respond to verified requests within 45 days as required by law.
            </p>

            <h3 className="font-semibold text-gray-800 dark:text-gray-200 mt-4 mb-1">5.5 Louisiana Residents</h3>
            <p>
              Louisiana residents have rights under the Louisiana Database Security Breach Notification Law (La. R.S. 51:3071
              et seq.). In the event of a security breach affecting your personal information, we will notify you as required
              by applicable Louisiana law.
            </p>
          </section>

          {/* 6 */}
          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">6. Data Security</h2>
            <p>
              We implement commercially reasonable administrative, technical, and physical security measures to protect your
              personal information from unauthorized access, use, disclosure, alteration, or destruction. These measures include:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 pl-2">
              <li>Encryption of data in transit using TLS/HTTPS;</li>
              <li>Encryption of data at rest within Google Firebase;</li>
              <li>Role-based access controls limiting data access to authorized personnel;</li>
              <li>Firebase Authentication for secure user identity management;</li>
              <li>Regular security reviews and monitoring.</li>
            </ul>
            <p className="mt-2">
              Despite these measures, no security system is impenetrable. We cannot guarantee that unauthorized third parties
              will never be able to defeat our security measures. You use the Platform at your own risk. If you believe your
              account has been compromised, please contact us immediately at{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="underline text-blue-600 dark:text-blue-400">{CONTACT_EMAIL}</a>.
            </p>
          </section>

          {/* 7 */}
          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">7. Cookies and Tracking Technologies</h2>
            <p>
              The Platform uses cookies and similar technologies (such as browser local storage) to maintain your authentication
              session and remember your preferences. We use the following types of cookies:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 pl-2">
              <li><strong>Essential cookies:</strong> Required for the Platform to function, including authentication tokens that keep you signed in.</li>
              <li><strong>Preference cookies:</strong> Used to remember your settings and preferences within the Platform.</li>
              <li><strong>Analytics cookies:</strong> Used to understand how users interact with the Platform to improve its functionality. We may use Firebase Analytics for this purpose.</li>
            </ul>
            <p className="mt-2">
              You can control cookie behavior through your browser settings. However, disabling essential cookies will prevent
              you from using the Platform, as authentication requires cookie-based session management. The Platform does not
              use third-party advertising cookies.
            </p>
          </section>

          {/* 8 */}
          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">8. Children&rsquo;s Privacy</h2>
            <p>
              The Platform is not directed to individuals under the age of 18, and we do not knowingly collect personal
              information from minors. If we become aware that we have inadvertently collected personal information from a
              person under 18, we will take steps to delete such information promptly. If you believe we have collected
              information from a minor, please contact us at{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="underline text-blue-600 dark:text-blue-400">{CONTACT_EMAIL}</a>.
            </p>
          </section>

          {/* 9 */}
          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">9. Third-Party Links and Integrations</h2>
            <p>
              The Platform may contain links to or integrations with third-party websites and services. This Privacy Policy
              does not apply to those third-party services, and we are not responsible for their privacy practices. We
              encourage you to review the privacy policies of any third-party services you access through or in connection
              with the Platform, including:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 pl-2">
              <li>Google Privacy Policy: <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="underline text-blue-600 dark:text-blue-400">policies.google.com/privacy</a></li>
              <li>Twilio Privacy Policy: <a href="https://www.twilio.com/en-us/legal/privacy" target="_blank" rel="noopener noreferrer" className="underline text-blue-600 dark:text-blue-400">twilio.com/en-us/legal/privacy</a></li>
              <li>Firebase / Google Cloud Privacy: <a href="https://firebase.google.com/support/privacy" target="_blank" rel="noopener noreferrer" className="underline text-blue-600 dark:text-blue-400">firebase.google.com/support/privacy</a></li>
            </ul>
          </section>

          {/* 10 */}
          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">10. International Data Transfers</h2>
            <p>
              The Platform is operated in the United States. If you access the Platform from outside the United States, please
              be aware that your information may be transferred to, stored, and processed in the United States, where data
              protection laws may differ from those in your jurisdiction. By using the Platform, you consent to the transfer
              of your information to the United States.
            </p>
          </section>

          {/* 11 */}
          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">11. Changes to This Privacy Policy</h2>
            <p>
              We reserve the right to update this Privacy Policy at any time. We will notify you of material changes by
              updating the &ldquo;Effective Date&rdquo; at the top of this page and, where practicable, by sending an in-app
              notification or email. We encourage you to review this Privacy Policy periodically. Your continued use of the
              Platform after the effective date of any change constitutes your acceptance of the revised Privacy Policy.
            </p>
          </section>

          {/* 12 */}
          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">12. Contact Us</h2>
            <p>
              If you have any questions, concerns, or requests regarding this Privacy Policy or our data practices, please
              contact our Privacy contact at:
            </p>
            <div className="mt-3 p-4 bg-gray-100 dark:bg-white/5 rounded-lg border border-gray-200 dark:border-white/10 text-sm">
              <p className="font-semibold text-gray-900 dark:text-white">{COMPANY_NAME}</p>
              <p>Attn: Privacy</p>
              <p>{COMPANY_ADDRESS}</p>
              <p>
                Email:{' '}
                <a href={`mailto:${CONTACT_EMAIL}`} className="underline text-blue-600 dark:text-blue-400">
                  {CONTACT_EMAIL}
                </a>
              </p>
            </div>
            <p className="mt-3">
              We will respond to all privacy-related inquiries within thirty (30) days of receipt.
            </p>
          </section>

        </div>

        {/* Footer nav */}
        <div className="mt-12 pt-6 border-t border-gray-200 dark:border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-400">
          <p>&copy; {new Date().getFullYear()} {COMPANY_NAME}. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <Link href="/terms" className="underline hover:text-gray-600 dark:hover:text-gray-200">Terms of Service</Link>
            <Link href="/" className="underline hover:text-gray-600 dark:hover:text-gray-200">Sign In</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
