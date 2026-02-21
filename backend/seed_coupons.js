require('dotenv').config({ path: '../.env' });
const admin = require('firebase-admin');

// Ensure we have the service account key
const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!rawKey) {
    console.error("Missing FIREBASE_SERVICE_ACCOUNT_KEY in .env");
    process.exit(1);
}

let parsedKey;
try {
    const unescapedKey = rawKey.replace(/\\n/g, '\n');
    parsedKey = JSON.parse(unescapedKey);
} catch (e) {
    console.error("Failed to parse Service Account Key:", e.message);
    process.exit(1);
}

// Initialize Firebase Admin
admin.initializeApp({
    credential: admin.credential.cert(parsedKey)
});

const db = admin.firestore();

const seedCoupons = async () => {
    console.log("Seeding coupons into Firestore...");

    const coupons = [
        {
            id: 'MRRAJ100',
            discountType: 'percentage', // percentage or fixed
            discountValue: 100, // 100% off
            active: true,
            description: '100% Free Lifetime Bypass'
        },
        {
            id: 'TESTTALK1',
            discountType: 'percentage',
            discountValue: 20, // 20% off
            active: true,
            description: '20% off Launch Discount'
        }
    ];

    const batch = db.batch();

    for (const coupon of coupons) {
        const docRef = db.collection('coupons').doc(coupon.id);
        batch.set(docRef, coupon);
        console.log(`Prepared coupon: ${coupon.id} (-${coupon.discountValue}%)`);
    }

    try {
        await batch.commit();
        console.log("\n✅ Successfully seeded coupons to Firestore!");
    } catch (error) {
        console.error("❌ Failed to seed coupons:", error);
    }

    process.exit(0);
};

seedCoupons();
