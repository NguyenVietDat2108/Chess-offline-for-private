/*! coi-serviceworker v0.1.7 - MIT License */
let coepCredentialless = false;
if (typeof window === 'undefined') {
    self.addEventListener("install", () => self.skipWaiting());
    self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

    self.addEventListener("fetch", function (event) {
        if (event.request.cache === "only-if-cached" && event.request.mode !== "same-origin") {
            return;
        }

        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    if (response.status === 0) {
                        return response;
                    }

                    const newHeaders = new Headers(response.headers);
                    newHeaders.set("Cross-Origin-Embedder-Policy", coepCredentialless ? "credentialless" : "require-corp");
                    newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");

                    return new Response(response.body, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: newHeaders,
                    });
                })
                .catch((e) => console.error(e))
        );
    });
} else {
    (() => {
        const reloadedBySelf = window.sessionStorage.getItem("coiReloadedBySelf");
        window.sessionStorage.removeItem("coiReloadedBySelf");
        const coepDegrade = (reloadedBySelf == "true");

        // Nếu đã có header (như khi chạy qua serverChess.ps1) thì không can thiệp
        if (window.crossOriginIsolated || coepDegrade) {
            return;
        }

        const currentScript = document.currentScript;
        const scriptUrl = currentScript ? currentScript.src : "js/coi-serviceworker.js";

        if ("serviceWorker" in navigator) {
            navigator.serviceWorker.register(scriptUrl).then(
                (registration) => {
                    registration.addEventListener("updatefound", () => {
                        window.sessionStorage.setItem("coiReloadedBySelf", "true");
                        window.location.reload();
                    });

                    if (registration.active && !navigator.serviceWorker.controller) {
                        window.sessionStorage.setItem("coiReloadedBySelf", "true");
                        window.location.reload();
                    }
                },
                (err) => {
                    console.error("COOP/COEP Service Worker error:", err);
                }
            );
        }
    })();
}