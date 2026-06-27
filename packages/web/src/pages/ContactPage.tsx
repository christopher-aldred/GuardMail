import { useState } from 'react';
import { PublicNav } from '../components/PublicNav';
import { Footer } from '../components/Footer';
import { useSeo } from '../hooks/useSeo';
import { MailIcon, ShieldIcon, CheckIcon, AlertIcon } from '../components/Icons';

const SUPPORT_EMAIL = 'help@aiguard.email';
const SALES_EMAIL = 'support@aiguard.email';
const WEB3FORMS_ACCESS_KEY = '09f38062-ec52-4dd9-9d7d-68a88388bb42';

export function ContactPage() {
  useSeo({
    title: 'Contact us | AI Guard Mail',
    description:
      'Get in touch with the AI Guard Mail team — support, sales, security, and partnership enquiries. Reach us by email and we\u2019ll get back to you quickly.',
    path: '/contact',
  });

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim() || !email.trim() || !subject.trim() || !message.trim()) {
      setError('Please fill in all fields before sending.');
      return;
    }
    // Simple email sanity check.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          access_key: WEB3FORMS_ACCESS_KEY,
          subject: `[Contact] ${subject}`,
          name,
          email,
          message,
          from_name: 'AI Guard Mail Contact',
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSent(true);
      } else {
        setError(data.message || 'Submission failed. Please try again or email us directly at ' + SUPPORT_EMAIL);
      }
    } catch {
      setError('Could not submit the form. Please email us directly at ' + SUPPORT_EMAIL);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 relative">
      <div className="hero-bg" />
      <div className="relative z-10">
        <PublicNav />

        <main className="max-w-2xl mx-auto px-6 py-12">
          <div className="space-y-8 fade-up">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <ShieldIcon size={28} className="text-blue-400" />
                <h1 className="text-3xl font-bold">Contact us</h1>
              </div>
              <p className="text-gray-400 leading-relaxed">
                Questions about AI Guard Mail, your account, security, or working
                with us? We read every message and reply as quickly as we can.
              </p>
            </div>

            {/* Direct email channels */}
            <section className="grid sm:grid-cols-2 gap-4">
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="block border border-gray-700/60 rounded-lg p-5 hover:border-gray-600 transition bg-gray-800/30"
              >
                <div className="flex items-center gap-2 mb-1 text-blue-400">
                  <MailIcon size={18} />
                  <span className="font-semibold">Support</span>
                </div>
                <p className="text-sm text-gray-400 break-all">{SUPPORT_EMAIL}</p>
                <p className="text-xs text-gray-500 mt-1">Account, billing &amp; technical help</p>
              </a>
              <a
                href={`mailto:${SALES_EMAIL}`}
                className="block border border-gray-700/60 rounded-lg p-5 hover:border-gray-600 transition bg-gray-800/30"
              >
                <div className="flex items-center gap-2 mb-1 text-blue-400">
                  <MailIcon size={18} />
                  <span className="font-semibold">Sales &amp; partnerships</span>
                </div>
                <p className="text-sm text-gray-400 break-all">{SALES_EMAIL}</p>
                <p className="text-xs text-gray-500 mt-1">Custom tiers, SLAs &amp; integrations</p>
              </a>
            </section>

            {/* Contact form */}
            <section className="border border-gray-700/60 rounded-lg p-6 bg-gray-800/30">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <MailIcon size={18} className="text-blue-400" /> Send us a message
              </h2>

              {sent ? (
                <div className="flex items-start gap-3 text-green-400 bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                  <CheckIcon size={20} className="mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <p className="font-semibold">Thanks — your message has been sent.</p>
                    <p className="text-green-300/80 mt-1">
                      We'll get back to you shortly. Need urgent help? Email us directly at{' '}
                      <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">{SUPPORT_EMAIL}</a>.
                    </p>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* <!-- Honeypot spam protection --> */}
                  <input type="checkbox" name="botcheck" className="hidden" style={{ display: 'none' }} tabIndex={-1} autoComplete="off" />
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="name" className="block text-sm text-gray-300 mb-1">Name</label>
                      <input
                        id="name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition"
                        placeholder="Your name"
                      />
                    </div>
                    <div>
                      <label htmlFor="email" className="block text-sm text-gray-300 mb-1">Email</label>
                      <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition"
                        placeholder="you@example.com"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="subject" className="block text-sm text-gray-300 mb-1">Subject</label>
                    <input
                      id="subject"
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition"
                      placeholder="How can we help?"
                    />
                  </div>
                  <div>
                    <label htmlFor="message" className="block text-sm text-gray-300 mb-1">Message</label>
                    <textarea
                      id="message"
                      rows={6}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition resize-y"
                      placeholder="Tell us a bit more…"
                    />
                  </div>

                  {error && (
                    <div className="flex items-start gap-2 text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm">
                      <AlertIcon size={18} className="mt-0.5 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed px-5 py-2.5 rounded-lg text-white text-sm font-medium transition flex items-center justify-center gap-2"
                  >
                    <MailIcon size={16} /> {submitting ? 'Sending…' : 'Send message'}
                  </button>
                </form>
              )}
            </section>

            <p className="text-xs text-gray-500 text-center">
              Prefer email? Reach us directly at{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-gray-400 hover:text-white underline">{SUPPORT_EMAIL}</a>.
            </p>
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}