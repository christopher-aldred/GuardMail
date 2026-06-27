import { Link } from "react-router-dom";
import { useState } from "react";
import { ShieldIcon } from "./Icons";

/**
 * Shared public-site navigation bar.
 *
 * Used on every non-logged-in page so that the nav is consistent across
 * the landing page, docs, agent guides, and auth screens. The links and
 * styling match the landing page reference.
 */
export function PublicNav() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="border-b border-gray-800/60 px-6 py-4 flex items-center justify-between backdrop-blur-sm bg-gray-900/40">
      <Link to="/" className="flex items-center gap-2">
        <ShieldIcon size={24} className="text-blue-400" />
        <span className="text-lg font-bold">AI Guard Mail</span>
      </Link>
      {/* Desktop links */}
      <div className="hidden sm:flex items-center gap-4">
        <Link
          to="/docs"
          className="text-sm text-gray-400 hover:text-white transition"
        >
          Docs
        </Link>
        <Link
          to="/docs/send-receive-ai-agent"
          className="text-sm text-gray-400 hover:text-white transition"
        >
          Guides
        </Link>
        <Link
          to="/docs/prompt-injection-dangers"
          className="text-sm text-gray-400 hover:text-white transition"
        >
          Security
        </Link>
        <Link
          to="/login"
          className="text-sm text-gray-400 hover:text-white transition"
        >
          Log in
        </Link>
        <Link
          to="/register"
          className="text-sm bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-white font-medium transition"
        >
          Get started
        </Link>
      </div>
      {/* Mobile hamburger */}
      <button
        className="sm:hidden p-2 rounded-lg hover:bg-gray-800 transition"
        onClick={() => setMobileOpen((v) => !v)}
        aria-label="Toggle navigation menu"
        aria-expanded={mobileOpen}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {mobileOpen ? (
            <path d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path d="M3 12h18M3 6h18M3 18h18" />
          )}
        </svg>
      </button>

      {/* Mobile dropdown menu */}
      {mobileOpen && (
        <div className="sm:hidden absolute top-16 left-0 right-0 border-b border-gray-800/60 bg-gray-900/95 backdrop-blur-sm px-6 py-4 flex flex-col gap-3 z-50">
          <Link
            to="/docs"
            className="text-sm text-gray-300 hover:text-white transition"
            onClick={() => setMobileOpen(false)}
          >
            Docs
          </Link>
          <Link
            to="/docs/send-receive-ai-agent"
            className="text-sm text-gray-300 hover:text-white transition"
            onClick={() => setMobileOpen(false)}
          >
            Guides
          </Link>
          <Link
            to="/docs/prompt-injection-dangers"
            className="text-sm text-gray-300 hover:text-white transition"
            onClick={() => setMobileOpen(false)}
          >
            Security
          </Link>
          <Link
            to="/login"
            className="text-sm text-gray-300 hover:text-white transition"
            onClick={() => setMobileOpen(false)}
          >
            Log in
          </Link>
          <Link
            to="/register"
            className="text-sm bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-white font-medium transition text-center"
            onClick={() => setMobileOpen(false)}
          >
            Get started
          </Link>
        </div>
      )}
    </nav>
  );
}
