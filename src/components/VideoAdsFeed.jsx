import React, { useRef, useEffect } from 'react';

/**
 * TikTok-Style vertical full-screen swipe video feed for AfriBay Ads
 */
export default function VideoAdsFeed({ ads = [], onBuyNow, onViewDetails, onPromoteItem }) {
  const feedRef = useRef(null);

  useEffect(() => {
    const feed = feedRef.current;
    if (!feed || !('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const video = entry.target.querySelector('video');
          if (!video) return;
          if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
            video.play().catch(() => {});
          } else {
            video.pause();
          }
        });
      },
      { root: feed, threshold: [0.2, 0.6, 0.9] }
    );

    const cards = feed.querySelectorAll('.sponsored-card');
    cards.forEach((card) => observer.observe(card));

    return () => {
      cards.forEach((card) => observer.unobserve(card));
    };
  }, [ads]);

  const money = (val) =>
    `ZMW ${Number(val || 0).toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="section" style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 clamp(18px, 5vw, 72px)' }}>
      <div className="section-head" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '15px', margin: '35px 0 16px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '25px', letterSpacing: '-.05em' }}>Sponsored videos</h2>
          <p style={{ color: 'var(--muted, #6b766e)', margin: '5px 0 0', fontSize: '13px' }}>
            Swipe vertically to watch short ads from marketplace shops
          </p>
        </div>
        <button
          type="button"
          className="button ghost"
          onClick={onPromoteItem}
        >
          Promote My Item
        </button>
      </div>

      <div
        ref={feedRef}
        id="sponsoredFeed"
        className="sponsored-feed"
        style={{
          height: 'min(78vh, 820px)',
          minHeight: '540px',
          overflowY: 'auto',
          scrollSnapType: 'y mandatory',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '18px',
          marginTop: '22px',
          padding: '2px 0 18px'
        }}
      >
        {ads.length === 0 ? (
          <div className="empty ad-feed-empty" style={{ padding: '45px 20px', textAlign: 'center', color: 'var(--muted, #6b766e)', borderRadius: '18px' }}>
            No sponsored short videos are live yet. Check back soon for featured finds.
          </div>
        ) : (
          ads.map((product) => {
            const videoSrc = product.videoUrl || '';
            return (
              <article
                key={product.id}
                className="sponsored-card"
                style={{
                  flex: '0 0 min(76vh, 760px)',
                  minHeight: '520px',
                  width: 'min(440px, 100%)',
                  position: 'relative',
                  border: '1px solid var(--line, #e4e8e3)',
                  background: '#173d30',
                  borderRadius: '22px',
                  overflow: 'hidden',
                  scrollSnapAlign: 'start'
                }}
              >
                {/* Video container */}
                <div className="ad-video" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
                  <span className="ad-label" style={{ position: 'absolute', left: '9px', top: '9px', borderRadius: '6px', padding: '5px 7px', background: 'var(--orange, #ed7a45)', color: 'white', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', zIndex: 2 }}>
                    Sponsored
                  </span>

                  {videoSrc ? (
                    <video
                      src={videoSrc}
                      muted
                      loop
                      playsInline
                      controls
                      preload="metadata"
                      style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }}
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        const fallback = e.currentTarget.parentElement.querySelector('.ad-video-fallback');
                        if (fallback) fallback.style.display = 'grid';
                      }}
                    />
                  ) : null}

                  <div
                    className="ad-video-fallback"
                    style={{
                      height: '100%',
                      display: videoSrc ? 'none' : 'grid',
                      placeItems: 'center',
                      color: 'white',
                      fontSize: '110px',
                      background: 'linear-gradient(145deg, #1c6b4d, #ed7a45 70%, #f8d477)'
                    }}
                  >
                    {product.art || '✦'}
                  </div>

                  <span className="video-duration" style={{ position: 'absolute', right: '9px', bottom: '9px', zIndex: 2, background: 'rgba(0,0,0,.7)', color: 'white', borderRadius: '6px', padding: '4px 6px', fontSize: '10px', fontWeight: 800 }}>
                    ▶ short video
                  </span>
                </div>

                {/* Overlay info */}
                <div
                  className="product-info"
                  style={{
                    position: 'absolute',
                    zIndex: 3,
                    bottom: 0,
                    left: 0,
                    right: 0,
                    padding: '50px 20px 20px',
                    color: 'white',
                    background: 'linear-gradient(180deg, transparent, rgba(0,0,0,.66))'
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: '21px', letterSpacing: '-.02em' }}>{product.title}</h3>
                  <div className="ad-shop" style={{ color: 'rgba(255,255,255,.8)', fontSize: '12px', marginTop: '5px' }}>
                    Shop · {product.seller || 'AfriBay shop'}
                  </div>
                  <div className="price-line" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginTop: '9px' }}>
                    <span className="price" style={{ color: 'white', fontSize: '19px', fontWeight: 900 }}>
                      {money(product.price)}
                    </span>
                    <span className="verified" style={{ color: '#bde8d0', fontSize: '11px', fontWeight: 800 }}>
                      ✓ verified
                    </span>
                  </div>

                  {/* Buy Now button */}
                  <button
                    type="button"
                    className="button"
                    style={{ width: '100%', marginTop: '13px', color: 'var(--green-deep, #124332)', background: 'white' }}
                    onClick={() => onBuyNow && onBuyNow(product.id)}
                  >
                    Buy Now · {money(product.price)}
                  </button>

                  {/* Actions */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '8px' }}>
                    <button
                      type="button"
                      className="button ghost"
                      style={{ width: '100%', padding: '9px 4px', fontSize: '12px' }}
                      onClick={() => onViewDetails && onViewDetails(product.id)}
                    >
                      👁 Details
                    </button>
                    <button
                      type="button"
                      className="button ghost"
                      style={{ width: '100%', padding: '9px 4px', fontSize: '12px' }}
                      onClick={() => onViewDetails && onViewDetails(product.id)}
                    >
                      🏬 Shop
                    </button>
                  </div>

                  {/* Promote Item button (Free) */}
                  <button
                    type="button"
                    className="button"
                    style={{ width: '100%', marginTop: '8px', background: 'var(--orange, #ed7a45)', color: 'white' }}
                    onClick={onPromoteItem}
                  >
                    ✦ Promote Your Item (Free)
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
