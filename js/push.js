/*
  DUKAPULSE browser push notifications.
  Uses the existing service worker and authenticated Supabase session.
*/

(() => {
  "use strict";

  const VAPID_PUBLIC_KEY =
    "BI4baGoZcIFsUoFPafNtE3z5omoZuTzQ6WQ6_D9zeQrHrAafl7K2GGPQIh8xrGzJfPIMm7CU52jhta11UmwrJNY";

  const toggle = document.getElementById("settings-push-toggle");
  const message = document.getElementById("settings-push-message");

  if (!toggle || !message) return;

  function showMessage(text, isError = false) {
    message.textContent = text;
    message.classList.toggle("is-error", isError);
  }

  function decodeVapidKey(base64String) {
    const padding = "=".repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    const raw = window.atob(base64);
    return Uint8Array.from(raw, char => char.charCodeAt(0));
  }

  async function enablePush() {
    if (!window.isSecureContext ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)) {
      throw new Error("This browser does not support secure push notifications.");
    }

    if (!window.supabase || !supabaseClient) {
      throw new Error("The Supabase service is not ready.");
    }

    if (!currentUser?.id || !currentBusinessRecord?.id) {
      throw new Error("Please sign in and wait for your business dashboard to load.");
    }

    const permission = await Notification.requestPermission();

    if (permission !== "granted") {
      throw new Error("Notification permission was not granted. Check your browser settings.");
    }

    const registration = await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeVapidKey(VAPID_PUBLIC_KEY)
      });
    }

    const subscriptionData = subscription.toJSON();

    if (!subscriptionData.endpoint ||
        !subscriptionData.keys?.p256dh ||
        !subscriptionData.keys?.auth) {
      throw new Error("The browser returned an incomplete push subscription.");
    }

    const { error } = await supabaseClient
      .from("push_subscriptions")
      .upsert({
        user_id: currentUser.id,
        business_id: currentBusinessRecord.id,
        endpoint: subscriptionData.endpoint,
        p256dh: subscriptionData.keys.p256dh,
        auth: subscriptionData.keys.auth,
        user_agent: navigator.userAgent,
        updated_at: new Date().toISOString()
      }, {
        onConflict: "endpoint"
      });

    if (error) throw error;

    toggle.checked = true;
    showMessage("Browser push notifications are enabled on this device.");
  }

  async function refreshPushStatus() {
    if (!("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        Notification.permission !== "granted") {
      toggle.checked = false;
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      toggle.checked = Boolean(subscription);
    } catch (error) {
      console.error("Could not check push status:", error);
    }
  }

  toggle.addEventListener("change", async () => {
    if (!toggle.checked) {
      toggle.checked = true;
      showMessage(
        "To disable notifications, use your browser's site notification settings."
      );
      return;
    }

    toggle.disabled = true;
    showMessage("Enabling browser push notifications…");

    try {
      await enablePush();
    } catch (error) {
      console.error("Push subscription error:", error);
      toggle.checked = false;
      showMessage(error.message || "Could not enable push notifications.", true);
    } finally {
      toggle.disabled = false;
    }
  });

  window.addEventListener("load", refreshPushStatus);
})();
