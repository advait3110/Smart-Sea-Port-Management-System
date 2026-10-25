// =========================================================
// POLL TIMER (keeps checking for messages in background tabs)
// =========================================================
//
// A normal setInterval is slowed down by the browser when the
// tab is in the background (after about 5 minutes it may run
// only once a minute). That would make new messages show up
// late in a tab you are not looking at.
//
// This timer is driven by a tiny background worker, which the
// browser does not slow down, so messages arrive on time even
// when you are working in another tab.
//
// If the browser cannot create the worker, a normal
// setInterval is used instead (the page still works).
//
// Usage:
//   const stop = startPollTimer(() => load(), 4000);
//   ...
//   stop();
//

export const startPollTimer = (callback, ms) => {
  let worker = null;
  let workerUrl = "";
  let fallbackId = null;
  let stopped = false;

  const run = () => {
    if (stopped) {
      return;
    }

    try {
      callback();
    } catch {
      // The callback handles its own errors.
    }
  };

  const startNormalTimer = () => {
    if (!stopped && fallbackId === null) {
      fallbackId = window.setInterval(run, ms);
    }
  };

  const closeWorker = () => {
    if (worker) {
      try {
        worker.terminate();
      } catch {
        // Already closed.
      }

      worker = null;
    }

    if (workerUrl) {
      try {
        URL.revokeObjectURL(workerUrl);
      } catch {
        // Not important.
      }

      workerUrl = "";
    }
  };

  try {
    if (
      typeof Worker === "undefined" ||
      typeof Blob === "undefined" ||
      !window.URL ||
      typeof window.URL.createObjectURL !== "function"
    ) {
      throw new Error("Workers are not available.");
    }

    const source = `setInterval(function () { postMessage(1); }, ${Number(
      ms
    )});`;

    workerUrl = URL.createObjectURL(
      new Blob([source], { type: "text/javascript" })
    );

    worker = new Worker(workerUrl);

    worker.onmessage = run;

    worker.onerror = () => {
      closeWorker();
      startNormalTimer();
    };
  } catch {
    closeWorker();
    startNormalTimer();
  }

  return () => {
    stopped = true;

    closeWorker();

    if (fallbackId !== null) {
      window.clearInterval(fallbackId);
      fallbackId = null;
    }
  };
};