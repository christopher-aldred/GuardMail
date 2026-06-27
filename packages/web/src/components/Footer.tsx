import { Link } from "react-router-dom";

/**
 * Shared public-site footer.
 *
 * Used on every non-logged-in page so the footer is consistent. Includes
 * a "Contact" link to the contact page (kept in the footer, not the nav
 * bar, per the site layout) alongside the tagline.
 */
export function Footer() {
  return (
    <footer className="border-t border-gray-800/60 px-6 py-8 text-center text-sm text-gray-500">
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6">
        <p>AI Guard Mail — Secure AI agent email with LLM Guard protection</p>
        <Link
          to="/contact"
          className="text-gray-400 hover:text-white transition underline-offset-4 hover:underline"
        >
          Contact us
        </Link>
        <Link
          to="https://smithery.ai/servers/afluffysquirrel/mail-guard"
          className="text-gray-400 hover:text-white transition underline-offset-4 hover:underline"
        >
          Smithery
        </Link>
      </div>
    </footer>
  );
}
