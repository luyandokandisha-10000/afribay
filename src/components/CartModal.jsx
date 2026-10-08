import React, { useState, useMemo } from 'react';
import { useFlutterwave, closePaymentModal } from 'flutterwave-react-v3';

/**
 * CartModal / Checkout Component for AfriBay
 * Zambian Marketplace Checkout supporting:
 * - Flutterwave Zambian Mobile Money (MTN, Airtel, Zamtel)
 * - Flutterwave Card Payments (Debit / Credit Visa & Mastercard)
 * - Dynamic ZMW calculation and live item quantity adjustments
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
  const [paymentMethod, setPaymentMethod] = useState('mobile_money'); // 'mobile_money' | 'card'
  const [mobileNetwork, setMobileNetwork] = useState('mtn'); // 'mtn' | 'airtel' | 'zamtel'
  const [paymentPhone, setPaymentPhone] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Format currency in Zambian Kwacha (ZMW)
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

  // Normalize Zambian mobile phone numbers to international standard (+260...)
  const formatZambianPhone = (phone) => {
    let cleaned = phone.replace(/[^\d+]/g, '');
    if (cleaned.startsWith('0')) {
      cleaned = '+260' + cleaned.substring(1);
    } else if (cleaned.startsWith('260')) {
      cleaned = '+' + cleaned;
    } else if (!cleaned.startsWith('+260') && cleaned.length === 9) {
      cleaned = '+260' + cleaned;
    }
    return cleaned;
  };

  // Determine Flutterwave public key
  const flutterwavePublicKey = useMemo(() => {
    let key = '';
    try {
      if (typeof process !== 'undefined' && process.env) {
        key = process.env.REACT_APP_FLUTTERWAVE_PUBLIC_KEY || process.env.VITE_FLUTTERWAVE_PUBLIC_KEY || '';
      }
    } catch (_) {}
    if (!key) {
      try {
        if (typeof import.meta !== 'undefined' && import.meta.env) {
          key = import.meta.env.VITE_FLUTTERWAVE_PUBLIC_KEY || '';
        }
      } catch (_) {}
    }
    // Default test sandbox key for AfriBay Zambia testing if not supplied in env
    return key || 'FLWPUBK_TEST-SANDBOXDEMOKEY-X';
  }, []);

  // Generate unique transaction reference for order
  const txRef = useMemo(() => {
    return `AFB-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }, [isOpen]);

  const formattedPhone = formatZambianPhone(paymentPhone);

  // Flutterwave payment configuration
  const flutterwaveConfig = {
    public_key: flutterwavePublicKey,
    tx_ref: txRef,
    amount: total,
    currency: 'ZMW',
    payment_options: paymentMethod === 'mobile_money' ? 'mobilemoneyzambia, card' : 'card, mobilemoneyzambia',
    customer: {
      email: currentUser?.email || 'shopper@afribay.com',
      phone_number: formattedPhone || '+260971234567',
      name: currentUser?.name || 'AfriBay Shopper'
    },
    customizations: {
      title: 'AfriBay Marketplace Zambia',
      description: `Payment for ${cartItems.length} item(s) (${paymentMethod === 'mobile_money' ? mobileNetwork.toUpperCase() + ' Mobile Money' : 'Card'})`,
      logo: 'https://cdn-icons-png.flaticon.com/512/3081/3081840.png'
    }
  };

  const handleFlutterwavePayment = useFlutterwave(flutterwaveConfig);

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
    if (!deliveryAddress.trim()) {
      setError('Please enter a delivery address.');
      return;
    }
    if (paymentMethod === 'mobile_money') {
      if (!paymentPhone.trim()) {
        setError('Please enter your mobile money number (e.g. 097..., 096..., or 095...).');
        return;
      }
      const cleaned = paymentPhone.replace(/[^\d]/g, '');
      if (cleaned.length < 9) {
        setError('Please enter a valid 9 or 10-digit Zambian phone number.');
        return;
      }
    }

    setError('');
    setLoading(true);

    try {
      // Trigger Flutterwave payment modal
      handleFlutterwavePayment({
        callback: async (response) => {
          console.log('[AfriBay Checkout] Flutterwave payment response:', response);
          closePaymentModal();

          const order = {
            trackingId: txRef,
            flutterwaveTransactionId: response.transaction_id || response.id || null,
            flutterwaveRef: response.flw_ref || null,
            items: cartItems.map(({ item, product }) => ({
              productId: String(product.id),
              title: product.title,
              quantity: item.qty,
              priceZMW: Number(product.price || 0),
              shopName: product.seller || product.shopName || 'AfriBay Shop'
            })),
            totalZMW: total,
            paymentMethod: paymentMethod === 'mobile_money' ? `mobile_money_${mobileNetwork}` : 'card',
            paymentPhone: paymentMethod === 'mobile_money' ? formattedPhone : '',
            paymentStatus: response.status === 'successful' || response.status === 'completed' ? 'completed' : 'pending',
            deliveryAddress: deliveryAddress.trim() || 'Lusaka, Zambia',
            customer: {
              email: currentUser?.email || 'shopper@afribay.com',
              name: currentUser?.name || 'AfriBay Shopper'
            },
            createdAt: new Date().toISOString()
          };

          // Send email alert to luyandokandisha@gmail.com
          try {
            fetch('http://localhost:5000/api/orders/notify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(order)
            }).then(r => r.json()).then(res => {
              console.log('[AfriBay Email Alert] Notification response:', res);
            }).catch(() => {});
          } catch (_) {}

          if (onCheckoutSuccess) {
            await onCheckoutSuccess(order);
          }
          setLoading(false);
          if (onClose) onClose();
        },
        onClose: () => {
          console.log('[AfriBay Checkout] Flutterwave payment modal closed by user');
          setLoading(false);
        }
      });
    } catch (err) {
      console.error('Flutterwave initialization error:', err);
      // Fallback if Flutterwave script blocked or environment error
      setError('Payment gateway error: ' + (err.message || 'Could not launch payment window. Please check your connection.'));
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop open"
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose && !loading) onClose();
      }}
    >
      <div className="modal" style={{ maxWidth: '520px' }}>
        <div className="modal-head">
          <div>
            <div className="eyebrow">Zambia Checkout · ZMW</div>
            <h2>Complete Your Order</h2>
          </div>
          <button
            className="close"
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            disabled={loading}
          >
            ×
          </button>
        </div>

        {/* Error Banner */}
        {error && (
          <div
            className="auth-error visible"
            role="alert"
            style={{
              display: 'block',
              color: '#9b1c1c',
              background: '#fde8e8',
              border: '1px solid #f8b4b4',
              borderRadius: '9px',
              padding: '10px 14px',
              fontSize: '13px',
              marginTop: '12px'
            }}
          >
            ⚠️ {error}
          </div>
        )}

        {/* Cart Item Summary */}
        <div
          style={{
            marginTop: '14px',
            maxHeight: '160px',
            overflowY: 'auto',
            borderBottom: '1px solid var(--line, #e4e8e3)',
            paddingBottom: '10px'
          }}
        >
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
                        style={{ border: '1px solid #ccc', borderRadius: '4px', width: '22px', height: '22px', cursor: 'pointer' }}
                        onClick={() => onUpdateQty(product.id, -1)}
                        disabled={loading}
                      >
                        −
                      </button>
                      <span style={{ fontSize: '12px', fontWeight: 'bold' }}>{item.qty}</span>
                      <button
                        type="button"
                        style={{ border: '1px solid #ccc', borderRadius: '4px', width: '22px', height: '22px', cursor: 'pointer' }}
                        onClick={() => onUpdateQty(product.id, 1)}
                        disabled={loading}
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
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontWeight: 900,
              fontSize: '17px',
              borderTop: '1px solid var(--line, #e4e8e3)',
              paddingTop: '10px'
            }}
          >
            <span>Total to pay</span>
            <span style={{ color: 'var(--green-deep, #124332)' }}>{money(total)}</span>
          </div>
        </div>

        <form onSubmit={handleCheckout} style={{ marginTop: '14px' }}>
          {/* Delivery Address */}
          <div className="form-row">
            <label htmlFor="checkoutAddress">Delivery Address</label>
            <input
              id="checkoutAddress"
              type="text"
              placeholder="e.g. Plot 14, Great East Road, Lusaka"
              value={deliveryAddress}
              onChange={(e) => setDeliveryAddress(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          {/* Payment Method Selector */}
          <div className="form-row">
            <label>Payment Method (via Flutterwave)</label>
            <div className="pay-options" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
              <button
                type="button"
                className={`pay-option ${paymentMethod === 'mobile_money' ? 'selected' : ''}`}
                style={{
                  border: paymentMethod === 'mobile_money' ? '2px solid var(--green, #1e7e59)' : '1px solid var(--line, #e4e8e3)',
                  borderRadius: '11px',
                  padding: '12px 6px',
                  background: paymentMethod === 'mobile_money' ? 'var(--green-soft, #e7f2ec)' : 'white',
                  color: paymentMethod === 'mobile_money' ? 'var(--green-deep, #124332)' : 'var(--muted, #6b766e)',
                  fontWeight: paymentMethod === 'mobile_money' ? 800 : 500,
                  fontSize: '12px',
                  cursor: 'pointer',
                  textAlign: 'center'
                }}
                onClick={() => setPaymentMethod('mobile_money')}
                disabled={loading}
              >
                📱 Mobile Money<br />
                <span style={{ fontSize: '10px', opacity: 0.85 }}>MTN · Airtel · Zamtel</span>
              </button>

              <button
                type="button"
                className={`pay-option ${paymentMethod === 'card' ? 'selected' : ''}`}
                style={{
                  border: paymentMethod === 'card' ? '2px solid var(--green, #1e7e59)' : '1px solid var(--line, #e4e8e3)',
                  borderRadius: '11px',
                  padding: '12px 6px',
                  background: paymentMethod === 'card' ? 'var(--green-soft, #e7f2ec)' : 'white',
                  color: paymentMethod === 'card' ? 'var(--green-deep, #124332)' : 'var(--muted, #6b766e)',
                  fontWeight: paymentMethod === 'card' ? 800 : 500,
                  fontSize: '12px',
                  cursor: 'pointer',
                  textAlign: 'center'
                }}
                onClick={() => setPaymentMethod('card')}
                disabled={loading}
              >
                💳 Debit / Credit Card<br />
                <span style={{ fontSize: '10px', opacity: 0.85 }}>Visa · Mastercard</span>
              </button>
            </div>
          </div>

          {/* Zambian Mobile Money Details */}
          {paymentMethod === 'mobile_money' && (
            <>
              <div className="form-row">
                <label>Select Mobile Money Provider</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                  {[
                    { id: 'mtn', label: 'MTN MoMo', color: '#ffcc00' },
                    { id: 'airtel', label: 'Airtel Money', color: '#ff3333' },
                    { id: 'zamtel', label: 'Zamtel Kwacha', color: '#28a745' }
                  ].map((prov) => (
                    <button
                      key={prov.id}
                      type="button"
                      style={{
                        padding: '8px 4px',
                        borderRadius: '8px',
                        border: mobileNetwork === prov.id ? '2px solid var(--green, #1e7e59)' : '1px solid var(--line, #e4e8e3)',
                        background: mobileNetwork === prov.id ? 'var(--green-soft, #e7f2ec)' : '#fdfdfd',
                        fontWeight: mobileNetwork === prov.id ? 800 : 500,
                        fontSize: '11px',
                        cursor: 'pointer'
                      }}
                      onClick={() => setMobileNetwork(prov.id)}
                      disabled={loading}
                    >
                      {prov.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-row">
                <label htmlFor="checkoutPhone">Zambian Mobile Money Number</label>
                <input
                  id="checkoutPhone"
                  type="tel"
                  placeholder="e.g. 0971234567 or +260 96 1234567"
                  value={paymentPhone}
                  onChange={(e) => setPaymentPhone(e.target.value)}
                  required
                  disabled={loading}
                />
                <small style={{ color: 'var(--muted, #6b766e)', fontSize: '11px', marginTop: '4px', display: 'block' }}>
                  Prompt will be sent directly to your phone for instant mobile pin approval.
                </small>
              </div>
            </>
          )}

          {paymentMethod === 'card' && (
            <div
              style={{
                padding: '12px',
                borderRadius: '8px',
                background: '#f8faf9',
                border: '1px solid var(--line, #e4e8e3)',
                fontSize: '12px',
                color: 'var(--muted, #6b766e)',
                marginBottom: '14px'
              }}
            >
              🔒 Secure Card Payment powered by Flutterwave. Supports all Zambian and international Visa and Mastercard debit/credit cards.
            </div>
          )}

          <div
            className="modal-foot"
            style={{ display: 'flex', justifyContent: 'flex-end', gap: '9px', marginTop: '20px' }}
          >
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
              style={{ minWidth: '170px' }}
            >
              {loading ? 'Opening Flutterwave...' : `Pay · ${money(total)}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
