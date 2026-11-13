/*
  DUKAPULSE cinematic launch controller.
  Waits for the app to choose its authentication screen.
*/

(() => {
  const screen = document.getElementById("dukapulse-launch");
  if (!screen) return;

  const minimumDisplayTime = 5200;
  const startedAt = Date.now();

  let ready = false;
  let closed = false;
  let fallbackTimer;

  function closeLaunchScreen() {
    if (closed) return;
    closed = true;

    const elapsed = Date.now() - startedAt;
    const remaining = Math.max(0, minimumDisplayTime - elapsed);

    window.setTimeout(() => {
      screen.classList.add("is-hidden");
      screen.setAttribute("aria-hidden", "true");

      window.setTimeout(() => screen.remove(), 800);
    }, remaining);
  }

  window.finishDukaPulseLaunch = () => {
    if (ready) return;
    ready = true;
    window.clearTimeout(fallbackTimer);
    closeLaunchScreen();
  };

  // Never leave the user behind the launch screen indefinitely.
  fallbackTimer = window.setTimeout(
    window.finishDukaPulseLaunch,
    10000
  );
})();
