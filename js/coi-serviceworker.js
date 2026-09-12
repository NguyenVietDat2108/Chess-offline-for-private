/*! coi-serviceworker - Safe Anti-Loop Edition */
let coepCredentialless = false;

if (typeof window === 'undefined') {
    self.addEventListener("install", () => self.skipWaiting());
    self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

    self.addEventListener("fetch", function (event) {
        const req = event.request;
        if (req.cache === "only-if-cached" && req.mode !== "same-origin") {
            return;
        }

        event.respondWith(
            fetch(req)
                .then((response) => {
                    if (response.status === 0) return response;
                    const newHeaders = new Headers(response.headers);
                    newHeaders.set("Cross-Origin-Embedder-Policy", coepCredentialless ? "credentialless" : "require-corp");
                    newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");

                    return new Response(response.body, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: newHeaders,
                    });
                })
                .catch((e) => fetch(req))
        );
    });
} else {
    (() => {
        // Nếu đã có isolation (hoặc đang chạy serverChess.ps1) thì dừng, KHÔNG reload
        if (window.crossOriginIsolated) {
            console.log("[COI] crossOriginIsolated: TRUE");
            sessionStorage.removeItem("coi_reload_count");
            return;
        }

        // CHỐT CHỐNG RELOAD LIÊN TỤC: Chỉ cho phép reload tối đa 1 lần!
        const reloadCount = parseInt(sessionStorage.getItem("coi_reload_count") || "0", 10);
        if (reloadCount >= 1) {
            console.warn("[COI] Đã reload 1 lần, dừng lại để tránh loop.");
            return;
        }

        const currentScript = document.currentScript;
        const scriptUrl = currentScript ? currentScript.src : "js/coi-serviceworker.js";

        if ("serviceWorker" in navigator) {
            navigator.serviceWorker.register(scriptUrl).then(
                (registration) => {
                    registration.addEventListener("updatefound", () => {
                        sessionStorage.setItem("coi_reload_count", "1");
                        window.location.reload();
                    });

                    if (registration.active && !navigator.serviceWorker.controller) {
                        sessionStorage.setItem("coi_reload_count", "1");
                        window.location.reload();
                    }
                },
                (err) => {
                    console.error("[COI] SW error:", err);
                }
            );
        }
    })();
}