/*
  DUKAPULSE PWA registration.
  Keeps installation support separate from the main application.
*/

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .then((registration) => {
        console.info(
          "DUKAPULSE app shell registered:",
          registration.scope
        );
      })
      .catch((error) => {
        console.error(
          "DUKAPULSE service worker registration failed:",
          error
        );
      });
  });
}
