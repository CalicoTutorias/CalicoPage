"use client";

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './MarkdownContent.module.css';

/**
 * Shared Markdown renderer for news posts.
 *
 * Used by BOTH the public feed and the admin live-preview so what the admin
 * sees is exactly what gets published.
 *
 * Security: react-markdown builds JSX (no dangerouslySetInnerHTML) and
 * `skipHtml` drops any raw HTML embedded in the content. Do not add
 * rehype-raw here — the JWT lives in localStorage, so an XSS equals account
 * takeover (see docs/PATTERNS.md → XSS Prevention).
 */
export default function MarkdownContent({ content }) {
  if (!content) return null;

  return (
    <div className={styles.markdown}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
