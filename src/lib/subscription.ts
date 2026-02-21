import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface UserSubscription {
    isPro: boolean;
    sessionCount: number;
    licenseKey?: string;
    proExpiresAt?: any; // Firestore Timestamp
}

export const FREE_TIER_LIMIT = 5; // Updated to 5

export async function getUserSubscription(uid: string): Promise<UserSubscription> {
    const userDocRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userDocRef);

    if (userSnap.exists()) {
        const data = userSnap.data() as UserSubscription;

        // Lazy-evaluate subscription expiry
        if (data.isPro && data.proExpiresAt) {
            const expiryDate = data.proExpiresAt.toDate ? data.proExpiresAt.toDate() : new Date(data.proExpiresAt.seconds * 1000);
            if (expiryDate < new Date()) {
                // Subscription has expired
                await setDoc(userDocRef, { isPro: false }, { merge: true });
                data.isPro = false;
            }
        }

        return data;
    } else {
        // Create initial default document
        const defaultSub: UserSubscription = { isPro: false, sessionCount: 0 };
        await setDoc(userDocRef, defaultSub);
        return defaultSub;
    }
}

export async function incrementSessionCount(uid: string, currentCount: number): Promise<void> {
    const userDocRef = doc(db, 'users', uid);
    await setDoc(userDocRef, { sessionCount: currentCount + 1 }, { merge: true });
}
