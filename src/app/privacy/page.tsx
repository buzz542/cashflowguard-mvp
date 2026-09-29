import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — GuardConstruct",
  description: "How GuardConstruct collects, uses and shares personal data."
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#FAFAF9] text-gray-900">
      <header className="border-b bg-white">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="font-bold">
            Guard<span className="text-blue-600">Construct</span>
          </Link>
          <Link href="/" className="text-sm text-blue-600">
            Back to app
          </Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-10 prose prose-sm prose-gray">
        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: 29 September 2026 · England &amp; Wales</p>

        <h2 className="text-lg font-bold mt-8 mb-2">Who we are</h2>
        <p>
          GuardConstruct (&quot;we&quot;, &quot;us&quot;) provides an automated commercial risk review tool for small UK
          construction businesses and freelancers. Contact for privacy queries:{" "}
          <a className="text-blue-600" href="mailto:tobyburrows1@icloud.com">
            tobyburrows1@icloud.com
          </a>
          .
        </p>

        <h2 className="text-lg font-bold mt-8 mb-2">What we collect</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Account details: your email address, and a password if you choose one (stored hashed by our login provider, never by us in plain text).</li>
          <li>Job context you enter (trade, package size band, duration, role).</li>
          <li>Contract documents, photos or text you upload for review.</li>
          <li>
            Your review history: the AI result for each check, the job context, and the first 120 characters of the
            contract text. Results can quote contract wording, which may include names and addresses of the parties.
          </li>
          <li>
            For free-tier limits: a normalised form of your email address and a one-way hash of your IP address.
          </li>
          <li>Payment and subscription data processed by Stripe if you subscribe.</li>
          <li>Basic technical data (IP address, browser type) in server logs for security and rate limiting.</li>
        </ul>

        <h2 className="text-lg font-bold mt-8 mb-2">How we use it</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>To run an automated contract risk summary and show results to you.</li>
          <li>To keep your review history so you can see it on any device.</li>
          <li>To enforce free-tier limits and Pro subscriptions.</li>
          <li>To process payments and prevent abuse (rate limiting, fraud checks).</li>
          <li>To respond to support requests you send us.</li>
        </ul>
        <p className="mt-2">
          Legal bases under UK GDPR: contract performance (providing the service you request), legitimate interests
          (securing the service, preventing abuse), and legal obligation where applicable.
        </p>

        <h2 className="text-lg font-bold mt-8 mb-2">AI processing</h2>
        <p>
          Contract text and images are sent to our AI provider <strong>Anthropic</strong> solely to extract text and
          generate a commercial risk summary. Outputs are automated, may be incomplete or incorrect, and are{" "}
          <strong>not legal advice</strong>. Do not upload documents you are not entitled to process.
        </p>

        <h2 className="text-lg font-bold mt-8 mb-2">Third parties</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Anthropic</strong> — AI processing of document content.
          </li>
          <li>
            <strong>Stripe</strong> — subscription payments and billing portal.
          </li>
          <li>
            <strong>Supabase</strong> — login and database (accounts, review history, subscription status).
          </li>
          <li>
            <strong>Vercel</strong> — website hosting and serverless infrastructure.
          </li>
        </ul>
        <p className="mt-2">
          These providers may process data outside the UK. Where they do, we rely on appropriate safeguards they
          publish (such as standard contractual clauses).
        </p>

        <h2 className="text-lg font-bold mt-8 mb-2">Cookies</h2>
        <p>
          We do not use advertising or analytics cookies. We use strictly necessary cookies to keep you signed in.
          Older versions of the app stored your account on your device; the app now removes that data automatically
          and offers to move any saved reviews into your account.
        </p>

        <h2 className="text-lg font-bold mt-8 mb-2">Retention</h2>
        <p>
          Uploaded files and the full contract text are processed in memory for the request and are not stored by us.
          Your review history (as described above) is kept until you delete it, which you can do for each review in the
          app, or until you ask us to delete your account. Your account is kept until you ask us to delete it. Hashed IP
          addresses used for free-tier limits are deleted after 2 days. Stripe retains payment records per their
          policies. Server logs are kept for a limited period for security.
        </p>

        <h2 className="text-lg font-bold mt-8 mb-2">Your rights</h2>
        <p>
          Under UK GDPR you may request access, correction, erasure, restriction, or portability of personal data we
          hold, and you may object to certain processing. Contact us at the email above. You may complain to the ICO
          (ico.org.uk).
        </p>

        <h2 className="text-lg font-bold mt-8 mb-2">Children</h2>
        <p>The service is aimed at businesses and is not intended for anyone under 18.</p>

        <h2 className="text-lg font-bold mt-8 mb-2">Changes</h2>
        <p>We may update this policy; the &quot;Last updated&quot; date will change when we do.</p>
      </main>
    </div>
  );
}
