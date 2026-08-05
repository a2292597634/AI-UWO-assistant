export type ImageLoadStatus = 'idle' | 'loading' | 'loaded' | 'failed'

export interface ImageLoadState {
  status: ImageLoadStatus
  retryCount: number
  maxRetries: number
}

export const createImageLoadState = (maxRetries = 1): ImageLoadState => ({
  status: 'idle',
  retryCount: 0,
  maxRetries: Math.max(0, Math.floor(maxRetries)),
})

export const markImageLoaded = (state: ImageLoadState): ImageLoadState => ({
  ...state,
  status: 'loaded',
})

export const markImageFailed = (state: ImageLoadState): ImageLoadState => ({
  ...state,
  status: 'failed',
})

export const retryImageLoad = (state: ImageLoadState): ImageLoadState =>
  state.status === 'failed' && state.retryCount < state.maxRetries
    ? { ...state, status: 'loading', retryCount: state.retryCount + 1 }
    : state
