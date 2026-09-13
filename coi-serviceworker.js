/*! coi-serviceworker v0.1.7 - MIT License (with Safari & Mobile Safe Reload) */
let coepCredentialless = false;

if (typeof window === "undefined") {
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
        if (window.crossOriginIsolated) {
            console.log("✅ [COI] SharedArrayBuffer đã được bật thành công!");
            try { sessionStorage.removeItem("coiReloaded"); } catch(e){}
            return;
        }

        const scriptUrl = new URL("coi-serviceworker.js", window.location.href).href;

        if ("serviceWorker" in navigator) {
            navigator.serviceWorker.register(scriptUrl, { scope: "./" }).then(
                (registration) => {
                    const doReload = () => {
                        try {
                            if (sessionStorage.getItem("coiReloaded")) {
                                console.warn("[COI] Tránh reload lặp lại trên trình duyệt không hỗ trợ COOP/COEP.");
                                return;
                            }
                            sessionStorage.setItem("coiReloaded", "1");
                        } catch(e){}
                        window.location.reload();
                    };

                    registration.addEventListener("updatefound", () => {
                        doReload();
                    });

                    if (registration.active && !navigator.serviceWorker.controller) {
                        doReload();
                    }
                },
                (err) => {
                    console.error("[COI] Lỗi đăng ký Service Worker:", err);
                }
            );
        }
    })();
}
