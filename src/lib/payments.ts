import { auth } from './firebase';

// Use Render URL as default fallback
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://talksync-backend-api.onrender.com';

export const loadRazorpayScript = () => {
    return new Promise((resolve) => {
        if ((window as any).Razorpay) {
            resolve(true);
            return;
        }

        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        script.onload = () => {
            resolve(true);
        };
        script.onerror = () => {
            resolve(false);
        };
        document.body.appendChild(script);
    });
};

export const initiateCheckout = async (onSuccess: () => void, onError: (err: any) => void, onProgress?: (msg: string) => void) => {
    onProgress?.("Loading Razorpay SDK...");
    const isScriptLoaded = await loadRazorpayScript();

    if (!isScriptLoaded) {
        throw new Error("Razorpay SDK failed to load. Are you online?");
    }

    // Call our Express Backend to create an Order
    try {
        onProgress?.("Authenticating with server...");
        const token = await auth.currentUser?.getIdToken();
        onProgress?.("Waking up server (can take 50s)...");
        const response = await fetch(`${BACKEND_URL}/api/create-order`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ uid: auth.currentUser?.uid })
        });

        onProgress?.("Processing order data...");
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || "Failed to create order");
        }

        const { orderId, amount, currency } = data;

        const options = {
            key: "rzp_test_RzHwJggZye2yVS", // Provided by user
            amount: amount.toString(),
            currency: currency,
            name: "TalkSync",
            description: "Pro Tier Upgrade",
            image: "https://your-logo-url.com/logo.png", // optionally add logo
            order_id: orderId,
            handler: function (_response: any) {
                // Payment was successful on the client side
                // At this point, the webhook is firing or has already fired to update the DB
                onSuccess();
            },
            prefill: {
                name: auth.currentUser?.displayName || "",
                email: auth.currentUser?.email || "",
            },
            theme: {
                color: "#3b82f6",
            },
        };

        const razorpayOb = new (window as any).Razorpay(options);
        razorpayOb.on("payment.failed", function (response: any) {
            onError(response.error.description);
        });

        onProgress?.("Opening Checkout...");
        razorpayOb.open();

    } catch (err: any) {
        console.error("Payment Error:", err);
        throw err;
    }
};

export const validateLicenseKey = async (key: string) => {
    const token = await auth.currentUser?.getIdToken();
    const response = await fetch(`${BACKEND_URL}/api/validate-license`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ uid: auth.currentUser?.uid, licenseKey: key })
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
        throw new Error(data.message || 'Validation failed');
    }

    return data as { success: boolean, message: string };
};
