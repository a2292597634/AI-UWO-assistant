import { describe, expect, it } from 'vitest'
import {
  createImageLoadState,
  markImageFailed,
  markImageLoaded,
  retryImageLoad,
} from '../../miniprogram/runtime/image-load-state'

describe('image load state', () => {
  it('marks one image loaded without changing unrelated page data', () => {
    const state = createImageLoadState(1)
    expect(markImageLoaded(state)).toEqual({ status: 'loaded', retryCount: 0, maxRetries: 1 })
  })

  it('allows one retry and then stops retrying a permanently failed image', () => {
    const initial = createImageLoadState(1)
    const firstFailure = markImageFailed(initial)
    const retry = retryImageLoad(firstFailure)
    const secondFailure = markImageFailed(retry)

    expect(firstFailure).toMatchObject({ status: 'failed', retryCount: 0 })
    expect(retry).toMatchObject({ status: 'loading', retryCount: 1 })
    expect(secondFailure).toMatchObject({ status: 'failed', retryCount: 1 })
    expect(retryImageLoad(secondFailure)).toEqual(secondFailure)
  })
})
