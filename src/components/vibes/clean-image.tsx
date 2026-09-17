/**
 * Client-side hook for removing the Meta AI watermark from images.
 *
 * Given a raw image URL (from vibes.ai CDN or the download endpoint),
 * returns a cleaned URL that routes through the server-side MI-GAN
 * inpainting pipeline. The watermark in the bottom-right corner is
 * automatically removed before the image reaches the browser.
 *
 * Usage:
 *   const cleanUrl = useCleanImage(rawUrl)
 *   return <img src={cleanUrl} />
 *
 * If the image is from vibes.ai's CDN (scontent-*.fbcdn.net), it's routed
 * through POST /api/vibes/watermark/clean. If it's already a relative
 * /api/vibes/... URL, ?clean=true is appended.
 *
 * The cleaning happens lazily — the hook returns a blob URL once the
 * cleaned image is ready, and falls back to the original URL while loading
 * or if cleaning fails.
 */

'use client'

import { useEffect, useState } from 'react'

// In-memory cache: raw URL → cleaned blob URL (per browser session).
// This prevents re-cleaning the same image on every render.
const cache = new Map<string, string>()

/** True if the URL is a vibes.ai CDN image (needs proxy cleaning). */
function isCdnUrl(url: string): boolean {
  return (
    url.includes('fbcdn.net') ||
    url.includes('vibes.ai') ||
    url.startsWith('https://video-sin') ||
    url.startsWith('https://scontent-')
  )
}

/** True if the URL is already one of our API routes. */
function isApiUrl(url: string): boolean {
  return url.startsWith('/api/vibes/')
}

/**
 * Clean an image URL by routing it through the MI-GAN inpainting pipeline.
 * Returns a promise that resolves to a blob URL of the cleaned image,
 * or the original URL if cleaning fails.
 */
async function cleanImageUrl(rawUrl: string): Promise<string> {
  // Check cache first
  const cached = cache.get(rawUrl)
  if (cached) return cached

  try {
    let response: Response

    if (isApiUrl(rawUrl)) {
      // For our own API routes, just append ?clean=true
      const url = new URL(rawUrl, window.location.origin)
      url.searchParams.set('clean', 'true')
      response = await fetch(url.toString())
    } else if (isCdnUrl(rawUrl)) {
      // For CDN URLs, POST to the clean endpoint
      response = await fetch('/api/vibes/watermark/clean', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: rawUrl }),
      })
    } else {
      // Unknown URL type — return as-is
      return rawUrl
    }

    if (!response.ok) {
      return rawUrl
    }

    // Check if cleaning actually happened
    const removed = response.headers.get('X-Watermark-Removed')
    if (removed === 'false') {
      // Model unavailable or cleaning failed — return original
      // (still cache to avoid retrying)
      cache.set(rawUrl, rawUrl)
      return rawUrl
    }

    // Convert to blob URL
    const blob = await response.blob()
    const blobUrl = URL.createObjectURL(blob)
    cache.set(rawUrl, blobUrl)
    return blobUrl
  } catch {
    // On any error, return the original URL
    return rawUrl
  }
}

/**
 * Hook that returns a watermark-cleaned image URL.
 *
 * While the cleaned version is being prepared, the original URL is returned
 * (so the image displays immediately, then swaps to the cleaned version).
 *
 * @param rawUrl The original image URL (CDN URL or /api/vibes/... path)
 * @returns The cleaned URL (blob: or original on failure)
 */
export function useCleanImage(rawUrl: string | undefined | null): string {
  const [state, setState] = useState<{
    rawUrl: string | undefined | null
    cleanUrl: string
  }>(() => ({
    rawUrl,
    cleanUrl: rawUrl ?? '',
  }))

  // Adjust state during render when the rawUrl changes — the React-recommended
  // pattern that avoids setState-in-effect warnings. Check the cache
  // synchronously so cached images swap without a flash.
  if (state.rawUrl !== rawUrl) {
    if (!rawUrl) {
      setState({ rawUrl, cleanUrl: '' })
    } else {
      const cached = cache.get(rawUrl)
      setState({ rawUrl, cleanUrl: cached ?? rawUrl })
    }
  }

  useEffect(() => {
    if (!rawUrl) return

    let active = true

    // If it was a cache hit, nothing to do
    if (cache.get(rawUrl)) return

    // Otherwise, fetch the cleaned version asynchronously
    cleanImageUrl(rawUrl).then((cleaned) => {
      if (active && cleaned !== rawUrl) {
        setState((prev) =>
          prev.rawUrl === rawUrl ? { ...prev, cleanUrl: cleaned } : prev,
        )
      }
    })

    return () => {
      active = false
    }
  }, [rawUrl])

  return state.cleanUrl
}

/**
 * Hook that cleans multiple image URLs in parallel.
 * Returns an array of cleaned URLs (same order as input).
 */
export function useCleanImages(rawUrls: (string | undefined | null)[]): string[] {
  const [cleanUrls, setCleanUrls] = useState<string[]>(
    rawUrls.map((u) => u ?? ''),
  )

  useEffect(() => {
    let active = true

    // Clean all in parallel
    Promise.all(
      rawUrls.map((url) =>
        url ? cleanImageUrl(url) : '',
      ),
    ).then((cleaned) => {
      if (active) {
        setCleanUrls(cleaned)
      }
    })

    return () => {
      active = false
    }
  }, [rawUrls.join('|')])

  return cleanUrls
}

/**
 * A React component wrapper that renders an <img> with the watermark
 * automatically removed. Drop-in replacement for <img src={url} />.
 */
export function CleanImage({
  src,
  alt,
  className,
  ...props
}: React.ImgHTMLAttributes<HTMLImageElement>) {
  const cleanSrc = useCleanImage(src)
  return <img src={cleanSrc} alt={alt} className={className} {...props} />
}
