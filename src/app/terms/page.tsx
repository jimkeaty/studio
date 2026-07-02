import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service — Smart Broker USA | Keaty Real Estate',
  description: 'Terms of Service for the Smart Broker USA platform operated by Keaty Real Estate.',
};

const EFFECTIVE_DATE = 'July 1, 2025';
const COMPANY_NAME = 'Keaty Real Estate';
const PLATFORM_NAME = 'Smart Broker USA';
const CONTACT_EMAIL = 'admin@keatyrealestate.com';
const COMPANY_ADDRESS = 'Lafayette, Louisiana, United States';

export default function TermsOfServicePage() {
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
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Terms of Service</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            {PLATFORM_NAME} — operated by {COMPANY_NAME}<br />
            Effective Date: {EFFECTIVE_DATE}
          </p>
        </div>

        <div className="space-y-8 text-sm leading-relaxed text-gray-700 dark:text-gray-300">

          {/* 1 */}
          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">1. Acceptance of Terms</h2>
            <p>
              By accessing or using the {PLATFORM_NAME} platform (the &ldquo;Platform&rdquo;), including any associated
              mobile applications, dashboards, APIs, or services, you (&ldquo;User&rdquo; or &ldquo;you&rdquo;) agree to be
              bound by these Terms of Service (&ldquo;Terms&rdquo;) and our{' '}
              <Link href="/privacy" className="underline text-blue-600 dark:text-blue-400 hover:opacity-80">Privacy Policy</Link>,
              which are incorporated herein by reference. If you do not agree to these Terms, you may not access or use the Platform.
            </p>
            <p className="mt-2">
              These Terms constitute a legally binding agreement between you and {COMPANY_NAME} (&ldquo;Company,&rdquo;
              &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;), a real estate brokerage operating in the State of
              Louisiana. By signing in with Google or any other authentication method, you acknowledge that you have read,
              understood, and agree to be bound by these Terms.
            </p>
          </section>

          {/* 2 */}
          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">2. Description of the Platform</h2>
            <p>
              {PLATFORM_NAME} is an internal business management and performance-tracking platform designed exclusively for
              licensed real estate agents, transaction coordinators, administrative staff, and authorized personnel affiliated
              with {COMPANY_NAME}. The Platform provides tools including, but not limited to:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 pl-2">
              <li>Transaction management and tracking</li>
              <li>Agent performance dashboards and leaderboards</li>
              <li>Commission and GCI reporting</li>
              <li>Office TV mode and community board features</li>
              <li>Open house management and scheduling</li>
              <li>Staff queue and task management</li>
              <li>Notification and communication tools</li>
              <li>Business plan and goal-tracking features</li>
            </ul>
            <p className="mt-2">
              The Platform is not a public-facing consumer product and is not intended for use by members of the general public.
              Access is granted solely at the discretion of {COMPANY_NAME}.
            </p>
          </section>

          {/* 3 */}
          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">3. Eligibility and Account Access</h2>
            <p>
              Access to the Platform is restricted to individuals who are (a) currently affiliated with {COMPANY_NAME} as a
              licensed real estate agent, transaction coordinator, or authorized staff member; or (b) otherwise expressly
              authorized in writing by {COMPANY_NAME} management. You must be at least 18 years of age to use the Platform.
            </p>
            <p className="mt-2">
              You are responsible for maintaining the confidentiality of your account credentials, including any Google account
              used to authenticate. You agree to notify us immediately at{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="underline text-blue-600 dark:text-blue-400">{CONTACT_EMAIL}</a>{' '}
              if you suspect unauthorized access to your account. {COMPANY_NAME} is not liable for any loss or damage arising
              from your failure to safeguard your credentials.
            </p>
            <p className="mt-2">
              {COMPANY_NAME} reserves the right to suspend or terminate your access to the Platform at any time, with or without
              notice, for any reason including, but not limited to, termination of your affiliation with the brokerage, violation
              of these Terms, or any conduct that we determine, in our sole discretion, to be harmful to the Platform, other users,
              or the Company.
            </p>
          </section>

          {/* 4 */}
          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">4. Authorized Use</h2>
            <p>You agree to use the Platform only for lawful purposes and in accordance with these Terms. You agree not to:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 pl-2">
              <li>Use the Platform for any purpose other than legitimate business activities related to your role at {COMPANY_NAME};</li>
              <li>Share your login credentials with any unauthorized third party;</li>
              <li>Attempt to gain unauthorized access to any portion of the Platform or its underlying systems;</li>
              <li>Reverse engineer, decompile, disassemble, or otherwise attempt to derive the source code of the Platform;</li>
              <li>Introduce any viruses, malware, or other malicious code into the Platform;</li>
              <li>Scrape, crawl, or systematically extract data from the Platform without express written permission;</li>
              <li>Use the Platform in any manner that could disable, overburden, or impair its proper functioning;</li>
              <li>Post, transmit, or distribute any content that is defamatory, harassing, abusive, fraudulent, or otherwise unlawful;</li>
              <li>Violate any applicable federal, state, or local law, regulation, or ordinance, including the Louisiana Real Estate License Law.</li>
            </ul>
          </section>

          {/* 5 */}
          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">5. Transaction and Commission Data</h2>
            <p>
              The Platform allows users to enter, track, and manage real estate transaction data, including sale prices, commission
              amounts, and client information. You represent and warrant that all data you enter into the Platform is accurate,
              complete, and does not violate any confidentiality obligations, client agreements, or applicable law.
            </p>
            <p className="mt-2">
              You acknowledge that transaction data entered into the Platform may be reviewed by {COMPANY_NAME} management,
              administrative staff, and transaction coordinators for the purposes of compliance, reporting, commission calculation,
              and business operations. You have no expectation of privacy with respect to business data entered into the Platform
              in your capacity as an affiliated agent or staff member.
            </p>
            <p className="mt-2">
              {COMPANY_NAME} does not guarantee the accuracy of any commission calculations, projections, or financial reports
              generated by the Platform. All financial figures are estimates only and should be independently verified. The Platform
              is not a substitute for professional accounting, tax, or legal advice.
            </p>
          </section>

          {/* 6 */}
          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">6. Community Board and User-Generated Content</h2>
            <p>
              The Platform includes community board features (including Buyer Needs, Coming Soon listings, Open House Opportunities,
              and Agent Help Requests) through which users may post content visible to other authorized users. By posting content
              to the Platform, you grant {COMPANY_NAME} a non-exclusive, royalty-free, worldwide license to use, display, and
              distribute such content within the Platform for the purposes of operating and improving the service.
            </p>
            <p className="mt-2">
              You are solely responsible for the content you post. You agree not to post any content that contains confidential
              client information, personally identifiable information of third parties without consent, or any content that
              violates applicable fair housing laws, the National Association of REALTORS&reg; Code of Ethics, or any other
              professional standards applicable to licensed real estate agents.
            </p>
            <p className="mt-2">
              {COMPANY_NAME} reserves the right, but is not obligated, to monitor, edit, or remove any user-generated content
              at any time and for any reason without notice.
            </p>
          </section>

          {/* 7 */}
          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">7. Notifications and Communications</h2>
            <p>
              By using the Platform and providing your mobile phone number, you consent to receive SMS text messages and email
              notifications from {COMPANY_NAME} related to your use of the Platform, including transaction updates, community
              board alerts, open house reminders, and renewal prompts. Standard message and data rates may apply. You may opt
              out of SMS notifications at any time by updating your notification preferences within the Platform or by replying
              STOP to any SMS message.
            </p>
            <p className="mt-2">
              You acknowledge that SMS and email notifications are provided as a convenience and that {COMPANY_NAME} does not
              guarantee delivery of any notification. Time-sensitive matters should not be communicated solely through Platform
              notifications.
            </p>
          </section>

          {/* 8 */}
          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">8. Intellectual Property</h2>
            <p>
              The Platform, including all software, design, text, graphics, logos, and other content (excluding user-generated
              content), is the exclusive property of {COMPANY_NAME} or its licensors and is protected by applicable copyright,
              trademark, trade secret, and other intellectual property laws. Nothing in these Terms grants you any right, title,
              or interest in the Platform or its underlying technology except for the limited right to use the Platform as
              expressly set forth herein.
            </p>
            <p className="mt-2">
              &ldquo;Keaty Real Estate,&rdquo; &ldquo;Smart Broker USA,&rdquo; &ldquo;Always 110%,&rdquo; and associated logos
              are trademarks or service marks of {COMPANY_NAME}. You may not use these marks without prior written consent.
            </p>
          </section>

          {/* 9 */}
          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">9. Third-Party Services and Integrations</h2>
            <p>
              The Platform may integrate with or link to third-party services, including Google (for authentication), Twilio
              (for SMS), Resend (for email), Firebase (for data storage and hosting), and other providers. Your use of such
              third-party services is governed by their respective terms of service and privacy policies. {COMPANY_NAME} is not
              responsible for the practices, content, or availability of any third-party services.
            </p>
            <p className="mt-2">
              By using Google Sign-In, you also agree to Google&rsquo;s Terms of Service and Privacy Policy. {COMPANY_NAME}
              receives only the information necessary to authenticate your identity and does not receive your Google account
              password.
            </p>
          </section>

          {/* 10 */}
          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">10. Data Security</h2>
            <p>
              {COMPANY_NAME} implements commercially reasonable technical and organizational measures to protect the data stored
              within the Platform against unauthorized access, disclosure, alteration, or destruction. However, no method of
              electronic transmission or storage is 100% secure, and we cannot guarantee absolute security.
            </p>
            <p className="mt-2">
              In the event of a data breach that affects your personal information, we will notify you as required by applicable
              law, including the Louisiana Database Security Breach Notification Law (La. R.S. 51:3071 et seq.).
            </p>
          </section>

          {/* 11 */}
          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">11. Disclaimer of Warranties</h2>
            <p>
              THE PLATFORM IS PROVIDED ON AN &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; BASIS WITHOUT WARRANTIES OF
              ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
              PARTICULAR PURPOSE, NON-INFRINGEMENT, OR UNINTERRUPTED OR ERROR-FREE OPERATION. {COMPANY_NAME.toUpperCase()} DOES
              NOT WARRANT THAT THE PLATFORM WILL MEET YOUR REQUIREMENTS OR THAT ANY ERRORS WILL BE CORRECTED.
            </p>
            <p className="mt-2">
              ANY FINANCIAL PROJECTIONS, COMMISSION ESTIMATES, GOAL CALCULATIONS, OR PERFORMANCE METRICS PROVIDED BY THE
              PLATFORM ARE FOR INFORMATIONAL PURPOSES ONLY AND DO NOT CONSTITUTE FINANCIAL, LEGAL, OR TAX ADVICE.
            </p>
          </section>

          {/* 12 */}
          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">12. Limitation of Liability</h2>
            <p>
              TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, {COMPANY_NAME.toUpperCase()} AND ITS OFFICERS, DIRECTORS,
              EMPLOYEES, AGENTS, AND LICENSORS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR
              PUNITIVE DAMAGES, INCLUDING LOST PROFITS, LOST DATA, LOSS OF GOODWILL, OR BUSINESS INTERRUPTION, ARISING OUT OF
              OR IN CONNECTION WITH YOUR USE OF OR INABILITY TO USE THE PLATFORM, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH
              DAMAGES.
            </p>
            <p className="mt-2">
              IN NO EVENT SHALL {COMPANY_NAME.toUpperCase()}&rsquo;S TOTAL LIABILITY TO YOU FOR ALL CLAIMS ARISING OUT OF OR
              RELATING TO THESE TERMS OR THE PLATFORM EXCEED THE GREATER OF (A) ONE HUNDRED DOLLARS ($100.00) OR (B) THE AMOUNT
              PAID BY YOU, IF ANY, TO ACCESS THE PLATFORM IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM.
            </p>
          </section>

          {/* 13 */}
          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">13. Indemnification</h2>
            <p>
              You agree to indemnify, defend, and hold harmless {COMPANY_NAME} and its officers, directors, employees, agents,
              and licensors from and against any claims, liabilities, damages, losses, costs, and expenses (including reasonable
              attorneys&rsquo; fees) arising out of or relating to: (a) your use of the Platform; (b) your violation of these
              Terms; (c) your violation of any applicable law or regulation; or (d) any content you post or transmit through
              the Platform.
            </p>
          </section>

          {/* 14 */}
          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">14. Governing Law and Dispute Resolution</h2>
            <p>
              These Terms shall be governed by and construed in accordance with the laws of the State of Louisiana, without
              regard to its conflict of law provisions. Any dispute arising out of or relating to these Terms or the Platform
              shall be subject to the exclusive jurisdiction of the state and federal courts located in Lafayette Parish,
              Louisiana, and you hereby consent to personal jurisdiction in such courts.
            </p>
            <p className="mt-2">
              Before initiating any formal legal proceeding, you agree to first contact {COMPANY_NAME} at{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="underline text-blue-600 dark:text-blue-400">{CONTACT_EMAIL}</a>{' '}
              and attempt to resolve the dispute informally for a period of at least thirty (30) days.
            </p>
          </section>

          {/* 15 */}
          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">15. Modifications to the Terms</h2>
            <p>
              {COMPANY_NAME} reserves the right to modify these Terms at any time. We will provide notice of material changes
              by updating the &ldquo;Effective Date&rdquo; at the top of this page and, where practicable, by sending an
              in-app notification or email. Your continued use of the Platform after the effective date of any modification
              constitutes your acceptance of the revised Terms. If you do not agree to the revised Terms, you must discontinue
              use of the Platform.
            </p>
          </section>

          {/* 16 */}
          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">16. Termination</h2>
            <p>
              These Terms remain in effect for as long as you use the Platform. {COMPANY_NAME} may terminate or suspend your
              access immediately, without prior notice or liability, for any reason, including if you breach these Terms.
              Upon termination, your right to use the Platform will immediately cease. Provisions of these Terms that by their
              nature should survive termination — including Sections 8, 11, 12, 13, and 14 — shall survive.
            </p>
          </section>

          {/* 17 */}
          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">17. Severability and Entire Agreement</h2>
            <p>
              If any provision of these Terms is found to be invalid or unenforceable by a court of competent jurisdiction,
              that provision shall be modified to the minimum extent necessary to make it enforceable, and the remaining
              provisions shall continue in full force and effect. These Terms, together with the Privacy Policy, constitute
              the entire agreement between you and {COMPANY_NAME} with respect to the Platform and supersede all prior
              agreements, understandings, and representations.
            </p>
          </section>

          {/* 18 */}
          <section>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">18. Contact Information</h2>
            <p>
              If you have any questions about these Terms, please contact us at:
            </p>
            <div className="mt-3 p-4 bg-gray-100 dark:bg-white/5 rounded-lg border border-gray-200 dark:border-white/10 text-sm">
              <p className="font-semibold text-gray-900 dark:text-white">{COMPANY_NAME}</p>
              <p>{COMPANY_ADDRESS}</p>
              <p>
                Email:{' '}
                <a href={`mailto:${CONTACT_EMAIL}`} className="underline text-blue-600 dark:text-blue-400">
                  {CONTACT_EMAIL}
                </a>
              </p>
            </div>
          </section>

        </div>

        {/* Footer nav */}
        <div className="mt-12 pt-6 border-t border-gray-200 dark:border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-400">
          <p>&copy; {new Date().getFullYear()} {COMPANY_NAME}. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="underline hover:text-gray-600 dark:hover:text-gray-200">Privacy Policy</Link>
            <Link href="/" className="underline hover:text-gray-600 dark:hover:text-gray-200">Sign In</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
