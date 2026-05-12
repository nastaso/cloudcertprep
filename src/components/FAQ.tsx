import { ChevronDown } from 'lucide-react'
import { FAQ_ENTRIES, FAQ_CATEGORY_LABEL, FAQ_CATEGORY_ORDER } from '../lib/seo-data'

/**
 * Splits an FAQ answer into text and clickable URL fragments. Keeps the
 * stored answer as plain string (so the JSON-LD in index.html and the
 * visible copy stay in sync) but renders bare URLs as <a> tags for UX.
 */
function renderAnswerWithLinks(answer: string): React.ReactNode[] {
  // Split on URLs but keep them as separate fragments via the capture group.
  const parts = answer.split(/(https?:\/\/[^\s)]+)/g)
  return parts.map((part, i) => {
    if (part.startsWith('http://') || part.startsWith('https://')) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-aws-orange hover:text-aws-orange/80 underline break-all"
        >
          {part}
        </a>
      )
    }
    return <span key={i}>{part}</span>
  })
}

interface FAQProps {
  /**
   * Active cert code. When provided, filters out FAQ entries tagged for
   * other certs. Generic entries (no certCode) always show. Default: show
   * every entry (used by guest landing where multiple cert questions are
   * SEO-relevant).
   */
  certCode?: string
}

/**
 * Visible FAQ section that mirrors the FAQPage JSON-LD in index.html.
 *
 * Google requires the FAQ content to be visible on the page for FAQ rich
 * snippets to be eligible. Schema-only FAQs (no visible counterpart) risk
 * being ignored or flagged as deceptive structured data.
 *
 * Uses native <details>/<summary> for the accordion: zero JS, fully
 * accessible (keyboard, screen reader), no hydration cost.
 */
export function FAQ({ certCode }: FAQProps = {}) {
  const visibleEntries = certCode
    ? FAQ_ENTRIES.filter((e) => !e.certCode || e.certCode === certCode)
    : FAQ_ENTRIES

  // Group visible entries by category, preserving the FAQ_CATEGORY_ORDER. We
  // build a {category -> entries[]} map first so we can skip categories that
  // are empty for the current filter (avoids rendering a heading with no
  // questions below it).
  const grouped = FAQ_CATEGORY_ORDER.map((category) => ({
    category,
    entries: visibleEntries.filter((e) => e.category === category),
  })).filter((g) => g.entries.length > 0)

  return (
    <section aria-labelledby="faq-heading" className="mt-8 md:mt-12">
      <h2 id="faq-heading" className="text-xl md:text-2xl font-semibold text-text-primary mb-4">
        Frequently asked questions
      </h2>
      <div className="space-y-6 md:space-y-8">
        {grouped.map(({ category, entries }) => (
          <div key={category}>
            <h3 className="text-base md:text-lg font-semibold text-text-primary mb-2 md:mb-3">
              {FAQ_CATEGORY_LABEL[category]}
            </h3>
            <div className="space-y-2">
              {entries.map((entry) => (
                <details
                  key={entry.question}
                  className="group bg-bg-card rounded-lg shadow-card overflow-hidden"
                >
                  <summary className="flex items-center justify-between gap-4 px-4 md:px-6 py-3 md:py-4 cursor-pointer list-none text-text-primary font-medium text-sm md:text-base hover:bg-bg-card-hover transition-colors">
                    <span>{entry.question}</span>
                    <ChevronDown className="w-4 h-4 md:w-5 md:h-5 text-text-muted flex-shrink-0 transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="px-4 md:px-6 pb-4 md:pb-5 text-text-muted text-sm md:text-base leading-relaxed space-y-3">
                    {entry.steps ? (
                      <>
                        <p>{entry.steps.intro}</p>
                        <ol className="list-decimal list-outside pl-5 space-y-2 marker:text-text-muted">
                          {entry.steps.items.map((item, i) => (
                            <li key={i}>{renderAnswerWithLinks(item)}</li>
                          ))}
                        </ol>
                        {entry.steps.outro && <p>{entry.steps.outro}</p>}
                      </>
                    ) : (
                      <p>{renderAnswerWithLinks(entry.answer)}</p>
                    )}
                  </div>
                </details>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
