/**
 * Reserved service email addresses.
 *
 * Certain addresses are core to AI Guard's own service (support,
 * contact, help, info, admin, postmaster, etc.) and must never be
 * claimed as a user's custom mailbox. Mail received at any of these
 * addresses is forwarded to the project admin instead of being stored
 * against a user account.
 *
 * The custom email is derived as `<username>@<EMAIL_DOMAIN>`, so we
 * reserve the *local part* (username) regardless of the configured
 * domain. This keeps `help@aiguard.email`, `contact@aiguard.email`,
 * `info@aiguard.info`, and `support@aiguard.email` (and their siblings
 * on any configured domain) unclaimable.
 */

/** Reserved local parts / usernames that cannot be registered. */
export const RESERVED_LOCAL_PARTS: ReadonlySet<string> = new Set([
  'help',
  'contact',
  'info',
  'support',
  'admin',
  'postmaster',
  'abuse',
  'mailer-daemon',
  'noreply',
  'no-reply',
  'root',
  'security',
  'team',
  'hello',
  'sales',
  'billing',
  'feedback',
  'privacy',
  'legal',
]);

/** True when the username's local part is reserved for service use. */
export function isReservedUsername(username: string): boolean {
  return RESERVED_LOCAL_PARTS.has(username.trim().toLowerCase());
}

/** Extract the bare local part from an email address (lowercased). */
function localPart(email: string): string {
  const at = email.indexOf('@');
  return (at === -1 ? email : email.slice(0, at)).trim().toLowerCase();
}

/** True when the email address's local part is reserved for service use. */
export function isReservedCustomEmail(email: string): boolean {
  return RESERVED_LOCAL_PARTS.has(localPart(email));
}