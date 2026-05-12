import { Link } from 'react-router-dom'
import { Header } from '../components/Header'
import { useSEO } from '../hooks/useSEO'
import { ROUTE_SEO } from '../lib/seo-data'

export function Privacy() {
  useSEO(ROUTE_SEO['/privacy'])

  return (
    <div className="bg-bg-dark flex flex-col">
      <Header showNav={true} />
      <div className="p-4 md:p-8">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl md:text-3xl font-semibold text-text-primary mb-2">Privacy Policy</h1>
          <p className="text-text-muted text-sm mb-8">Last updated: May 2026</p>

          <div className="space-y-8">
            <section>
              <h2 className="text-lg md:text-xl font-semibold text-text-primary mb-3">Data Controller</h2>
              <p className="text-text-muted text-sm leading-relaxed">
                CloudCertPrep is operated by Alex Santonastaso (the "Data Controller") based in the United Kingdom. For any data protection enquiries, contact us at <a href="mailto:alex@cloudcertprep.io" className="text-aws-orange hover:text-aws-orange/80 hover:underline transition-colors">alex@cloudcertprep.io</a>.
              </p>
            </section>

            <section>
              <h2 className="text-lg md:text-xl font-semibold text-text-primary mb-3">What data we collect</h2>
              <p className="text-text-muted text-sm leading-relaxed mb-3">
                We only collect data when you create an account. Guest users generate no personal data on our servers.
              </p>
              <ul className="space-y-2 text-text-muted text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-aws-orange mt-0.5">-</span>
                  <span><strong className="text-text-primary">Email address</strong>: used to identify your account and send password reset emails.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-aws-orange mt-0.5">-</span>
                  <span><strong className="text-text-primary">Practice history</strong>: the questions you answered, whether you got them right, and when. Used to power spaced repetition and track your domain mastery.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-aws-orange mt-0.5">-</span>
                  <span><strong className="text-text-primary">Exam attempts</strong>: your scores, timing, and domain breakdowns from practice exams. Used to display your History page.</span>
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg md:text-xl font-semibold text-text-primary mb-3">Legal basis for processing</h2>
              <p className="text-text-muted text-sm leading-relaxed mb-3">
                Under GDPR, we process your data under the following lawful bases:
              </p>
              <ul className="space-y-2 text-text-muted text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-aws-orange mt-0.5">-</span>
                  <span><strong className="text-text-primary">Contract performance</strong>: processing your account data and study progress is necessary to provide the service you signed up for.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-aws-orange mt-0.5">-</span>
                  <span><strong className="text-text-primary">Legitimate interests</strong>: we use anonymised, aggregated analytics (Umami) to understand how the app is used and improve it. This does not identify you personally.</span>
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg md:text-xl font-semibold text-text-primary mb-3">How we use your data</h2>
              <p className="text-text-muted text-sm leading-relaxed mb-3">
                Your data is used entirely to improve your study experience:
              </p>
              <ul className="space-y-2 text-text-muted text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-aws-orange mt-0.5">-</span>
                  <span>Personalising which questions appear in Domain Practice sessions (spaced repetition)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-aws-orange mt-0.5">-</span>
                  <span>Showing your domain mastery progress on the Dashboard</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-aws-orange mt-0.5">-</span>
                  <span>Displaying your exam attempt history</span>
                </li>
              </ul>
              <p className="text-text-muted text-sm leading-relaxed mt-3">
                We do not use your data for advertising, profiling, or any purpose beyond running the app.
              </p>
            </section>

            <section>
              <h2 className="text-lg md:text-xl font-semibold text-text-primary mb-3">Data retention</h2>
              <p className="text-text-muted text-sm leading-relaxed">
                We retain your account data for as long as your account is active. If you request deletion, we will remove all your personal data within 30 days. Anonymised, aggregated statistics (e.g., total exams passed) may be retained indefinitely as they cannot identify you.
              </p>
            </section>

            <section>
              <h2 className="text-lg md:text-xl font-semibold text-text-primary mb-3">We will never sell your data</h2>
              <p className="text-text-muted text-sm leading-relaxed">
                Your data is never sold, shared with third parties for marketing, or used for any commercial purpose. This is a free tool built for learners, not a data business.
              </p>
            </section>

            <section>
              <h2 className="text-lg md:text-xl font-semibold text-text-primary mb-3">Where data is stored</h2>
              <p className="text-text-muted text-sm leading-relaxed">
                Authentication and database are handled by <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="text-aws-orange hover:text-aws-orange/80 hover:underline transition-colors">Supabase</a>, hosted on AWS infrastructure in the EU West region (Ireland). All data is encrypted at rest and in transit. Your data does not leave the European Economic Area.
              </p>
            </section>

            <section>
              <h2 className="text-lg md:text-xl font-semibold text-text-primary mb-3">Your rights under GDPR</h2>
              <p className="text-text-muted text-sm leading-relaxed mb-3">
                Under the General Data Protection Regulation (GDPR), you have the following rights:
              </p>
              <ul className="space-y-2 text-text-muted text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-aws-orange mt-0.5">-</span>
                  <span><strong className="text-text-primary">Right of access</strong>: request a copy of your personal data</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-aws-orange mt-0.5">-</span>
                  <span><strong className="text-text-primary">Right to rectification</strong>: request correction of inaccurate data</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-aws-orange mt-0.5">-</span>
                  <span><strong className="text-text-primary">Right to erasure</strong>: request deletion of your data ("right to be forgotten")</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-aws-orange mt-0.5">-</span>
                  <span><strong className="text-text-primary">Right to data portability</strong>: receive your data in a structured, machine-readable format</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-aws-orange mt-0.5">-</span>
                  <span><strong className="text-text-primary">Right to object</strong>: object to processing based on legitimate interests</span>
                </li>
              </ul>
              <p className="text-text-muted text-sm leading-relaxed mt-3">
                To exercise any of these rights, email <a href="mailto:alex@cloudcertprep.io" className="text-aws-orange hover:text-aws-orange/80 hover:underline transition-colors">alex@cloudcertprep.io</a>. We will respond within 30 days.
              </p>
            </section>

            <section>
              <h2 className="text-lg md:text-xl font-semibold text-text-primary mb-3">Right to complain</h2>
              <p className="text-text-muted text-sm leading-relaxed">
                If you are unhappy with how we handle your data, you have the right to lodge a complaint with the UK Information Commissioner's Office (ICO). Visit <a href="https://ico.org.uk/make-a-complaint/" target="_blank" rel="noopener noreferrer" className="text-aws-orange hover:text-aws-orange/80 hover:underline transition-colors">ico.org.uk/make-a-complaint</a> for more information. If you are in the EU/EEA, you may also complain to your local supervisory authority.
              </p>
            </section>

            <section>
              <h2 className="text-lg md:text-xl font-semibold text-text-primary mb-3">Cookies and local storage</h2>
              <p className="text-text-muted text-sm leading-relaxed mb-3">
                We use browser local storage to:
              </p>
              <ul className="space-y-2 text-text-muted text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-aws-orange mt-0.5">-</span>
                  <span>Keep your authentication session active</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-aws-orange mt-0.5">-</span>
                  <span>Remember your theme preference (light or dark mode)</span>
                </li>
              </ul>
              <p className="text-text-muted text-sm leading-relaxed mt-3">
                We do not use cookies for tracking. Google Analytics (GA4) may set its own cookies, see below.
              </p>
            </section>

            <section>
              <h2 className="text-lg md:text-xl font-semibold text-text-primary mb-3">Analytics and Cookies</h2>
              <p className="text-text-muted text-sm leading-relaxed mb-3">
                We use two analytics tools, with different consent requirements:
              </p>
              <ul className="space-y-2 text-text-muted text-sm mb-3">
                <li className="flex items-start gap-2">
                  <span className="text-aws-orange mt-0.5">-</span>
                  <span><strong className="text-text-primary">Umami (cookieless, no consent required)</strong>: an open-source, privacy-focused analytics tool. Umami sets no cookies, collects no personally identifiable information, and does not track users across sites. We use it under the GDPR "legitimate interests" basis to understand which pages are visited and which features are used. You cannot opt out of Umami because it does not identify you in the first place.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-aws-orange mt-0.5">-</span>
                  <span><strong className="text-text-primary">Google Analytics 4 (GA4) (requires consent)</strong>: a more detailed analytics tool. GA4 sets cookies (such as <code className="text-xs bg-bg-dark px-1 py-0.5 rounded">_ga</code> and <code className="text-xs bg-bg-dark px-1 py-0.5 rounded">_ga_*</code>) to track anonymous usage patterns. <strong className="text-text-primary">GA4 only loads if you click "Accept" on the cookie consent banner.</strong> No personally identifiable information is sent to Google, and we do not link analytics data to your account. You can withdraw consent by clearing your browser's local storage, or use the <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener noreferrer" className="text-aws-orange hover:text-aws-orange/80 hover:underline transition-colors">Google Analytics Opt-out Add-on</a>.</span>
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg md:text-xl font-semibold text-text-primary mb-3">Changes to this policy</h2>
              <p className="text-text-muted text-sm leading-relaxed">
                If we make material changes, we will update the "last updated" date at the top of this page. Continued use of the app after changes constitutes acceptance.
              </p>
            </section>

            <div className="pt-4 border-t border-text-muted/20">
              <p className="text-text-muted text-sm">
                Questions? Email <a href="mailto:alex@cloudcertprep.io" className="text-aws-orange hover:text-aws-orange/80 hover:underline transition-colors">alex@cloudcertprep.io</a> or read our <Link to="/terms" className="text-aws-orange hover:text-aws-orange/80 hover:underline transition-colors">Terms of Service</Link>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
