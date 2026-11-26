import { afterEach, describe, expect, it, vi } from 'vitest'

import { copyText } from './clipboard'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('copyText', () => {
  it('copies the exact text when the Clipboard API succeeds', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    await expect(copyText('AWS Cloud Practitioner')).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledOnce()
    expect(writeText).toHaveBeenCalledWith('AWS Cloud Practitioner')
  })

  it.each([
    ['clipboard is absent', {}],
    ['writeText is absent', { clipboard: {} }],
  ])('returns false when %s', async (_description, navigatorStub) => {
    vi.stubGlobal('navigator', navigatorStub)

    await expect(copyText('text')).resolves.toBe(false)
  })

  it('returns false when writing to the clipboard rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('permission denied'))
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    await expect(copyText('text')).resolves.toBe(false)
  })
})
