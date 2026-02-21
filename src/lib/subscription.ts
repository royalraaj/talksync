import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface UserSubscription {
    isPro: boolean;
    sessionCount: number;
    licenseKey?: string;
}

export const FREE_TIER_LIMIT = 2; // For testing

export async function getUserSubscription(uid: string): Promise<UserSubscription> {
    const userDocRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userDocRef);

    if (userSnap.exists()) {
        return userSnap.data() as UserSubscription;
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
