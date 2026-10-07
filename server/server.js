import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { getFlutterwaveOAuthToken, flutterwaveRequest } from './flutterwave.js';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: '*' }));
app.use(express.json());

// Health check & OAuth Token Verification route
app.get('/api/health', async (req, res) => {
  try {
    const token = await getFlutterwaveOAuthToken();
    res.json({
      status: 'ok',
      service: 'AfriBay Checkout Gateway',
      flutterwaveAuth: 'Connected',
      tokenPreview: `${token.substring(0, 10)}...`
    });
  } catch (err) {
    res.status(500).json({
      status: 'degraded',
      service: 'AfriBay Checkout Gateway',
      flutterwaveAuth: 'Failed',
      error: err.message
    });
  }
});

/**
 * Direct OAuth Token Diagnostic Route
 * Allows testing if client_id and client_secret yield an access token
 */
app.post('/api/auth/token', async (req, res) => {
  try {
    const token = await getFlutterwaveOAuthToken();
    res.json({ success: true, message: 'OAuth token fetched successfully', token });
  } catch (error) {
    res.status(401).json({ success: false, message: error.message });
  }
});

/**
 * Initiate Checkout Route
 * Prepares and initiates a payment for Zambian Kwacha (ZMW)
 */
app.post('/api/checkout/initiate', async (req, res) => {
  try {
    const {
      amount,
      currency = 'ZMW',
      customer,
      paymentMethod = 'mobile_money',
      network = 'mtn',
      phoneNumber,
      txRef,
      redirectUrl
    } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount in ZMW is required' });
    }

    const reference = txRef || `AFB-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    // Request payload for Flutterwave checkout charge
    const chargePayload = {
      tx_ref: reference,
      amount: Number(amount),
      currency: currency.toUpperCase(),
      payment_type: paymentMethod === 'mobile_money' ? 'mobilemoneyzambia' : 'card',
      network: network.toLowerCase(),
      phone_number: phoneNumber,
      redirect_url: redirectUrl || 'http://localhost:5000/api/checkout/callback',
      customer: {
        email: customer?.email || 'shopper@afribay.com',
        name: customer?.name || 'AfriBay Shopper',
        phonenumber: phoneNumber || customer?.phone || '+260971234567'
      },
      customizations: {
        title: 'AfriBay Marketplace Zambia',
        description: 'Payment for order items',
        logo: 'https://cdn-icons-png.flaticon.com/512/3081/3081840.png'
      }
    };

    console.log('[Checkout] Initiating payment request for reference:', reference);

    // Call Flutterwave charge endpoint using OAuth token
    const result = await flutterwaveRequest('/charges', {
      method: 'POST',
      body: JSON.stringify(chargePayload)
    });

    res.json({
      success: true,
      reference,
      chargeResponse: result.data
    });
  } catch (error) {
    console.error('[Checkout Error]:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Payment initiation failed'
    });
  }
});

/**
 * Payment Verification Route
 */
app.get('/api/checkout/verify/:txRef', async (req, res) => {
  try {
    const { txRef } = req.params;
    const result = await flutterwaveRequest(`/transactions/verify-by-reference?tx_ref=${encodeURIComponent(txRef)}`, {
      method: 'GET'
    });

    res.json({
      success: true,
      verification: result.data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Verification lookup failed'
    });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 AfriBay Flutterwave Gateway running at http://localhost:${PORT}`);
  console.log(`   Health & OAuth status: http://localhost:${PORT}/api/health\n`);
});
