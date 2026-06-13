import { useEffect, useState } from 'react'

/**
 * Subscribe to the global "exam in progress" flag.
 *
 * `MockExam` sets `document.body.dataset.examActive = 'true'` while the user
 * is taking a timed mock exam, then deletes it on submit. Several surfaces
 * (Footer, cert switcher in the Header island) read this flag to disable
 * themselves and prevent the user from accidentally navigating away
 * mid-exam. Centralising the MutationObserver here keeps the body-attribute
 * subscription DRY.
 *
 * Returns `true` while an exam is active, `false` otherwise.
 */
export function useExamActive(): boolean {
  const [examActive, setExamActive] = useState(
    () => typeof document !== 'undefined' && document.body.dataset.examActive === 'true',
  )

  useEffect(() => {
    if (typeof document === 'undefined') return

    const observer = new MutationObserver(() => {
      setExamActive(document.body.dataset.examActive === 'true')
    })

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-exam-active'],
    })

    return () => observer.disconnect()
  }, [])

  return examActive
}
