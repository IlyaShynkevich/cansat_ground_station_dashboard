# Ground Station Dashboard

Desktop ground station app for telemetry monitoring.

## What it does

- Displays mission status and key telemetry values.
- Connects to a serial telemetry source from the desktop app, including USB serial bridges such as a Waveshare-mounted Digi XBee link.
- Loads simulation CSV profiles, including exported telemetry logs, for local playback.
- Exports captured telemetry to CSV.
- Exposes a lightweight phone monitor page over the local network for live telemetry viewing.
- Shows rolling plots for altitude, voltage, and IMU channels.
- Shows live 3D IMU graphs for accelerometer and gyroscope data.
- Provides GPS coordinate display with a direct map link.
- Includes command panel UI with command echo.

## How to run

1. Install dependencies with `npm install`.
2. Start the desktop app with `npm start`.
3. Use **Connect Link** for live telemetry, or load a profile with **Simulation CSV** and then run **SIM ENABLE** plus **SIM ACTIVATE** to replay it locally.
4. Open the **Phone Monitor** URL shown in the desktop app on a phone connected to the same Wi-Fi or hotspot.

## Tech stack

- Electron
- HTML
- CSS
- JavaScript (ES modules)
- Three.js (for IMU 3D graphs)

## Notes

- The app serves the existing dashboard from a local `http://127.0.0.1` origin so browser APIs keep working inside Electron.
- The desktop process now also exposes `phone.html` plus a live `/api/live` feed on the local network so a phone browser can watch telemetry in real time.
- If multiple serial ports are available, the current app shell selects the first exposed serial device.
- For the planned Digi XBee + Waveshare setup, the dashboard currently expects the radio pair to behave like a transparent UART serial bridge.

## Presentation support

- Slide-ready presentation outline: `docs/dashboard_presentation_slides.md`
- Ground-link integration prep: `docs/xbee_waveshare_ground_link.md`
