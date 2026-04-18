# Skybound Ground Station Dashboard Presentation

Requirement-aligned slide draft based on the reference deck. Keep the deck limited to the topics listed in the GCS Software requirement slide.

## Slide 1 - Telemetry Display Screenshot (already prepared)
**Main message**

- Use the dashboard screenshot you already created as the opening software slide.
- Show that telemetry is displayed in one desktop interface: status, metric cards, plots, IMU graphs, GPS, and commands.
- Short line for the slide: telemetry is displayed live in the Electron ground station and can be exported to CSV for inspection.

**Presenter note:** This slide answers the "telemetry display screen shots" requirement visually. Keep the explanation short and use the screenshot to orient the judges before moving into the supporting details.

---

## Slide 2 - Telemetry Recording and Judge Inspection
**How telemetry is recorded**

- Incoming telemetry rows are parsed in the dashboard and kept as structured mission data during the session.
- The **Export Log** action saves the captured session to a `.csv` file.
- The exported file includes the main telemetry fields used by the interface, such as mission time, packet count, mode, state, altitude, temperature, pressure, voltage, current, GPS data, and command echo.
- This gives the team a portable file that can be shown to judges or reviewed after testing.

**Suggested visual:** Small crop of the top bar with **Export Log**, or a small screenshot of a saved CSV opened in a spreadsheet.

**Presenter note:** This is the clean way to answer the "how will it be recorded?" part of the requirement without adding a new feature beyond the current app.

---

## Slide 3 - COTS Software Packages Used
**Software stack**

- **Electron**: desktop shell for running the ground station as a local application.
- **HTML, CSS, JavaScript**: interface layout, telemetry rendering, and UI behavior.
- **SerialPort**: communication with the CanSat telemetry stream over USB serial.
- **Three.js**: live 3D visualization for accelerometer and gyroscope vectors.
- **Built-in browser APIs**: CSV file import/export and embedded map display.

**Presenter note:** Keep this slide close to the reference style: simple list, no extra architecture discussion. The point is to show which off-the-shelf tools were used to build the software.

---

## Slide 4 - Real-Time Plotting Software Design
**How the dashboard presents live data**

- Each valid telemetry packet updates the dashboard immediately.
- The center panel shows rolling plots for **altitude**, **voltage**, **current**, **pressure**, and **temperature**.
- The latest telemetry row also updates the mission status fields and the full telemetry grid.
- The right side of the interface adds live 3D IMU views and a GPS mini map for spatial awareness.
- The plotting is implemented directly in the dashboard using SVG rendering in JavaScript, so the plots stay lightweight and easy to integrate with the rest of the UI.

**Suggested visual:** Full dashboard screenshot with callouts around the plot area and the right-side sensor views.

**Presenter note:** This slide replaces the broad "solution overview" material from the old outline. Stay focused on real-time visualization only.

---

## Slide 5 - Command Software and Interface
**How commands are sent**

- The operator can send commands from the command panel using on-screen buttons.
- Current command buttons are **CAL**, **CX ON**, **CX OFF**, **SIM ENABLE**, and **SIM ACTIVATE**.
- Commands are sent as plain-text strings over the active USB serial connection.
- The interface shows **Last Sent** and **Device Echo** so the operator can confirm what was issued and what the CanSat returned.
- If USB is not connected, the interface still reports that the command was not sent, which helps the operator catch link issues immediately.

**Suggested visual:** Crop of the command panel and the command echo area.

**Presenter note:** Match the winning-team structure here: first explain the operator action, then explain how the software confirms the command.

---

## Slide 6 - Simulation Mode
**Current simulation workflow**

- The operator loads a simulation CSV file through the **Simulation CSV** control in the top bar.
- The dashboard reads the file, normalizes the headers, and builds a local telemetry profile from the CSV.
- The operator can then issue **SIM ENABLE** and **SIM ACTIVATE** from the command panel.
- When no live serial link is connected, the dashboard can replay the loaded profile locally through the same widgets and plots used for live telemetry.
- If a live serial link is connected, the simulation commands still go out over the link instead of replacing incoming telemetry on the desktop.

**Suggested visual:** Screenshot crop of the simulation CSV control plus the command area.

**Presenter note:** This slide is important because the requirement explicitly asks how the profile is read. Be accurate: local playback is implemented in the dashboard, while hardware-side simulation behavior still depends on the connected flight system.

---

## Slide 7 - Progress Since PDR
**What has been completed**

- A working desktop dashboard has been built for live telemetry monitoring.
- The interface already supports USB connection, COM port refresh, live telemetry display, rolling plots, command buttons, CSV export, IMU 3D views, and GPS display.
- The simulation CSV import path is implemented and usable for loading test profiles.
- The next major step is end-to-end testing with hardware, especially full simulation-command workflow and integrated flight validation.

**Presenter note:** Keep this slide honest and short. Judges usually respond better to a clear status update than to a long feature list.
