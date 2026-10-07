import React, { useState } from 'react';

/**
 * ProductFeed Component for AfriBay
 * Displays active products with category filters, condition badges, and fully functional:
 * - 👁 View Product details modal
 * - 🏬 View Shop storefront modal
 * - Add to Cart with tactile button animation & feedback
 */
export default function ProductFeed({
  products = [],
  onAddToCart,
  onViewProduct,
  onViewShop,
  onStartSelling
}) {
  const [activeCategory, setActiveCategory] = useState('All');
  const [conditionFilter, setConditionFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [likedIds, setLikedIds] = useState(new Set());
  const [addedMap, setAddedMap] = useState({});
  const [toast, setToast] = useState('');

  // Internal modal states ensuring buttons ALWAYS work even standalone
  const [modalProduct, setModalProduct] = useState(null);
  const [modalShopProduct, setModalShopProduct] = useState(null);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);

  const categories = [
    { label: 'All finds', value: 'All' },
    { label: '👕 Clothes', value: 'Clothing' },
    { label: '🚙 Cars', value: 'Cars' },
    { label: '📷 Electronics', value: 'Electronics' },
    { label: '✦ New goods', value: 'New Goods' }
  ];

  const conditionLabels = {
    new: '✦ New',
    used_like_new: '★ Like new',
    used_good: '◎ Good'
  };

  const money = (val) =>
    `ZMW ${Number(val || 0).toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const showToastMsg = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const toggleLike = (id) => {
    setLikedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddToCart = (product, e) => {
    // Tactile button animation
    setAddedMap((prev) => ({ ...prev, [product.id]: true }));
    setTimeout(() => {
      setAddedMap((prev) => ({ ...prev, [product.id]: false }));
    }, 1200);

    showToastMsg(`Added "${product.title}" to cart`);

    if (onAddToCart) {
      onAddToCart(product.id, e?.currentTarget);
    }
  };

  const handleViewProduct = (product) => {
    setCurrentSlideIndex(0);
    setModalProduct(product);
    if (onViewProduct) onViewProduct(product.id);
  };

  const handleViewShop = (product) => {
    setModalShopProduct(product);
    if (onViewShop) onViewShop(product.id);
  };

  const filtered = products.filter((p) => {
    const matchCategory =
      activeCategory === 'All' ||
      p.category === activeCategory ||
      (activeCategory === 'Clothing' && (p.categoryCode === 'clothes' || p.category === 'Clothing')) ||
      (activeCategory === 'Cars' && (p.categoryCode === 'cars' || p.category === 'Cars')) ||
      (activeCategory === 'Electronics' && (p.categoryCode === 'electronics' || p.category === 'Electronics')) ||
      (activeCategory === 'New Goods' && (p.categoryCode === 'new_goods' || p.category === 'New Goods'));

    const matchCondition =
      conditionFilter === 'All' || p.condition === conditionFilter;

    const q = searchQuery.toLowerCase().trim();
    const matchSearch =
      !q ||
      `${p.title} ${p.category} ${p.location} ${p.seller}`.toLowerCase().includes(q);

    return matchCategory && matchCondition && matchSearch;
  });

  // Calculate seller's catalog when viewing shop
  const shopCatalog = modalShopProduct
    ? products.filter(
        (p) =>
          (modalShopProduct.shopId && p.shopId === modalShopProduct.shopId) ||
          (modalShopProduct.seller &&
            p.seller &&
            p.seller.toLowerCase() === modalShopProduct.seller.toLowerCase())
      )
    : [];

  const displayCatalog =
    shopCatalog.length > 0
      ? shopCatalog
      : modalShopProduct
      ? [
          modalShopProduct,
          ...products
            .filter((p) => String(p.id) !== String(modalShopProduct.id))
            .slice(0, 3)
        ]
      : [];

  return (
    <div className="section" style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 clamp(18px, 5vw, 72px)', position: 'relative' }}>
      {/* Toast Alert */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: '96px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--ink, #12211a)',
            color: 'white',
            padding: '12px 20px',
            borderRadius: '12px',
            fontSize: '13px',
            fontWeight: 700,
            zIndex: 9999,
            boxShadow: '0 10px 30px rgba(0,0,0,0.2)'
          }}
        >
          ✓ {toast}
        </div>
      )}

      {/* Search & Condition Filter */}
      <div className="search-row" style={{ display: 'flex', gap: '12px', margin: '0 0 26px' }}>
        <div className="search-box" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid var(--line, #e4e8e3)', background: 'white', borderRadius: '15px', padding: '0 15px', minHeight: '51px' }}>
          <span>⌕</span>
          <input
            type="text"
            placeholder="Search clothes, cars, electronics..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%', border: 0, outline: 0, background: 'transparent' }}
          />
        </div>
        <select
          className="filter-btn"
          value={conditionFilter}
          onChange={(e) => setConditionFilter(e.target.value)}
          style={{ border: '1px solid var(--line, #e4e8e3)', background: 'white', minWidth: '51px', borderRadius: '15px', padding: '0 12px' }}
        >
          <option value="All">Any condition</option>
          <option value="new">New</option>
          <option value="used_like_new">Used · Like new</option>
          <option value="used_good">Used · Good</option>
        </select>
      </div>

      {/* Category Pills */}
      <div className="categories" style={{ display: 'flex', gap: '10px', overflowX: 'auto', padding: '0 0 7px' }}>
        {categories.map((cat) => (
          <button
            key={cat.value}
            type="button"
            className={`category ${activeCategory === cat.value ? 'active' : ''}`}
            onClick={() => setActiveCategory(cat.value)}
            style={{
              flex: '0 0 auto',
              border: '1px solid var(--line, #e4e8e3)',
              background: activeCategory === cat.value ? 'var(--green, #1c6b4d)' : 'white',
              color: activeCategory === cat.value ? 'white' : 'var(--muted, #6b766e)',
              borderRadius: '999px',
              padding: '10px 15px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Promo banner */}
      <div className="promo" style={{ margin: '34px 0', padding: '25px 28px', borderRadius: '22px', background: 'var(--green-deep, #124332)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '22px' }}>
        <div>
          <strong style={{ fontSize: '20px' }}>Turn your closet into cash.</strong>
          <p style={{ margin: '7px 0 0', color: '#c7d8cf', fontSize: '13px' }}>
            Open your free shop and reach people looking for your kind of find.
          </p>
        </div>
        <button
          type="button"
          className="button light"
          style={{ background: 'white', color: 'var(--green-deep, #124332)' }}
          onClick={onStartSelling}
        >
          Start selling
        </button>
      </div>

      {/* Products Grid */}
      <div className="section-head" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', margin: '35px 0 16px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '25px' }}>Fresh on the market</h2>
          <p style={{ color: 'var(--muted, #6b766e)', margin: '5px 0 0', fontSize: '13px' }}>
            Handpicked finds from shops near you
          </p>
        </div>
      </div>

      <div className="product-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '17px' }}>
        {filtered.length === 0 ? (
          <div className="empty" style={{ gridColumn: '1 / -1', padding: '45px 20px', textAlign: 'center', color: 'var(--muted, #6b766e)' }}>
            No finds match that search yet.<br />
            <button
              type="button"
              className="button ghost"
              style={{ marginTop: '14px' }}
              onClick={() => { setSearchQuery(''); setConditionFilter('All'); setActiveCategory('All'); }}
            >
              Clear search
            </button>
          </div>
        ) : (
          filtered.map((p) => {
            const isLiked = likedIds.has(p.id);
            const isAdded = Boolean(addedMap[p.id]);
            const imageUrl = p.imageUrls?.find?.((u) => /^https:\/\//i.test(u));

            return (
              <article
                key={p.id}
                className="product-card"
                style={{
                  border: '1px solid var(--line, #e4e8e3)',
                  background: 'var(--card, #ffffff)',
                  borderRadius: '18px',
                  overflow: 'hidden'
                }}
              >
                <div style={{ position: 'relative' }}>
                  <div
                    className={`product-image ${p.artClass || 't1'}`}
                    style={{
                      height: '215px',
                      margin: '8px',
                      borderRadius: '13px',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: '75px',
                      position: 'relative',
                      background: '#f2f5f3'
                    }}
                  >
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={p.title}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }}
                      />
                    ) : (
                      <span>{p.art || '✦'}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    className={`heart ${isLiked ? 'liked' : ''}`}
                    style={{
                      position: 'absolute',
                      right: '16px',
                      top: '16px',
                      width: '33px',
                      height: '33px',
                      border: 0,
                      borderRadius: '50%',
                      background: 'rgba(255,255,255,.85)',
                      color: isLiked ? 'var(--orange, #ed7a45)' : '#516059',
                      fontSize: '16px',
                      cursor: 'pointer'
                    }}
                    onClick={() => toggleLike(p.id)}
                  >
                    {isLiked ? '♥' : '♡'}
                  </button>
                </div>

                <div className="product-info" style={{ padding: '5px 14px 15px' }}>
                  <h3 style={{ margin: 0, fontSize: '15px' }}>{p.title}</h3>
                  <div className="price-line" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginTop: '9px' }}>
                    <span className="price" style={{ fontWeight: 900, color: 'var(--green-deep, #124332)' }}>
                      {money(p.price)}
                    </span>
                    <span className="verified" style={{ color: 'var(--green, #1c6b4d)', fontSize: '11px', fontWeight: 800 }}>
                      ✓ verified
                    </span>
                  </div>

                  {/* Condition Badge */}
                  <div
                    className={`cond-badge cond-${p.condition || 'used_good'}`}
                    style={{
                      display: 'inline-block',
                      fontSize: '10px',
                      fontWeight: 900,
                      borderRadius: '6px',
                      padding: '3px 7px',
                      marginTop: '6px',
                      background: p.condition === 'new' ? '#e7f2ec' : (p.condition === 'used_like_new' ? '#fff9e5' : '#f2f4f1'),
                      color: p.condition === 'new' ? '#1c6b4d' : (p.condition === 'used_like_new' ? '#8a6800' : '#6b766e')
                    }}
                  >
                    {conditionLabels[p.condition] || '◎ Good'}
                  </div>

                  <div className="location" style={{ color: 'var(--muted, #6b766e)', fontSize: '11px', marginTop: '7px' }}>
                    {p.location || 'Zambia'} · {p.seller || 'AfriBay seller'}
                  </div>

                  {/* Functional Action Buttons */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '9px' }}>
                    <button
                      type="button"
                      className="button ghost"
                      style={{ padding: '8px 4px', fontSize: '12px', width: '100%', cursor: 'pointer' }}
                      onClick={() => handleViewProduct(p)}
                    >
                      👁 View Product
                    </button>
                    <button
                      type="button"
                      className="button ghost"
                      style={{ padding: '8px 4px', fontSize: '12px', width: '100%', cursor: 'pointer' }}
                      onClick={() => handleViewShop(p)}
                    >
                      🏬 View Shop
                    </button>
                  </div>

                  <button
                    type="button"
                    className="button"
                    style={{
                      width: '100%',
                      marginTop: '7px',
                      padding: '9px',
                      background: isAdded ? 'var(--green-deep, #124332)' : 'var(--green, #1c6b4d)',
                      color: 'white',
                      transition: 'all 0.2s',
                      cursor: 'pointer'
                    }}
                    onClick={(e) => handleAddToCart(p, e)}
                  >
                    {isAdded ? '✓ Added!' : 'Add to cart'}
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>

      {/* ── Built-in Product Details Modal ── */}
      {modalProduct && (
        <div
          className="modal-backdrop open"
          style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(17,34,26,.45)', zIndex: 9000, alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={(e) => { if (e.target === e.currentTarget) setModalProduct(null); }}
        >
          <div className="modal" style={{ width: 'min(500px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: 'white', borderRadius: '24px', padding: '24px', boxShadow: '0 25px 70px rgba(0,0,0,0.2)' }}>
            <div className="modal-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div className="eyebrow" style={{ color: 'var(--green, #1c6b4d)', fontSize: '12px', fontWeight: 800 }}>Marketplace Listing</div>
                <h2 style={{ margin: '4px 0 0', fontSize: '20px' }}>{modalProduct.title}</h2>
              </div>
              <button
                type="button"
                className="close"
                style={{ border: 0, background: '#f1f4f1', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer' }}
                onClick={() => setModalProduct(null)}
              >
                ×
              </button>
            </div>

            {(() => {
              const slides = [];
              if (Array.isArray(modalProduct.imageUrls) && modalProduct.imageUrls.length > 0) {
                modalProduct.imageUrls.forEach((u, i) => {
                  if (u && /^https?:\/\//i.test(u)) slides.push({ type: 'image', src: u, label: `Photo ${i + 1}` });
                });
              }
              if (slides.length === 0) {
                slides.push({ type: 'art', art: modalProduct.art || '✦', artClass: modalProduct.artClass || 't1', label: 'Photo 1' });
              }
              if (modalProduct.videoUrl) {
                slides.push({ type: 'video', src: modalProduct.videoUrl, label: 'Video Ad' });
              }
              const safeIndex = currentSlideIndex < slides.length ? currentSlideIndex : 0;
              const currentSlide = slides[safeIndex];

              return (
                <div>
                  {/* Slide Carousel Viewer */}
                  <div style={{ position: 'relative', margin: '14px 0 8px', borderRadius: '16px', overflow: 'hidden', background: '#f2f5f3', border: '1px solid var(--line, #e4e8e3)' }}>
                    <div style={{ width: '100%', height: '240px', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {currentSlide.type === 'video' ? (
                        <video src={currentSlide.src} controls autoPlay loop playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#173d30' }} />
                      ) : currentSlide.src ? (
                        <img src={currentSlide.src} alt={modalProduct.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ fontSize: '70px' }}>{currentSlide.art || '✦'}</div>
                      )}
                    </div>

                    {slides.length > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={() => setCurrentSlideIndex((safeIndex - 1 + slides.length) % slides.length)}
                          style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '10px', width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(255,255,255,0.85)', border: '1px solid rgba(0,0,0,0.1)', cursor: 'pointer', zIndex: 5, fontSize: '16px', fontWeight: 900 }}
                        >
                          ‹
                        </button>
                        <button
                          type="button"
                          onClick={() => setCurrentSlideIndex((safeIndex + 1) % slides.length)}
                          style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', right: '10px', width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(255,255,255,0.85)', border: '1px solid rgba(0,0,0,0.1)', cursor: 'pointer', zIndex: 5, fontSize: '16px', fontWeight: 900 }}
                        >
                          ›
                        </button>
                      </>
                    )}

                    <div style={{ position: 'absolute', bottom: '10px', right: '10px', background: 'rgba(18,33,26,0.78)', color: 'white', padding: '3px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 800 }}>
                      {safeIndex + 1} / {slides.length}
                    </div>

                    <div style={{ position: 'absolute', top: '10px', left: '10px', background: currentSlide.type === 'video' ? 'var(--orange, #ed7a45)' : 'var(--green-deep, #124332)', color: 'white', padding: '3px 8px', borderRadius: '8px', fontSize: '10px', fontWeight: 800 }}>
                      {currentSlide.type === 'video' ? '▶ Video Ad' : 'Photo'}
                    </div>
                  </div>

                  {/* Thumbnail Strip */}
                  {slides.length > 1 && (
                    <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', padding: '2px 2px 10px' }}>
                      {slides.map((s, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setCurrentSlideIndex(idx)}
                          style={{
                            width: '52px',
                            height: '52px',
                            borderRadius: '10px',
                            flex: '0 0 auto',
                            border: idx === safeIndex ? '2px solid var(--green, #1c6b4d)' : '2px solid transparent',
                            overflow: 'hidden',
                            cursor: 'pointer',
                            background: '#e9ece9',
                            display: 'grid',
                            placeItems: 'center',
                            padding: 0
                          }}
                        >
                          {s.type === 'video' ? (
                            <span style={{ fontSize: '16px', color: 'var(--green-deep, #124332)', fontWeight: 900 }}>▶</span>
                          ) : s.src ? (
                            <img src={s.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <span style={{ fontSize: '20px' }}>{s.art || '✦'}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Attached Video Ad Box */}
                  {modalProduct.videoUrl && (
                    <div style={{ marginTop: '10px', borderRadius: '12px', padding: '12px', background: 'linear-gradient(135deg, #fdf8eb, #f5efe1)', border: '1px solid #ebd9b5' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ background: 'var(--orange, #ed7a45)', color: 'white', fontSize: '10px', fontWeight: 900, borderRadius: '6px', padding: '2px 6px' }}>✦ Featured Video Ad</span>
                          <strong style={{ fontSize: '12px', color: 'var(--green-deep, #124332)' }}>Seller Ad</strong>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const vidIdx = slides.findIndex((sl) => sl.type === 'video');
                            if (vidIdx >= 0) setCurrentSlideIndex(vidIdx);
                          }}
                          style={{ border: 0, background: 'none', color: 'var(--green, #1c6b4d)', fontSize: '11px', fontWeight: 800, cursor: 'pointer' }}
                        >
                          Play in slides ▶
                        </button>
                      </div>
                      <div style={{ borderRadius: '8px', overflow: 'hidden', maxHeight: '130px', background: '#173d30' }}>
                        <video src={modalProduct.videoUrl} muted loop playsInline controls style={{ width: '100%', height: '120px', objectFit: 'cover', display: 'block' }} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            <p className="price" style={{ fontSize: '22px', fontWeight: 900, color: 'var(--green-deep, #124332)', margin: '10px 0 6px' }}>
              {money(modalProduct.price)}
            </p>

            <p style={{ color: 'var(--muted, #6b766e)', fontSize: '13px', lineHeight: 1.5, margin: '8px 0 16px' }}>
              {modalProduct.description || 'Verified marketplace listing on AfriBay. Contact seller directly or order with Zambia Mobile Money.'}
            </p>

            <div className="auth-card" style={{ padding: '14px', borderRadius: '14px', border: '1px solid var(--line, #e4e8e3)', background: '#fdfdfd' }}>
              <strong>{modalProduct.seller || 'AfriBay Seller'}</strong>
              <div style={{ color: 'var(--muted, #6b766e)', fontSize: '12px', marginTop: '4px' }}>
                {modalProduct.location || 'Lusaka, Zambia'} · {conditionLabels[modalProduct.condition] || 'Good condition'}
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="button ghost"
                  style={{ padding: '7px 12px', fontSize: '12px', cursor: 'pointer' }}
                  onClick={() => {
                    const prod = modalProduct;
                    setModalProduct(null);
                    handleViewShop(prod);
                  }}
                >
                  🏬 View Shop
                </button>
                <a
                  className="button ghost"
                  href={`https://wa.me/${(modalProduct.contactPhone || '+260971234567').replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ padding: '7px 12px', fontSize: '12px', textDecoration: 'none' }}
                >
                  WhatsApp seller
                </a>
                <a
                  className="button ghost"
                  href={`tel:${(modalProduct.contactPhone || '+260971234567').replace(/[^\d+]/g, '')}`}
                  style={{ padding: '7px 12px', fontSize: '12px', textDecoration: 'none' }}
                >
                  Call seller
                </a>
              </div>
            </div>

            <div style={{ marginTop: '18px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                className="button ghost"
                style={{ cursor: 'pointer' }}
                onClick={() => setModalProduct(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="button"
                style={{ cursor: 'pointer' }}
                onClick={(e) => {
                  handleAddToCart(modalProduct, e);
                  setModalProduct(null);
                }}
              >
                Add to cart · {money(modalProduct.price)} →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Built-in Shop Profile Modal ── */}
      {modalShopProduct && (
        <div
          className="modal-backdrop open"
          style={{ display: 'flex', position: 'fixed', inset: 0, background: 'rgba(17,34,26,.45)', zIndex: 9000, alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={(e) => { if (e.target === e.currentTarget) setModalShopProduct(null); }}
        >
          <div className="modal" style={{ width: 'min(640px, 100%)', maxHeight: '90vh', overflowY: 'auto', background: 'white', borderRadius: '24px', padding: '24px', boxShadow: '0 25px 70px rgba(0,0,0,0.2)' }}>
            <div className="modal-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div className="eyebrow" style={{ color: 'var(--green, #1c6b4d)', fontSize: '12px', fontWeight: 800 }}>Verified Storefront</div>
                <h2 style={{ margin: '4px 0 0', fontSize: '20px' }}>{modalShopProduct.seller || "Seller's Corner"}</h2>
              </div>
              <button
                type="button"
                className="close"
                style={{ border: 0, background: '#f1f4f1', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer' }}
                onClick={() => setModalShopProduct(null)}
              >
                ×
              </button>
            </div>

            <div className="auth-card" style={{ padding: '16px', borderRadius: '16px', border: '1px solid var(--line, #e4e8e3)', marginTop: '14px', background: '#fcfdfc' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ width: '50px', height: '50px', borderRadius: '16px', background: 'var(--green-deep, #124332)', color: 'white', display: 'grid', placeItems: 'center', fontWeight: 900, fontSize: '18px' }}>
                  {(modalShopProduct.seller || 'AF').slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div style={{ display: 'inline-block', background: 'var(--green-soft, #e7f2ec)', color: 'var(--green-deep, #124332)', borderRadius: '20px', padding: '3px 8px', fontSize: '11px', fontWeight: 800 }}>
                    ● Verified Merchant
                  </div>
                  <h3 style={{ margin: '3px 0 0', fontSize: '17px' }}>{modalShopProduct.seller}</h3>
                  <div style={{ color: 'var(--muted, #6b766e)', fontSize: '12px' }}>{modalShopProduct.location || 'Lusaka, Zambia'}</div>
                </div>
              </div>
              <p style={{ color: 'var(--muted, #6b766e)', fontSize: '13px', margin: '12px 0 8px', lineHeight: 1.4 }}>
                Explore all verified items listed by {modalShopProduct.seller}. Instant ordering with Zambian Mobile Money.
              </p>
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <a
                  className="button ghost"
                  href={`https://wa.me/${(modalShopProduct.contactPhone || '+260971234567').replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ padding: '7px 12px', fontSize: '12px', textDecoration: 'none' }}
                >
                  WhatsApp Seller
                </a>
                <a
                  className="button ghost"
                  href={`tel:${(modalShopProduct.contactPhone || '+260971234567').replace(/[^\d+]/g, '')}`}
                  style={{ padding: '7px 12px', fontSize: '12px', textDecoration: 'none' }}
                >
                  Call Seller
                </a>
              </div>
            </div>

            <div style={{ margin: '20px 0 12px' }}>
              <h3 style={{ margin: 0, fontSize: '16px' }}>Catalog from this seller ({displayCatalog.length} items)</h3>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px' }}>
              {displayCatalog.map((item) => (
                <div
                  key={item.id}
                  style={{
                    border: '1px solid var(--line, #e4e8e3)',
                    borderRadius: '14px',
                    padding: '10px',
                    background: 'white'
                  }}
                >
                  <div style={{ height: '110px', borderRadius: '10px', background: '#f5f7f5', display: 'grid', placeItems: 'center', fontSize: '40px', overflow: 'hidden' }}>
                    {item.imageUrls?.[0] ? (
                      <img src={item.imageUrls[0]} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span>{item.art || '✦'}</span>
                    )}
                  </div>
                  <strong style={{ display: 'block', fontSize: '13px', margin: '8px 0 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.title}
                  </strong>
                  <div style={{ color: 'var(--green-deep, #124332)', fontWeight: 800, fontSize: '13px' }}>
                    {money(item.price)}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '8px' }}>
                    <button
                      type="button"
                      className="button ghost"
                      style={{ padding: '6px 2px', fontSize: '11px', cursor: 'pointer' }}
                      onClick={() => {
                        setModalShopProduct(null);
                        handleViewProduct(item);
                      }}
                    >
                      Details
                    </button>
                    <button
                      type="button"
                      className="button"
                      style={{ padding: '6px 2px', fontSize: '11px', cursor: 'pointer' }}
                      onClick={(e) => handleAddToCart(item, e)}
                    >
                      + Cart
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: '20px', textAlign: 'right' }}>
              <button
                type="button"
                className="button ghost"
                style={{ cursor: 'pointer' }}
                onClick={() => setModalShopProduct(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
