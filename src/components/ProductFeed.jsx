import React, { useState } from 'react';

/**
 * ProductFeed Component for AfriBay
 * Displays active products with category filters, condition badges, and add-to-cart actions.
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

  const toggleLike = (id) => {
    setLikedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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

  return (
    <div className="section" style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 clamp(18px, 5vw, 72px)' }}>
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

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '9px' }}>
                    <button
                      type="button"
                      className="button ghost"
                      style={{ padding: '8px 4px', fontSize: '12px', width: '100%' }}
                      onClick={() => onViewProduct && onViewProduct(p.id)}
                    >
                      👁 View Product
                    </button>
                    <button
                      type="button"
                      className="button ghost"
                      style={{ padding: '8px 4px', fontSize: '12px', width: '100%' }}
                      onClick={() => onViewShop ? onViewShop(p.id) : (onViewProduct && onViewProduct(p.id))}
                    >
                      🏬 View Shop
                    </button>
                  </div>

                  <button
                    type="button"
                    className="button"
                    style={{ width: '100%', marginTop: '7px', padding: '9px' }}
                    onClick={(e) => onAddToCart && onAddToCart(p.id, e.currentTarget)}
                  >
                    Add to cart
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
