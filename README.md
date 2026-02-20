# CanSat Ground Station Dashboard

Web dashboard for CanSat telemetry playback and monitoring.

## What it does

- Displays mission status and key telemetry values.
- Plays telemetry packet-by-packet from CSV files (teammate format supported).
- Shows rolling plots for altitude, voltage, and IMU channels.
- Updates a 3D orientation model from gyro values.
- Provides GPS coordinate display with a direct map link.
- Includes command panel UI with command echo.

## How to use

1. Open `dashboard.html` with VS Code Live Server (usually `http://localhost:5500/dashboard.html`).
2. Use **Load Telemetry CSV** to import telemetry logs (for example from your teammate ZIP).
3. Control playback with play/pause, speed selector, and timeline scrubber.

## Tech stack

- HTML
- CSS
- JavaScript (ES modules)
- Three.js (for 3D view)

## Notes

- This is a frontend dashboard. There is no serial/MQTT backend wired yet.
- If no CSV is loaded, demo telemetry is generated automatically.
