/* ============================================================
   (Deprecated) This file previously held static demo seed data for
   the Mad Kitchen Group. All data is now created dynamically:
     • Venues are entered by the superadmin when the group is created
       (see superadmin/RestaurantGroupsPage.js).
     • Staff, shifts, leave, training, checklists, KPIs, etc. are
       created by group users through the app UI.
   No static records remain.
   ============================================================ */

/** Monday (day 0) of the week containing `d`, as an ISO yyyy-mm-dd string. */
export function weekKeyOf(d = new Date()) {
  const date = new Date(d);
  const dow = (date.getDay() + 6) % 7; // 0 = Monday
  date.setDate(date.getDate() - dow);
  date.setHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}
