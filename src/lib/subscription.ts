import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface UserSubscription {
    isPro: boolean;
    sessionCount: number;
    licenseKey?: string;
    proExpiresAt?: any; // Firestore Timestamp
    email?: string | null;
}

export const FREE_TIER_LIMIT = 5; // Updated to 5

export async function getUserSubscription(uid: string, email?: string | null): Promise<UserSubscription> {
    const userDocRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userDocRef);

    if (userSnap.exists()) {
        const data = userSnap.data() as UserSubscription;
        let requiresMerge = false;
        let mergeData: any = {};

        // Sync email if missing or changed
        if (email && data.email !== email) {
            mergeData.email = email;
            requiresMerge = true;
            data.email = email;
        }

        // Lazy-evaluate subscription expiry
        if (data.isPro && data.proExpiresAt) {
            let expiryDate: Date | null = null;
            try {
                expiryDate = data.proExpiresAt.toDate
                    ? data.proExpiresAt.toDate()
                    : new Date(data.proExpiresAt.seconds * 1000);
            } catch {
                // Malformed timestamp - treat as expired
                expiryDate = new Date(0);
            }
            if (!expiryDate || isNaN(expiryDate.getTime()) || expiryDate < new Date()) {
                // Subscription has expired
                mergeData.isPro = false;
                requiresMerge = true;
                data.isPro = false;
            }
        }

        if (requiresMerge) {
            await setDoc(userDocRef, mergeData, { merge: true });
        }

        return data;
    } else {
        // Create initial default document
        const defaultSub: UserSubscription = { isPro: false, sessionCount: 0, email: email || null };
        await setDoc(userDocRef, defaultSub);
        return defaultSub;
    }
}

export async function incrementSessionCount(uid: string, currentCount: number): Promise<void> {
    const userDocRef = doc(db, 'users', uid);
    await setDoc(userDocRef, { sessionCount: currentCount + 1 }, { merge: true });
}
