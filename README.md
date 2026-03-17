# Ground Station Dashboard

Desktop ground station app for telemetry monitoring.

## What it does

- Displays mission status and key telemetry values.
- Connects to a USB serial telemetry source from the desktop app.
- Loads simulation pressure data from CSV files.
- Exports captured telemetry to CSV.
- Shows rolling plots for altitude, voltage, and IMU channels.
- Shows live 3D IMU graphs for accelerometer and gyroscope data.
- Provides GPS coordinate display with a direct map link.
- Includes command panel UI with command echo.

## How to run

1. Install dependencies with `npm install`.
2. Start the desktop app with `npm start`.
3. Use **Connect USB** for live telemetry or **Simulation CSV** to load pressure samples.

## Tech stack

- Electron
- HTML
- CSS
- JavaScript (ES modules)
- Three.js (for IMU 3D graphs)

## Notes

- The app serves the existing dashboard from a local `http://127.0.0.1` origin so browser APIs keep working inside Electron.
- If multiple serial ports are available, the current app shell selects the first exposed serial device.
