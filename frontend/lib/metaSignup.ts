/**
 * Meta Embedded Signup (Tech Provider flow) via the Facebook JS SDK.
 *
 * FB.login returns a short-lived code; the backend exchanges it for the
 * client's business token, subscribes our app to their WABA and registers
 * the number. The WA_EMBEDDED_SIGNUP postMessage tells us which WABA/number
 * the client picked.
 */

import { api } from "@/lib/api";

export type OnboardingType = "cloud_api" | "coexistence";

export interface MetaConfig {
  app_id: string;
  es_config_id: string;
  graph_version: string;
  configured: boolean;
}

export interface OnboardingResult {
  onboarding_id: string;
  phone_number_id: string;
  waba_id: string;
  display_phone_number: string;
  verified_name: string;
  onboarding_type: OnboardingType;
}

declare global {
  interface Window {
    FB: any;
    fbAsyncInit: () => void;
  }
}

export function getMetaConfig() {
  return api.get<MetaConfig>("/meta/config");
}

export function loadFbSdk(config: MetaConfig): Promise<void> {
  return new Promise((resolve, reject) => {
    const init = () => {
      window.FB.init({ appId: config.app_id, cookie: true, xfbml: false, version: config.graph_version });
      resolve();
    };

    if (window.FB) {
      init();
      return;
    }
    window.fbAsyncInit = init;

    if (!document.getElementById("facebook-jssdk")) {
      const s = document.createElement("script");
      s.id = "facebook-jssdk";
      s.src = "https://connect.facebook.net/en_US/sdk.js";
      s.async = true;
      s.defer = true;
      s.crossOrigin = "anonymous";
      s.onerror = () => reject(new Error("Failed to load the Facebook SDK. Check your network or ad blocker."));
      document.head.appendChild(s);
    }
  });
}

/**
 * Opens Meta's Embedded Signup popup and completes onboarding on the backend.
 * Call it directly from a click handler, otherwise the browser blocks the popup.
 */
export function launchEmbeddedSignup(config: MetaConfig, type: OnboardingType): Promise<OnboardingResult> {
  return new Promise((resolve, reject) => {
    if (!window.FB) {
      reject(new Error("Facebook SDK is not loaded yet."));
      return;
    }

    let sessionInfo: { waba_id?: string; phone_number_id?: string } = {};
    let metaError = "";

    function onMessage(event: MessageEvent) {
      if (!event.origin.endsWith("facebook.com")) return;
      let data: any;
      try {
        data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
      console.log("[Meta Embedded Signup] session event:", data);

      if (typeof data.event === "string" && data.event.startsWith("FINISH")) {
        sessionInfo = { waba_id: data.data?.waba_id, phone_number_id: data.data?.phone_number_id };
      } else if (data.event === "ERROR") {
        metaError = data.data?.error_message || "Meta Embedded Signup reported an error.";
      } else if (data.event === "CANCEL") {
        const step = data.data?.current_step;
        metaError = step ? `Meta signup was closed at step "${step}".` : "";
      }
    }
    window.addEventListener("message", onMessage);

    window.FB.login(
      (response: any) => {
        console.log("[Meta Embedded Signup] FB.login response:", response);
        const code: string | undefined = response?.authResponse?.code;
        if (!code) {
          window.removeEventListener("message", onMessage);
          reject(
            new Error(
              metaError ||
                `Meta signup ended without authorization (status: ${response?.status ?? "unknown"}). ` +
                  "If you didn't close the window, check the browser console for details."
            )
          );
          return;
        }
        // The session info message can land just after this callback; the
        // backend looks the IDs up itself if it never arrives.
        setTimeout(() => {
          window.removeEventListener("message", onMessage);
          api
            .post<OnboardingResult>("/meta/embedded-signup", { code, onboarding_type: type, ...sessionInfo })
            .then(resolve, reject);
        }, sessionInfo.waba_id ? 0 : 1500);
      },
      {
        config_id: config.es_config_id,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          setup: {},
          sessionInfoVersion: "3",
          version: "v4",
          ...(type === "coexistence" ? { featureType: "whatsapp_business_app_onboarding" } : {}),
        },
      }
    );
  });
}
