import React from "react";

import { MdClose, MdPrint } from "react-icons/md";

import { QRCodeSVG } from "qrcode.react";

import { formatDateTime, printGatePass } from "./gateHelpers";

// =========================================================
// QR PASS DIALOG (show + print)
// =========================================================

export const QrPassDialog = ({ pass, onClose }) => {
  const qrBoxRef = React.useRef(null);
  const [printError, setPrintError] = React.useState("");

  const handlePrint = () => {
    const svg = qrBoxRef.current?.querySelector("svg");

    if (!svg) {
      setPrintError("The QR code is not ready yet.");
      return;
    }

    const opened = printGatePass(pass, svg.outerHTML);

    setPrintError(
      opened
        ? ""
        : "The browser blocked the print window. Allow pop-ups for this site and try again."
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="max-h-full w-full max-w-md overflow-y-auto rounded-[20px] bg-white p-6 shadow-xl dark:bg-navy-800">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-navy-700 dark:text-white">
              Gate Pass
            </h3>

            <p className="mt-1 text-sm text-gray-400">
              Single use. The driver shows this QR code at the gate.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            title="Close"
          >
            <MdClose className="h-6 w-6" />
          </button>
        </div>

        <div
          ref={qrBoxRef}
          className="mx-auto mt-5 w-fit rounded-xl bg-white p-3"
        >
          <QRCodeSVG
            value={pass.code}
            size={220}
            level="M"
            includeMargin
          />
        </div>

        <p className="mt-3 text-center font-mono text-base font-bold tracking-wider text-navy-700 dark:text-white">
          {pass.code}
        </p>

        <dl className="mt-5 space-y-2 text-sm">
          {[
            ["Vehicle", pass.vehicle],
            ["Driver", pass.driver],
            ["Company", pass.company],
            ["Cargo", pass.weight],
            ["Purpose", pass.purpose || "—"],
            ["Valid from", formatDateTime(pass.validFrom)],
            ["Valid until", formatDateTime(pass.validUntil)],
            ["Issued by", pass.issuedBy],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4">
              <dt className="text-gray-400">{label}</dt>
              <dd className="text-right font-medium text-navy-700 dark:text-white">
                {value}
              </dd>
            </div>
          ))}
        </dl>

        {printError && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
            {printError}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-lightPrimary px-5 py-3 text-sm font-bold text-gray-600 transition hover:bg-gray-200 dark:bg-navy-900 dark:text-white"
          >
            Close
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-600"
          >
            <MdPrint className="h-5 w-5" />
            Print
          </button>
        </div>
      </div>
    </div>
  );
};

// =========================================================
// CAMERA QR SCANNER
//
// Uses the browser's built-in BarcodeDetector (no extra
// library). It only exists in some browsers and needs HTTPS
// (or localhost) for camera access. When it is missing, the
// page falls back to the code box, which also works with a
// handheld scanner (it types the code and presses Enter).
// =========================================================

export const QrCameraScanner = ({ onDetected, onClose }) => {
  const videoRef = React.useRef(null);
  const onDetectedRef = React.useRef(onDetected);
  const [cameraError, setCameraError] = React.useState("");

  React.useEffect(() => {
    onDetectedRef.current = onDetected;
  });

  React.useEffect(() => {
    let stopped = false;
    let stream = null;
    let timer = null;

    const stop = () => {
      stopped = true;

      if (timer) {
        clearTimeout(timer);
        timer = null;
      }

      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        stream = null;
      }
    };

    const start = async () => {
      try {
        const detector = new window.BarcodeDetector({
          formats: ["qr_code"],
        });

        const media = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });

        if (stopped) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }

        stream = media;

        const video = videoRef.current;

        if (!video) {
          stop();
          return;
        }

        video.srcObject = media;
        await video.play();

        const scanFrame = async () => {
          if (stopped) {
            return;
          }

          try {
            const codes = await detector.detect(video);

            if (codes.length > 0 && codes[0].rawValue) {
              const value = codes[0].rawValue;

              stop();
              onDetectedRef.current(value);

              return;
            }
          } catch (frameError) {
            // A single bad frame is not fatal: try again.
          }

          if (!stopped) {
            timer = setTimeout(scanFrame, 300);
          }
        };

        scanFrame();
      } catch (startError) {
        if (!stopped) {
          setCameraError(
            startError?.name === "NotAllowedError"
              ? "Camera permission was denied."
              : "Unable to start the camera. Use the code box instead."
          );
        }
      }
    };

    start();

    return stop;
  }, []);

  return (
    <div className="mt-4 rounded-xl bg-black/5 p-3 dark:bg-white/5">
      {cameraError ? (
        <p className="text-sm text-red-600 dark:text-red-400">
          {cameraError}
        </p>
      ) : (
        <video
          ref={videoRef}
          muted
          playsInline
          className="mx-auto max-h-64 w-full rounded-lg bg-black object-contain"
        />
      )}

      <div className="mt-3 flex items-center justify-between">
        <p className="text-xs text-gray-400">
          Point the camera at the QR code on the gate pass.
        </p>

        <button
          type="button"
          onClick={onClose}
          className="rounded-xl bg-lightPrimary px-4 py-2 text-xs font-bold text-gray-600 transition hover:bg-gray-200 dark:bg-navy-900 dark:text-white"
        >
          Stop camera
        </button>
      </div>
    </div>
  );
};