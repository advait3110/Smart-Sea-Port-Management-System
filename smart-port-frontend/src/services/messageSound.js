// =========================================================
// MESSAGE SOUND (Port Communication)
// =========================================================
//
// A short two-tone "beep" made by the browser's own audio
// engine, so no sound file is needed.
//
// Browsers only allow sound after the person has clicked or
// pressed a key on the page at least once. This file listens
// for that first click / key press and switches the sound on
// at that moment.
//

// Two beeps closer together than this are played as one.
const MIN_GAP_MS = 1200;

let audioContext = null;
let lastBeepAt = 0;
let chatPageActive = false;

const createContext = () => {
  if (audioContext) {
    return audioContext;
  }

  const AudioContextClass =
    window.AudioContext || window.webkitAudioContext;

  if (!AudioContextClass) {
    return null;
  }

  try {
    audioContext = new AudioContextClass();
  } catch {
    audioContext = null;
  }

  return audioContext;
};

const unlock = () => {
  const context = createContext();

  if (context && context.state === "suspended") {
    context.resume().catch(() => {});
  }
};

if (typeof window !== "undefined") {
  ["pointerdown", "keydown", "touchstart"].forEach((name) =>
    window.addEventListener(name, unlock, { passive: true })
  );
}

const scheduleBeep = (context) => {
  const start = context.currentTime + 0.01;

  [
    [880, 0],
    [1175, 0.14],
  ].forEach(([frequency, offset]) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    const from = start + offset;

    oscillator.type = "sine";
    oscillator.frequency.value = frequency;

    // Soft start and end, so there is no "click".
    gain.gain.setValueAtTime(0.0001, from);
    gain.gain.exponentialRampToValueAtTime(0.25, from + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, from + 0.14);

    oscillator.connect(gain);
    gain.connect(context.destination);

    oscillator.start(from);
    oscillator.stop(from + 0.16);
  });
};

// Plays the beep. Returns true when a beep was started.
export const playMessageBeep = () => {
  const now = Date.now();

  if (now - lastBeepAt < MIN_GAP_MS) {
    return false;
  }

  const context = createContext();

  if (!context) {
    return false;
  }

  lastBeepAt = now;

  try {
    if (context.state === "running") {
      scheduleBeep(context);
    } else {
      context
        .resume()
        .then(() => {
          if (context.state === "running") {
            scheduleBeep(context);
          }
        })
        .catch(() => {});
    }
  } catch {
    return false;
  }

  return true;
};

// The Port Communication page beeps for its own chats. The bell
// in the top bar beeps on every other page, and stays quiet while
// the chat page is open so that one message never beeps twice.
export const setChatPageActive = (active) => {
  chatPageActive = !!active;
};

export const isChatPageActive = () => chatPageActive;