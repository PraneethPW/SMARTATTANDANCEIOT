import type { Session } from "./api";
export type Role = Session["user"]["role"];
export const roleLabels: Record<Role, string> = {
  ADMIN: "Admin",
  TRANSPORT: "Transport",
  FACULTY: "Faculty",
  STUDENT: "Student",
  PARENT: "Parent",
};
export const dashboardPaths: Record<Role, string> = {
  ADMIN: "/admin",
  TRANSPORT: "/transport",
  FACULTY: "/faculty",
  STUDENT: "/student",
  PARENT: "/parent",
};
export const roleDescriptions: Record<Role, string> = {
  ADMIN: "Campus setup, user access, buses, timetables and reports.",
  TRANSPORT: "Buses, drivers, routes, seats, live journeys and bus attendance.",
  FACULTY: "Assigned classes, classroom verification and academic attendance.",
  STUDENT: "Your timetable, bus journey and independent attendance histories.",
  PARENT: "Your linked children’s attendance, buses and journey updates.",
};
