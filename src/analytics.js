const analyticsConfigUrl = new URL('./analytics-config.json', import.meta.url)
const pendingEvents = []
const maxPendingEvents = 25
let analyticsState = 'pending'

// The QA flag belongs to this tab so a test journey stays excluded after navigation.
const query = new URLSearchParams(location.search)
const qaKey = 'ddirori-analytics-qa'
function excludeQa() {
  const flag = query.get('qa')
  const test = flag === '1' || query.get('utm_medium') === 'qa' || query.get('utm_source') === 'codex_setup'
  try {
    if (test) sessionStorage.setItem(qaKey, '1')
    else if (flag === '0') sessionStorage.removeItem(qaKey)
    return test || sessionStorage.getItem(qaKey) === '1'
  } catch {
    return test
  }
}
const excluded = !['ddirori.com', 'www.ddirori.com'].includes(location.hostname) || excludeQa()
let initialization

const allowedEventParams = new Set([
  'answer',
  'app_name',
  'activity_context',
  'category',
  'content_slug',
  'content_title',
  'content_type',
  'difficulty',
  'file_name',
  'frequency',
  'help_count',
  'key',
  'link_text',
  'link_url',
  'location',
  'meter',
  'platform',
  'poster_status',
  'recital_status',
  'release_version',
  'reading_minutes',
  'role'
])

const isGa4MeasurementId = (measurementId) =>
  /^G-[A-Z0-9]+$/.test(measurementId)

const disableAnalytics = () => {
  analyticsState = 'disabled'
  pendingEvents.length = 0
}

const sanitizeParams = (params) =>
  Object.fromEntries(
    Object.entries(params).filter(
      ([key, value]) =>
        allowedEventParams.has(key) &&
        value !== undefined &&
        value !== null &&
        value !== ''
    )
  )

const appendScript = (src) =>
  new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.async = true
    script.src = src
    script.addEventListener('load', resolve, { once: true })
    script.addEventListener('error', reject, { once: true })
    document.head.append(script)
  })

const initialize = async () => {
  try {
    const response = await fetch(analyticsConfigUrl)
    if (!response.ok) {
      disableAnalytics()
      return
    }

    const config = await response.json()
    const measurementId = String(config.measurementId ?? '').trim()

    if (
      config.provider !== 'ga4' ||
      config.enabled !== true ||
      !isGa4MeasurementId(measurementId)
    ) {
      disableAnalytics()
      return
    }

    analyticsState = 'ready'
    window.dataLayer = window.dataLayer || []
    window.gtag = function gtag() {
      window.dataLayer.push(arguments)
    }
    window.gtag('js', new Date())
    window.gtag('config', measurementId, {
      send_page_view: true
    })

    while (pendingEvents.length > 0) {
      const [name, params] = pendingEvents.shift()
      trackEvent(name, params)
    }

    await appendScript(
      `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`
    )
  } catch {
    disableAnalytics()
    // Analytics must never block page rendering or navigation.
  }
}

export const configureAnalytics = () => {
  if (excluded) {
    disableAnalytics()
    return Promise.resolve()
  }
  return initialization ??= initialize()
}

export const trackEvent = (name, params = {}) => {
  if (excluded || analyticsState === 'disabled') {
    return
  }

  if (analyticsState !== 'ready') {
    if (pendingEvents.length < maxPendingEvents) {
      pendingEvents.push([name, sanitizeParams(params)])
    }
    return
  }

  window.gtag('event', name, {
    ...sanitizeParams(params),
    app_name: 'Ddirori'
  })
}

export const bindTrackedLinks = () => {
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) {
      return
    }

    const link = event.target.closest('a[data-track-event]')

    if (!link) {
      return
    }

    trackEvent(link.dataset.trackEvent, {
      link_url: link.href,
      link_text: link.textContent?.trim(),
      location: link.dataset.trackLocation,
      platform: link.dataset.trackPlatform,
      file_name: link.dataset.trackFile,
      release_version: link.dataset.trackVersion,
      content_type: link.dataset.trackContentType,
      content_slug: link.dataset.trackContentSlug
    })
  })
}

export const createReadCompletionTracker = () => {
  const completedKeys = new Set()

  return (key, element, eventName, params = {}) => {
    if (!element || completedKeys.has(key)) {
      return
    }

    const listener = () => {
      if (completedKeys.has(key)) {
        window.removeEventListener('scroll', listener)
        window.removeEventListener('resize', listener)
        return
      }

      const rect = element.getBoundingClientRect()
      const hasReachedEnd = rect.bottom <= window.innerHeight + 80

      if (!hasReachedEnd) {
        return
      }

      completedKeys.add(key)
      window.removeEventListener('scroll', listener)
      window.removeEventListener('resize', listener)
      trackEvent(eventName, params)
    }

    window.addEventListener('scroll', listener, { passive: true })
    window.addEventListener('resize', listener)
    window.requestAnimationFrame(listener)
  }
}
