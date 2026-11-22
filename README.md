# AfriBay — Exclusive Single-Seller Storefront & E-Commerce Platform

AfriBay is a curated single-seller e-commerce web application and storefront owned and operated exclusively by **Luyando Kandisha** (`luyandokandisha@gmail.com`). 

The platform offers verified fashion, thrift, electronics, vehicles, and premium goods with automated Zambian Mobile Money checkout, courier navigation, and direct email notifications.

---

## 🚀 Storefront Highlights

- **🛍️ Official Store Catalog:**
  - Curated, high-quality inventory managed exclusively by the store owner.
  - Instant category filtering: **Clothing**, **Cars**, **Electronics**, and **New Goods**.
  - Condition badges: *✦ New*, *★ Like new*, and *◎ Good*.
  - **👁 View Details & Inquire**: Comprehensive item specs, pricing in Zambian Kwacha (ZMW), image carousels, and instant direct messaging.
  - **Tactile Cart & Checkout**: Real-time ZMW calculations and item quantity adjustments.

- **✉️ Direct Message & Inquiry Routing:**
  - Shoppers can send inquiries directly from any product or from the navigation menu.
  - Inquiries route straight to the owner's personal inbox (`luyandokandisha@gmail.com`) via `POST /api/messages`.
  - Fast communication with official WhatsApp and phone hotlines (**MTN: 0760312951**, **Airtel: 0778085670**).

- **🔒 Exclusive Store Owner Administration:**
  - Inventory management, product creation, photo/video uploads, and deletion restricted strictly to `luyandokandisha@gmail.com`.
  - Non-owner visitor accounts act as shoppers who can browse, message, add to cart, and place orders.

- **🚚 Zambian Mobile Money & Escrow Checkout:**
  - Seamless payments powered by **PawaPay** and **Flutterwave** across **MTN MoMo**, **Airtel Money**, and **Zamtel**.
  - **Pay on Delivery (POD)**: Customers inspect their goods upon delivery and pay via cash or direct mobile money transfer to official store lines:
    - **MTN MoMo:** `0760312951`
    - **Airtel Money:** `0778085670`
  - Automated 6-digit drop-off PIN generated on checkout for courier handover verification.
  - Instant order dispatch emails sent to `luyandokandisha@gmail.com` detailing customer name, phone, items, total ZMW, and Google Maps delivery coordinates.

- **✦ Official Brand Channels & Founder Links:**
  - Facebook Community Group: [AfriBay Facebook Group](https://www.facebook.com/groups/4159169450883484)
  - Nexen Facebook: [Official Profile](https://www.facebook.com/profile.php?id=61575486501290)
  - Instagram: [@real_nextgen_founder](https://www.instagram.com/real_nextgen_founder/)
  - LinkedIn: [NexGen Founder](https://www.linkedin.com/in/nexgen-founder-18518240a/)
  - Reddit: [u/next-gen-founder](https://www.reddit.com/user/next-gen-founder/?persist-lb-on-conversion=true&screen_view_count=1&ext-referrer=SEO)

---

## 🛠️ Project Structure

```text
├── index.html                     # Main application entry point
├── afrothrift-prototype (2).html   # Standalone HTML application mirror (exact parity)
├── test-suite.mjs                 # Comprehensive automated test suite (143 assertions)
├── server/
│   └── app.js                     # Node.js backend: PawaPay, orders, and email routing
├── src/
│   ├── firebase.js                # Firebase configuration & initialization
│   ├── firestore.js               # Cloud Firestore & Storage service helpers
│   └── components/                # React / ES6 modules
└── flutter/                       # Native Flutter mobile location & checkout module
```

---

## 🌐 Running Locally & Testing

### 1. Launch Backend Server & Storefront
```bash
# Start backend server
node server/app.js

# Serve frontend
npx serve .
```

### 2. Run Automated Test Suite
```bash
node test-suite.mjs
```
All 143 automated test assertions verify DOM element integrity, dual-file parity, PawaPay webhooks, escrow flows, and customer email routing.
