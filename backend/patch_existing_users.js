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

// Helper to calculate expiry date (6 months from now)
const getSixMonthsFromNow = () => {
    const date = new Date();
    date.setMonth(date.getMonth() + 6);
    return date;
};

const patchExistingUsers = async () => {
    console.log("Looking for existing PRO users in Firestore...");

    try {
        const usersRef = db.collection('users');
        const snapshot = await usersRef.where('isPro', '==', true).get();

        if (snapshot.empty) {
            console.log("No PRO users found. Nothing to update.");
            process.exit(0);
        }

        const batch = db.batch();
        let updatedCount = 0;
        const expiryDate = admin.firestore.Timestamp.fromDate(getSixMonthsFromNow());

        snapshot.forEach(doc => {
            const userData = doc.data();

            // Only update users that don't already have an expiry date set
            if (!userData.proExpiresAt) {
                batch.update(doc.ref, { proExpiresAt: expiryDate });
                console.log(`Prepared update for user: ${doc.id}`);
                updatedCount++;
            }
        });

        if (updatedCount > 0) {
            await batch.commit();
            console.log(`\n✅ Successfully patched ${updatedCount} user(s) with a 6-month expiry date!`);
        } else {
            console.log("\nAll existing PRO users already have an expiry date. Nothing to do.");
        }
    } catch (error) {
        console.error("❌ Failed to patch users:", error);
    }

    process.exit(0);
};

patchExistingUsers();
