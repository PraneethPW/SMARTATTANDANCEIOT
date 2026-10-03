export function plannedStopTime(departure: string | null, offset: number) {
  if (!departure) return "Departure not configured";
  const [hours, minutes] = departure.split(":").map(Number);
  const total = hours * 60 + minutes + offset,
    day = Math.floor(total / 1440),
    time = total % 1440;
  return (
    String(Math.floor(time / 60)).padStart(2, "0") +
    ":" +
    String(time % 60).padStart(2, "0") +
    (day ? " (next day)" : "")
  );
}
