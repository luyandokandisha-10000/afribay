import React, { useState } from 'react';

/**
 * CartModal / Checkout Component for AfriBay
 * Displays items, live ZMW totals, and payment selection (Mobile Money MTN/Airtel/Zamtel & Debit Card).
 */
export default function CartModal({
  isOpen,
  onClose,
  cart = [],
  products = [],
  onUpdateQty,
  onCheckoutSuccess,
  currentUser
}) {
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('mobile_money');
  const [paymentPhone, setPaymentPhone] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const money = (val) =>
    `ZMW ${Number(val || 0).toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const findProduct = (id) => products.find((p) => String(p.id) === String(id));

  const cartItems = cart
    .map((item) => ({ item, product: findProduct(item.id) }))
    .filter((row) => Boolean(row.product));

  const subtotal = cartItems.reduce(
    (sum, { item, product }) => sum + (product.price || 0) * (item.qty || 1),
    0
  );
  const delivery = subtotal ? 35 : 0;
  const total = subtotal + delivery;

  const handleCheckout = async (e) => {
    if (e) e.preventDefault();

    if (!currentUser) {
      setError('Please sign in or create an account to place an order.');
      return;
    }
    if (cart.length === 0) {
      setError('Your cart is empty. Please add items before checking out.');
      return;
    }
    if (paymentMethod === 'mobile_money' && !paymentPhone.trim()) {
      setError('Please enter your mobile money phone number (MTN, Airtel, or Zamtel).');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const trackingId = `AFB-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const order = {
        trackingId,
        items: cartItems.map(({ item, product }) => ({
          productId: String(product.id),
          title: product.title,
          quantity: item.qty,
          priceZMW: Number(product.price || 0)
        })),
        totalZMW: total,
        paymentMethod,
        paymentPhone: paymentMethod === 'mobile_money' ? paymentPhone.trim() : '',
        paymentStatus: 'completed',
        deliveryAddress: deliveryAddress.trim() || 'Lusaka, Zambia',
        createdAt: new Date().toISOString()
      };

      if (onCheckoutSuccess) {
        await onCheckoutSuccess(order);
      }

      if (onClose) onClose();
    } catch (err) {
      console.error('Checkout error:', err);
      setError('Order could not be placed: ' + (err.message || 'Unknown error'));
    } finally {
      // Re-enable button so it never freezes
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop open" onClick={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}>
      <div className="modal" style={{ maxWidth: '500px' }}>
        <div className="modal-head">
          <div>
            <div className="eyebrow">Checkout · ZMW</div>
            <h2>Almost yours</h2>
          </div>
          <button className="close" type="button" onClick={onClose} aria-label="Close modal">×</button>
        </div>

        {/* Error Banner */}
        {error && (
          <div
            className="auth-error visible"
            role="alert"
            style={{
              display: 'block',
              color: '#b3472a',
              background: '#fff0eb',
              borderRadius: '9px',
              padding: '10px 14px',
              fontSize: '13px',
              marginTop: '12px'
            }}
          >
            {error}
          </div>
        )}

        {/* Cart Item Summary */}
        <div style={{ marginTop: '16px', maxHeight: '180px', overflowY: 'auto', borderBottom: '1px solid var(--line, #e4e8e3)', paddingBottom: '12px' }}>
          {cartItems.length === 0 ? (
            <p style={{ color: 'var(--muted, #6b766e)', fontSize: '13px', textAlign: 'center' }}>
              Your cart is empty.
            </p>
          ) : (
            cartItems.map(({ item, product }) => (
              <div
                key={product.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '10px'
                }}
              >
                <div>
                  <strong style={{ fontSize: '14px' }}>{product.title}</strong>
                  <div style={{ fontSize: '12px', color: 'var(--muted, #6b766e)' }}>
                    {money(product.price)} × {item.qty}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {onUpdateQty && (
                    <div className="qty" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        type="button"
                        style={{ border: '1px solid #ccc', borderRadius: '4px', width: '22px', height: '22px' }}
                        onClick={() => onUpdateQty(product.id, -1)}
                      >
                        −
                      </button>
                      <span style={{ fontSize: '12px', fontWeight: 'bold' }}>{item.qty}</span>
                      <button
                        type="button"
                        style={{ border: '1px solid #ccc', borderRadius: '4px', width: '22px', height: '22px' }}
                        onClick={() => onUpdateQty(product.id, 1)}
                      >
                        +
                      </button>
                    </div>
                  )}
                  <span style={{ fontWeight: 800, fontSize: '14px' }}>
                    {money(product.price * item.qty)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Live ZMW Totals */}
        <div style={{ margin: '14px 0', fontSize: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', color: 'var(--muted, #6b766e)' }}>
            <span>Subtotal</span>
            <span>{money(subtotal)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', color: 'var(--muted, #6b766e)' }}>
            <span>Standard delivery</span>
            <span>{money(delivery)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '17px', borderTop: '1px solid var(--line, #e4e8e3)', paddingTop: '10px' }}>
            <span>Total</span>
            <span style={{ color: 'var(--green-deep, #124332)' }}>{money(total)}</span>
          </div>
        </div>

        <form onSubmit={handleCheckout} style={{ marginTop: '16px' }}>
          <div className="form-row">
            <label htmlFor="checkoutAddress">Delivery address</label>
            <input
              id="checkoutAddress"
              type="text"
              placeholder="Street, area, city (e.g. Woodlands, Lusaka)"
              value={deliveryAddress}
              onChange={(e) => setDeliveryAddress(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          {/* Payment Method Selector */}
          <div className="form-row">
            <label>Payment method</label>
            <div className="pay-options" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
              <button
                type="button"
                className={`pay-option ${paymentMethod === 'mobile_money' ? 'selected' : ''}`}
                style={{
                  border: '1px solid var(--line, #e4e8e3)',
                  borderRadius: '11px',
                  padding: '10px 5px',
                  background: paymentMethod === 'mobile_money' ? 'var(--green-soft, #e7f2ec)' : 'white',
                  color: paymentMethod === 'mobile_money' ? 'var(--green-deep, #124332)' : 'var(--muted, #6b766e)',
                  fontWeight: paymentMethod === 'mobile_money' ? 800 : 400,
                  fontSize: '11px',
                  cursor: 'pointer'
                }}
                onClick={() => setPaymentMethod('mobile_money')}
              >
                Mobile Money<br />MTN · Airtel · Zamtel
              </button>
              <button
                type="button"
                className={`pay-option ${paymentMethod === 'card' ? 'selected' : ''}`}
                style={{
                  border: '1px solid var(--line, #e4e8e3)',
                  borderRadius: '11px',
                  padding: '10px 5px',
                  background: paymentMethod === 'card' ? 'var(--green-soft, #e7f2ec)' : 'white',
                  color: paymentMethod === 'card' ? 'var(--green-deep, #124332)' : 'var(--muted, #6b766e)',
                  fontWeight: paymentMethod === 'card' ? 800 : 400,
                  fontSize: '11px',
                  cursor: 'pointer'
                }}
                onClick={() => setPaymentMethod('card')}
              >
                Debit / Credit<br />Visa · Mastercard
              </button>
            </div>
          </div>

          {paymentMethod === 'mobile_money' && (
            <div className="form-row">
              <label htmlFor="checkoutPhone">Mobile money number</label>
              <input
                id="checkoutPhone"
                type="tel"
                placeholder="+260 97..."
                value={paymentPhone}
                onChange={(e) => setPaymentPhone(e.target.value)}
                required
                disabled={loading}
              />
            </div>
          )}

          <p style={{ fontSize: '11px', color: 'var(--muted, #6b766e)', marginTop: '10px' }}>
            Test checkout mode: no real money will be charged.
          </p>

          <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: '9px', marginTop: '20px' }}>
            <button
              type="button"
              className="button ghost"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              className="button"
              type="submit"
              disabled={loading || cartItems.length === 0}
            >
              {loading ? 'Processing...' : `Pay now · ${money(total)}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
