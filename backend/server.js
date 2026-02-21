require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const admin = require('firebase-admin');

const app = express();

// Initialize Firebase Admin (You will need to provide the Service Account Key on Render)
// For local testing, you can download the serviceAccountKey.json from Firebase Settings -> Service Accounts
try {
    const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!rawKey) {
        throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY environment variable is missing.");
    }

    // Sometimes environment variables can get weirdly escaped
    let parsedKey;
    try {
        parsedKey = JSON.parse(rawKey);
    } catch (parseError) {
        console.warn("Initial JSON parse failed, attempting to unescape newlines...");
        // If it was pasted as a single string and Render escaped the quotes/newlines
        const unescapedKey = rawKey.replace(/\\n/g, '\n');
        parsedKey = JSON.parse(unescapedKey);
    }

    admin.initializeApp({
        credential: admin.credential.cert(parsedKey)
    });
    console.log("Firebase Admin initialized successfully.");
} catch (e) {
    console.error("Failed to initialize Firebase Admin:", e.message);
}

const db = admin.firestore();

// Middleware
app.use(cors());
app.use(express.json());

const razorpayInstance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Auth Middleware
const verifyAuth = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Unauthorized: No token provided' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        req.user = decodedToken;
        next();
    } catch (error) {
        console.error('Error verifying Firebase token:', error);
        return res.status(403).json({ success: false, error: 'Unauthorized: Invalid token' });
    }
};

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', message: 'TalkSync Backend is running!' });
});

// Endpoint to create a new Razorpay Order (Protected)
app.post('/api/create-order', verifyAuth, async (req, res) => {
    const uid = req.user.uid;
    const { coupon } = req.body;

    if (!uid) {
        return res.status(400).json({ error: 'UID is required' });
    }

    let baseAmount = 999; // Base price ₹999
    let finalAmount = baseAmount;

    // Apply Coupon Logic
    if (coupon) {
        if (coupon.trim().toUpperCase() === 'MRRAJ100') {
            finalAmount = 0; // 100% Discount
        } else if (coupon.trim().toUpperCase() === 'TESTTALK1') {
            finalAmount = Math.round(baseAmount * 0.8); // 20% Discount
        } else {
            return res.status(400).json({ success: false, error: 'Invalid discount code' });
        }
    }

    // If perfectly free (100% discount), instantly trigger upgrade and bypass Razorpay
    if (finalAmount === 0) {
        try {
            const licenseKey = 'TS-PRO-' + crypto.randomBytes(8).toString('hex').toUpperCase();
            await db.collection('users').doc(uid).set({
                isPro: true,
                licenseKey: licenseKey,
                paymentId: 'COUPON_MRRAJ100',
                sessionCount: 0,
                upgradedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            // Return amount 0 so frontend knows to skip Razorpay SDK open
            return res.json({ success: true, amount: 0, orderId: null });
        } catch (err) {
            console.error('Failed to apply 100% discount:', err);
            return res.status(500).json({ success: false, error: 'Failed to apply discount' });
        }
    }

    const options = {
        amount: finalAmount * 100, // in paise
        currency: "INR",
        receipt: "receipt_order_" + uid.substring(0, 10),
        notes: {
            uid: uid // Important: this allows our webhook to identify who paid
        }
    };

    try {
        const order = await razorpayInstance.orders.create(options);
        res.json({ success: true, orderId: order.id, amount: order.amount, currency: order.currency });
    } catch (err) {
        console.error('Failed to create Razorpay order:', err);
        res.status(500).json({ success: false, error: 'Could not create payment order' });
    }
});

// The Razorpay Webhook Endpoint
app.post('/api/webhook', async (req, res) => {
    const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;
    const razorpaySignature = req.headers['x-razorpay-signature'];

    // Verify the signature
    const shasum = crypto.createHmac('sha256', WEBHOOK_SECRET);
    shasum.update(JSON.stringify(req.body));
    const digest = shasum.digest('hex');

    if (digest !== razorpaySignature) {
        console.error('Invalid signature');
        return res.status(400).send('Invalid signature');
    }

    const event = req.body;

    // Handle payment successful event
    if (event.event === 'payment.captured' || event.event === 'order.paid') {
        const paymentData = event.payload.payment.entity;

        const uid = paymentData.notes ? paymentData.notes.uid : null;

        if (!uid) {
            console.error('No UID found in payment notes. Cannot assign license.');
            return res.status(400).send('Missing UID in notes');
        }

        const licenseKey = 'TS-PRO-' + crypto.randomBytes(8).toString('hex').toUpperCase();

        try {
            await db.collection('users').doc(uid).set({
                isPro: true,
                licenseKey: licenseKey,
                paymentId: paymentData.id,
                sessionCount: 0,
                upgradedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            console.log(`Successfully upgraded user ${uid} and generated license ${licenseKey}`);
            return res.status(200).json({ status: 'ok' });
        } catch (error) {
            console.error('Error updating Firestore:', error);
            return res.status(500).send('Internal Server Error');
        }
    }

    res.status(200).json({ status: 'ignored' });
});

// Endpoint to manually validate a license key (Protected)
app.post('/api/validate-license', verifyAuth, async (req, res) => {
    const uid = req.user.uid;
    const { licenseKey } = req.body;

    if (!uid || !licenseKey) {
        return res.status(400).json({ success: false, message: 'UID and License Key are required' });
    }

    try {
        const usersRef = db.collection('users');
        const snapshot = await usersRef.where('licenseKey', '==', licenseKey).get();

        if (snapshot.empty) {
            return res.status(404).json({ success: false, message: 'Invalid license key.' });
        }

        const licenseDoc = snapshot.docs[0];

        if (licenseDoc.id !== uid) {
            return res.status(403).json({ success: false, message: 'This license key is already claimed by another user.' });
        }

        await usersRef.doc(uid).set({ isPro: true }, { merge: true });

        return res.json({ success: true, message: 'License key is valid!' });

    } catch (error) {
        console.error('Error validating license:', error);
        return res.status(500).json({ success: false, message: 'An error occurred validating the license key.' });
    }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
