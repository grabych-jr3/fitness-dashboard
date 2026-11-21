import { useEffect } from 'react'

/** Living colour background + the SVG filter used for refraction on Chromium. */
export default function Background() {
  useEffect(() => {
    // Only Chromium renders SVG filters inside backdrop-filter. WebKit (all iPhone browsers) ignores
    // the whole declaration, so there we keep the CSS-only glass.
    const ua = navigator.userAgent
    const isChromium = /Chrome\/|Edg\//.test(ua) && !/iPhone|iPad|iPod/.test(ua)
    document.documentElement.classList.toggle('lg-refract', isChromium)
  }, [])

  return (
    <>
      <div className="lg-bg" aria-hidden="true">
        <div className="lg-blob" />
        <div className="lg-blob" />
        <div className="lg-blob" />
        <div className="lg-blob" />
      </div>
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <filter id="lg-refract" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.008 0.012" numOctaves="2" seed="7" result="noise" />
          <feGaussianBlur in="noise" stdDeviation="2" result="soft" />
          <feDisplacementMap in="SourceGraphic" in2="soft" scale="38" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
    </>
  )
}
