const functions = require('firebase-functions');
const admin = require('firebase-admin');
const crypto = require('crypto');
const Razorpay = require('razorpay');

admin.initializeApp();
const db = admin.firestore();

// IMPORTANT: Replace with your actual Razorpay Webhook Secret and API Keys
const WEBHOOK_SECRET = 'YOUR_RAZORPAY_WEBHOOK_SECRET';
const RAZORPAY_KEY_ID = 'YOUR_RAZORPAY_KEY_ID';
const RAZORPAY_KEY_SECRET = 'YOUR_RAZORPAY_KEY_SECRET';

const razorpayInstance = new Razorpay({
    key_id: RAZORPAY_KEY_ID,
    key_secret: RAZORPAY_KEY_SECRET,
});

exports.verifyPaymentAndGenerateKey = functions.https.onRequest(async (req, res) => {
    // Razorpay sends a signature in the headers
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

        // We expect the frontend to pass the user's UID in the 'notes' object when creating the order/payment
        const uid = paymentData.notes ? paymentData.notes.uid : null;

        if (!uid) {
            console.error('No UID found in payment notes. Cannot assign license.');
            return res.status(400).send('Missing UID in notes');
        }

        // Generate a random license key
        const licenseKey = 'TS-PRO-' + crypto.randomBytes(8).toString('hex').toUpperCase();

        try {
            // Update the user's subscription in Firestore
            await db.collection('users').doc(uid).set({
                isPro: true,
                licenseKey: licenseKey,
                paymentId: paymentData.id,
                sessionCount: 0, // Reset counter just in case
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

exports.validateLicenseKey = functions.https.onCall(async (data, context) => {
    // Ensure the user is authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'You must be logged in to validate a license key.');
    }

    const uid = context.auth.uid;
    const { licenseKey } = data;

    if (!licenseKey) {
        throw new functions.https.HttpsError('invalid-argument', 'License key is required.');
    }

    try {
        // Query users collection to find if this license key exists
        const usersRef = db.collection('users');
        const snapshot = await usersRef.where('licenseKey', '==', licenseKey).get();

        if (snapshot.empty) {
            throw new functions.https.HttpsError('not-found', 'Invalid license key.');
        }

        const licenseDoc = snapshot.docs[0];

        // If the key exists but belongs to a different UID
        if (licenseDoc.id !== uid) {
            throw new functions.https.HttpsError('permission-denied', 'This license key is already claimed by another user.');
        }

        // If it's valid and belongs to them, update their local 'isPro' status if not already set
        await usersRef.doc(uid).set({ isPro: true }, { merge: true });

        return { success: true, message: 'License key is valid!' };

    } catch (error) {
        console.error('Error validating license:', error);
        if (error instanceof functions.https.HttpsError) throw error;
        throw new functions.https.HttpsError('internal', 'An error occurred validating the license key.');
    }
});

exports.createOrder = functions.https.onCall(async (data, context) => {
    // Ensure the user is authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'You must be logged in to create an order.');
    }

    const uid = context.auth.uid;

    const options = {
        amount: 2900 * 100, // ₹2900 in paise (Example Pro Tier price)
        currency: "INR",
        receipt: "receipt_order_" + uid.substring(0, 10),
        notes: {
            uid: uid // Important: this allows our webhook to identify who paid
        }
    };

    try {
        const order = await razorpayInstance.orders.create(options);
        return { orderId: order.id, amount: order.amount, currency: order.currency };
    } catch (err) {
        console.error('Failed to create Razorpay order:', err);
        throw new functions.https.HttpsError('internal', 'Could not create payment order');
    }
});
