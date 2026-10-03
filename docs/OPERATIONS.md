# Attendance and transport operations

## Roles and records

- **Transport/Admin:** Bus management, ordered stops with GPS coordinates, driver details, capacity, optional seat allocations, manual or scheduled departure, all-fleet GPS, independent bus attendance, per-bus CSV exports and analytics.
- **Faculty:** Assigned timetable sessions and class rosters, independent bus evidence, classroom RFID capture, face enrollment review, and academic attendance review during the scheduled class time.
- **Student:** My Day and today's timetable, assigned bus route/driver/seat/boarding stop, received GPS, independent class and bus histories, optional hostel history, face enrollment, pending face checks and journey notifications.
- **Parent:** Linked children, the same stored academic and bus records, relevant assigned-bus GPS, route and journey information, and notifications. Parent linking uses student registration number plus the normalized parent mobile number; parent name is not an authentication field.

## Setup

1. Transport adds buses and stores the one-time device key on the corresponding bus reader. This key is shown only immediately after creation; existing device keys are retained when editing a bus.
2. Configure the route's ordered stops with real latitude/longitude and minutes after departure. These times are planned offsets, not traffic-aware ETA predictions. Allocate a student to the correct bus, boarding stop and optional seat. Capacity and seat uniqueness are enforced by the backend. Hostel students can register without a bus.
3. Configure departure time and operating weekdays. Times use `APP_TIMEZONE` (default `Asia/Kolkata`). The server checks departures every 30 seconds and opens at most one scheduled trip per bus per day. Enabling an elapsed departure starts the first eligible trip at the next check. An open trip must be completed before another trip can start.
4. Faculty or Admin configures a timetable with an actual faculty account, period, room, weekday, start and end time. Each timetable period gets its own daily session, even when the same subject repeats.
5. A student explicitly consents and enrolls through the camera in Student → RFID & face. Campus Faculty/Admin checks the portrait against the student's identity and approves it. Enrollment replacement revokes approval until it is checked again. Students activate immediately on registration, while their face enrollment has a separate identity check.

## Bus attendance

`Assigned bus → trip starts → RFID scan → pending face challenge → server verifies camera frames → bus Present → journey → campus arrival → trip completed`

- Trip start creates an expected roster. The bus reader posts the existing authenticated `/api/device/events` packet with `type: RFID_SCAN`, `busCode`, stable `eventId`, actual `rfidUid`, ISO `deviceTimestamp`, and the `X-Device-Key` header.
- Correct-bus scans create a three-minute face challenge. Unregistered and wrong-bus cards remain exception evidence and cannot complete attendance.
- The student or authenticated campus operator opens the pending camera check, captures a frontal frame and the requested head turn. The backend detects exactly one face, compares both frames against the approved descriptor, and checks the requested pose change. A client-supplied `verified` flag cannot mark attendance.
- Only a successful check marks bus attendance **PRESENT** and triggers a boarded notification. RFID receipt time and face verification time are separate fields.
- GPS campus arrival updates arrival information for verified boarded students and sends campus notifications. It creates no academic attendance.
- Completing the trip closes expected or unverified entries as **ABSENT**. Previously verified attendance remains Present.
- Existing RFID-only history is labeled **LEGACY_RFID**. It is never silently promoted to face-verified attendance.

## Class and hostel attendance

`Timetable opens → Faculty starts class → classroom RFID → face verification → Faculty marks Present/Absent/Excused → Student and Parent see the same academic record`

- Faculty sees only its assigned sessions. Attendance actions are permitted only during the corresponding date, weekday and start/end time, checked by the API.
- A bus face check does not substitute for a classroom scan. Faculty must receive classroom RFID and a separate face check before marking **PRESENT**. Absent and Excused are faculty decisions and do not require a face match.
- USB readers that type card UIDs can use the classroom or hostel RFID input. Network classroom/hostel integrations use authenticated staff endpoints: `POST /api/classes/sessions/:id/scan` or `POST /api/hostel/scan` with `rfidUid`. Do not expose staff credentials on public devices.
- Hostel RFID + face completion creates a separate daily hostel record. It does not mark class attendance.
- Face checks use the existing web app camera, not an assumed external face-recognition device. Real readers must transmit the registered hexadecimal UID consistently.

## GPS and notifications

- The bus device sends authenticated `GPS` packets with actual coordinates during an active trip. The API stores each accepted position and broadcasts update signals; dashboards refresh through Socket.IO with periodic REST fallback.
- Student My Bus displays the assigned bus. Parent fleet endpoints return only linked children's buses. Transport sees the full active fleet. No position is invented when GPS is missing; old positions are marked stale after two minutes.
- Map tiles are OpenStreetMap. Dots represent configured stops and dashed lines connect stop order; this is not road routing or simulated movement.
- Distance to the assigned stop generates **approaching** (within 500 m) or **reached** (within 100 m) alerts, once per trip/stop/student/type. Student and linked parents receive their own stored notifications.
- Mobile/background Web Push requires HTTPS, a supported browser, and the user's notification permission. Alerts also appear in-app. Signing out unsubscribes that browser from the account's push delivery. VAPID keys are persisted privately in the database; `WEB_PUSH_CONTACT` can set the transport office HTTPS URL or mailto contact.

## Reports and deletion

- Bus attendance exports are authenticated CSV files, one selected bus per file, including archived buses. Text fields are protected against spreadsheet formula execution.
- Bus deletion removes a bus from the active fleet, clears student assignments and disables its schedule. Historical trips, attendance and device evidence remain in reports. An active or arrived trip must be completed first.
- Analytics show separate bus and class trends, seat utilisation and trip summaries. Downloaded reports include vehicle, driver, route, scheduled/actual departure, arrival/exit, assigned/present/absent/pending counts and attendance percentage.
- AI interpretation uses anonymous database aggregates and the existing server-side OpenRouter configuration. If the AI service is unavailable, charts and numeric reports still work; the UI reports the AI failure.
- Bus history percentage excludes expected, pending and legacy evidence. Academic history excludes provisional records; the current academic percentage counts Excused as a reviewed session, matching the existing portal policy.

## Verification and limits

- `pnpm test` exercises RFID normalization, distance/dwell rules, parent matching, startup retries, descriptor validation, requested head movement and CSV protection.
- Build the backend, then run `railway run node scripts/verify-operations.mjs` from `backend` to exercise real API/database operations in an automatically created and removed `ops_test_*` schema. It validates bus/seat capacity, hostel registration, parent linking, card-only pending status, face enrollment gates, actual WASM inference rejecting a blank frame, class sessions and timetable restrictions, shared portal records, GPS alerts, parent scope, historical deletion/export and scheduled departures. It does not modify public production tables.
- Camera recognition is an additional verification layer. The two-frame head turn is not certified anti-spoofing; photographs/video/deepfakes are not claimed to be impossible. Thresholds and real camera/reader performance require a campus pilot with consenting enrolled students.
- Tests cannot prove a live person's successful camera match or a specific phone's background push delivery without that person/device. Those require on-device acceptance checks. GPS movement requires real incoming hardware coordinates; configured stops and schedules alone do not create GPS.
