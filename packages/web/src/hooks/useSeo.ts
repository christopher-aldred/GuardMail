import { useEffect } from 'react';

/**
 * Per-page SEO hook: sets document title, meta description, canonical URL,
 * Open Graph, Twitter Card, and Article JSON-LD structured data. Restores
 * the original values on unmount so client-side navigation stays clean.
 *
 * Pass `path` as the URL path (e.g. "/docs/prompt-injection-dangers") so the
 * canonical/OG URLs resolve to the production origin.
 */
export interface SeoOptions {
  title: string;
  description: string;
  path: string;
  /** Optional article metadata for JSON-LD. */
  publishedTime?: string;
  author?: string;
}

const ORIGIN = 'https://aiguard.email';

function upsertMeta(attr: 'name' | 'property', key: string, content: string): () => void {
  const selector = `meta[${attr}="${key}"]`;
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  const existed = !!el;
  const prev = el?.getAttribute('content') ?? '';
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
  return () => {
    if (!existed) el?.remove();
    else if (el) el.setAttribute('content', prev);
  };
}

function upsertLink(rel: string, href: string): () => void {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  const existed = !!el;
  const prev = el?.getAttribute('href') ?? '';
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
  return () => {
    if (!existed) el?.remove();
    else if (el) el.setAttribute('href', prev);
  };
}

const JSONLD_ID = 'guardmail-article-jsonld';

function upsertJsonLd(scriptContent: string): () => void {
  let el = document.getElementById(JSONLD_ID) as HTMLScriptElement | null;
  const prev = el?.textContent ?? '';
  if (!el) {
    el = document.createElement('script');
    el.id = JSONLD_ID;
    el.type = 'application/ld+json';
    document.head.appendChild(el);
  }
  el.textContent = scriptContent;
  return () => {
    if (!prev) el?.remove();
    else if (el) el.textContent = prev;
  };
}

export function useSeo(opts: SeoOptions): void {
  const { title, description, path, publishedTime, author } = opts;
  const url = `${ORIGIN}${path}`;

  useEffect(() => {
    const prevTitle = document.title;
    document.title = title;

    const cleanups: (() => void)[] = [
      upsertMeta('name', 'description', description),
      upsertLink('canonical', url),
      upsertMeta('property', 'og:title', title),
      upsertMeta('property', 'og:description', description),
      upsertMeta('property', 'og:url', url),
      upsertMeta('property', 'og:type', 'article'),
      upsertMeta('property', 'og:site_name', 'AI Guard Mail'),
      upsertMeta('name', 'twitter:card', 'summary'),
      upsertMeta('name', 'twitter:title', title),
      upsertMeta('name', 'twitter:description', description),
    ];

    if (publishedTime) {
      cleanups.push(upsertMeta('property', 'article:published_time', publishedTime));
    }

    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: title,
      description,
      url,
      mainEntityOfPage: { '@type': 'WebPage', '@id': url },
      author: { '@type': 'Organization', name: author ?? 'AI Guard Mail' },
      publisher: {
        '@type': 'Organization',
        name: 'AI Guard Mail',
        url: ORIGIN,
      },
      ...(publishedTime ? { datePublished: publishedTime } : {}),
    };
    cleanups.push(upsertJsonLd(JSON.stringify(jsonLd)));

    return () => {
      document.title = prevTitle;
      cleanups.reverse().forEach((fn) => fn());
    };
  }, [title, description, url, publishedTime, author]);
}