# Digi XBee + Waveshare Ground Link Prep

This note captures the expected ground-side radio chain from the reference photos on April 14, 2026 so the dashboard can be prepared before the full bench hardware is available.

## Expected hardware chain

- Laptop running the Electron ground station
- USB cable into a Waveshare USB-to-XBee adapter
- Digi XBee radio mounted on the adapter
- SMA/coax run from the adapter side to the external panel antenna
- Matching radio/telemetry endpoint on the remote vehicle side

## Important software assumption

The current dashboard already works as a serial monitor and command console. It expects:

- Incoming telemetry as printable ASCII rows, typically CSV-like and newline-delimited
- Outgoing commands as plain text with a trailing newline
- A serial port configured for `115200` baud

Because of that, the safest first integration path is to configure the XBee pair as a transparent UART bridge. If the radios are configured in API frame mode, the current parser will not understand the traffic without additional software changes.

## What the software is ready for now

- COM port discovery and manual selection
- Serial connection from the Electron shell
- Live telemetry parsing and display
- Plain-text command sending
- CSV log export for judge inspection and bench analysis

## Bench checklist when the hardware arrives

1. Confirm the exact XBee model on both ends and make sure the radios are from the same compatible family.
2. Confirm both radios share the same network settings such as channel, PAN/network ID, addressing, and air interface configuration.
3. Confirm the UART side matches the dashboard expectation: `115200`, `8N1`, and no flow control unless the adapter setup explicitly requires it.
4. Start in transparent serial mode first. That matches the current dashboard and keeps debugging simple.
5. Connect the antenna path before longer transmit tests.
6. Plug the Waveshare adapter into the laptop and verify that a new COM port appears in the dashboard.
7. Select that COM port and connect. The dashboard should move to a waiting-data state immediately.
8. Send a harmless command such as `CAL` and check whether the remote side returns a command echo.
9. Verify that telemetry arrives as complete text rows rather than binary-looking frames or corrupted characters.

## First failure checks

- If no new COM port appears, check Windows Device Manager, the USB cable, and the adapter driver.
- If the port appears but the text is garbled, re-check baud rate and UART settings.
- If commands transmit but telemetry never parses, confirm the remote side is sending newline-terminated plain-text rows.
- If the data looks binary or hexadecimal, the radios are likely not in transparent UART mode.

## Open items to confirm on the real bench

- Exact XBee part numbers and supported radio band
- Whether RTS/CTS flow control is needed on the Waveshare adapter
- Whether the flight computer already outputs `115200` plain text continuously
- Whether simulation profile playback should later be forwarded across the radio link
