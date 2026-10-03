# AfriBay — Modern Zambian Marketplace

AfriBay is a full-featured web marketplace and video feed platform tailored for Zambia's new and second-hand (thrift) goods economy.

## 🚀 Key Features

- **🛍️ Verified Marketplace (Home Feed):**
  - Instant category filtering: Clothing, Cars, Electronics, and New Goods.
  - Condition badges: *✦ New*, *★ Like new*, and *◎ Good*.
  - **👁 View Product**: Detailed item specifications, pricing in Zambian Kwacha (ZMW), description, and direct contact options (WhatsApp & Call seller).
  - **🏬 View Shop**: Dedicated shop profile modal showcasing the seller's storefront, verified badge, and full product catalog.
  - **Tactile Add-to-Cart**: Real-time feedback with instant badge counters.

- **✦ 100% Free Video Ads Feed:**
  - TikTok-style vertical short video feed for shops to showcase their inventory.
  - Free video ad creation: 24h, 7-day, and 30-day durations with zero fees.
  - Instant "Buy Now", "Product", and "Shop" shortcuts directly on video cards.

- **🏬 Seller Workspace & Storefront:**
  - One-click shop creation with name, phone, description, and custom logo upload.
  - Product listing builder with photo upload, category, price, and condition.
  - Live seller metrics: Total views, active listings, and live video campaigns.

- **🛒 Cart, Orders & Zambian Mobile Money Checkout:**
  - Real-time cart calculation in ZMW including standard delivery fee.
  - Seamless support for Zambian Mobile Money (**MTN**, **Airtel**, **Zamtel**) and Debit Cards.
  - Order tracking references generated upon checkout.
  - **📦 Your Orders & Payouts**: Full order history modal to review past purchases and delivery addresses.

- **🔐 Firebase Backend & Authentication:**
  - **Firebase Auth**: Email/password registration and Google OAuth sign-in.
  - **Cloud Firestore**: Persistent storage for marketplace products, shops, video ads, cart sync, and orders.
  - **Firebase Storage**: Secure media uploads for shop logos, listing photos, and short promo videos.

## 🛠️ Project Structure

```text
├── index.html                     # Main application entry point
├── afrothrift-prototype (2).html   # Standalone HTML application mirror
├── .gitignore                     # Git ignore rules
├── src/
│   ├── firebase.js                # Firebase configuration & initialization
│   ├── firestore.js               # Cloud Firestore & Storage service helpers
│   ├── AuthModal.jsx              # React Auth Modal export
│   ├── CartModal.jsx              # React Cart Modal export
│   ├── ProductFeed.jsx            # React Product Feed export
│   ├── VideoAdsFeed.jsx           # React Video Ads Feed export
│   └── components/                # Modular React/ES6 components
```

## 🌐 Running Locally

You can run AfriBay directly in any modern web browser or serve it using any static HTTP server:

```bash
# With python
python -m http.server 3000

# Or with npx serve
npx serve .
```

Open `http://localhost:3000` to view the marketplace.
