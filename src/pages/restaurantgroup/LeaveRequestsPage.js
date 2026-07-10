import React, { useMemo, useState } from "react";
import { addDoc, updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { useRG } from "./RGContext";
import { venueCol } from "../../utils/restaurantGroupPaths";
import { fullName, leaveTypePill, leaveStatusPill, leaveLabel, avatarColor, initials, downloadCsv } from "./rgUtils";
import { resolveLeaveTypes } from "./staffStructureUtils";
import { sendNotification } from "./notify";

// Leave TYPES are owner-editable as of Phase 4a — resolveLeaveTypes(group) (Settings →
// Leave types card), with a PERMANENT "Other" appended by the chooser that stores
// type:"Other" + typeOther:"<free text>". The old hardcoded TYPES const is gone.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const fmtRange = (s, e) => {
  if (!s) return "";
  const sd = new Date(s), ed = e ? new Date(e) : null;
  const a = `${sd.getDate()} ${MONTHS[sd.getMonth()]}`;
  if (!ed || s === e) return a;
  return `${sd.getDate()}–${ed.getDate()} ${MONTHS[ed.getMonth()]}`;
};
const daysBetween = (s, e) => {
  if (!s) return 1;
  if (!e || s === e) return 1;
  return Math.max(1, Math.round((new Date(e) - new Date(s)) / 86400000) + 1);
};

export default function LeaveRequestsPage() {
  const { groupId, group, staff, venues, leave, selectedVenue, matchVenue, showToast, can, me, myStaff, myScope, scopedStaff } = useRG();
  // Approving others' requests needs the `approve` permission. The owner/superadmin tier is
  // full-access and ALWAYS approves (even if their stored permissions predate the approve
  // level). Submitting stays scoped (see submit() — your own team only).
  const canApprove = can("leave", "approve") || myScope === "owner" || me?.type === "superadmin";
  const isEmployee = myScope === "staff";
  const actorName = me?.displayName || me?.name || me?.email || "Manager";
  const leaveTypes = resolveLeaveTypes(group);
  const typeOptions = [...leaveTypes, "Other"]; // "Other" is permanent — never in group.leaveTypes
  const [form, setForm] = useState({ venueId: "", staffId: isEmployee ? (myStaff?.id || "") : "", type: "", typeOther: "", start: "", end: "", reason: "" });
  const setF = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  // venue → staff: staff options narrow to the chosen venue (managers/owners submit for their team)
  const venueStaffOptions = useMemo(
    () => scopedStaff.filter((s) => !form.venueId || (s.venueIds || []).includes(form.venueId) || s.venueId === form.venueId),
    [scopedStaff, form.venueId]
  );

  // who this user is allowed to submit-for / see leave of
  const scopedIds = useMemo(() => new Set(scopedStaff.map((s) => s.id)), [scopedStaff]);
  const scoped = useMemo(
    () => leave.filter(matchVenue).filter((l) => myScope === "owner" || scopedIds.has(l.staffId)),
    [leave, matchVenue, myScope, scopedIds]
  );
  const pending = scoped.filter((l) => l.status === "Pending");
  const history = scoped.filter((l) => l.status !== "Pending");
  // ── history grouped into per-type SECTIONS (Phase 4c) ── ONE "Other" section (custom
  // texts show per-row via leaveLabel); rows inside keep the existing array order — there
  // was no explicit sort before (context fan-out order), and that is preserved.
  const historySections = useMemo(() => {
    const map = new Map();
    history.forEach((l) => {
      const key = l.type === "Other" ? "Other" : (l.type || "—");
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(l);
    });
    return [...map.entries()];
  }, [history]); // eslint-disable-line react-hooks/exhaustive-deps

  const decide = async (l, status) => {
    try {
      await updateDoc(doc(venueCol(groupId, l.venueId, "leaveRequests"), l.id), { status, approvedBy: actorName, decidedAt: serverTimestamp() });
      showToast(status === "Approved" ? "Leave approved — blocked in shift planner" : "Leave declined — staff notified");
      sendNotification(groupId, { to: l.staffId, type: "leave", title: `Leave ${status.toLowerCase()}`, body: `${leaveLabel(l)} ${l.dates} — ${status.toLowerCase()} by ${actorName}`, venueId: l.venueId, by: actorName });
    } catch { showToast("Could not update request"); }
  };

  const submit = async () => {
    const staffId = isEmployee ? (myStaff?.id || "") : form.staffId;
    if (!staffId) return showToast("Select a staff member");
    if (!scopedIds.has(staffId)) return showToast("You can only submit leave for your own team");
    if (!form.type) return showToast("Pick a leave type");
    if (form.type === "Other" && !form.typeOther.trim()) return showToast('Describe the leave type for "Other"');
    if (!form.start) return showToast("Choose a start date");
    const st = staff.find((s) => s.id === staffId);
    // file the request under a venue the staff member actually belongs to; derive the
    // venue NAME from the same id so the doc location and the displayed name never disagree.
    const stVenues = st?.venueIds?.length ? st.venueIds : (st?.venueId ? [st.venueId] : []);
    // prefer the venue chosen in the form, else the selected venue, else the staff's first venue
    const vid = (form.venueId && stVenues.includes(form.venueId)) ? form.venueId
      : (selectedVenue !== "all" && stVenues.includes(selectedVenue)) ? selectedVenue : stVenues[0];
    if (!vid) return showToast("This staff member has no venue assigned");
    const venueName = venues.find((v) => v.id === vid)?.name || st?.venueNames?.[0] || "";
    try {
      await addDoc(venueCol(groupId, vid, "leaveRequests"), {
        staffId, staffName: st?.displayName || fullName(st),
        venue: venueName, venueId: vid, area: st?.area || (st?.role || "").split(" — ")[0] || "",
        type: form.type, typeOther: form.type === "Other" ? form.typeOther.trim() : "",
        dates: fmtRange(form.start, form.end), days: daysBetween(form.start, form.end),
        startDate: form.start, endDate: form.end || form.start, reason: form.reason.trim(),
        status: "Pending", approvedBy: "", createdAt: serverTimestamp(),
      });
      showToast("Leave request submitted — manager notified");
      sendNotification(groupId, { to: "managers", type: "leave", title: "New leave request", body: `${st?.displayName || fullName(st)} · ${leaveLabel({ type: form.type, typeOther: form.typeOther })} ${fmtRange(form.start, form.end)}`, venueId: vid, by: st?.displayName || fullName(st) });
      setForm({ venueId: "", staffId: "", type: "", typeOther: "", start: "", end: "", reason: "" });
    } catch { showToast("Could not submit request"); }
  };

  const bg = (type) => {
    const p = leaveTypePill(type);
    return p === "pill-blue" ? "var(--blue-light)" : p === "pill-purple" ? "var(--purple-light)" : "var(--amber-light)";
  };

  return (
    <>
      <div className="grid-2" style={{ marginBottom: 16 }}>
        {/* Pending */}
        <div className="card">
          <div className="card-head">
            <div><span className="card-title">Pending requests</span><span className="card-sub">Requires your approval</span></div>
            <span className="pill pill-amber">{pending.length} pending</span>
          </div>
          {pending.map((l) => {
            const st = staff.find((s) => s.id === l.staffId);
            return (
              <div key={l.id} className="leave-card" style={{ borderColor: bg(l.type), background: bg(l.type) }}>
                <div className="leave-avatar" style={{ background: avatarColor(st || { venue: l.venue }) }}>{initials(st || { name: l.staffName })}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{l.staffName} <span className={`pill ${leaveTypePill(l.type)}`} style={{ marginLeft: 4 }}>{leaveLabel(l)}</span></div>
                  <div style={{ fontSize: 11, color: "var(--gray)" }}>{l.venue} · {l.area} · {l.dates} ({l.days} {l.days === 1 ? "day" : "days"})</div>
                  {l.reason && <div style={{ fontSize: 11, color: "var(--gray)", marginTop: 2 }}>"{l.reason}"</div>}
                </div>
                {canApprove ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <button className="btn btn-sm btn-primary" onClick={() => decide(l, "Approved")}>Approve</button>
                    <button className="btn btn-sm btn-danger" onClick={() => decide(l, "Declined")}>Decline</button>
                  </div>
                ) : (
                  <span className="pill pill-gray" title="You don't have approval rights">Awaiting manager</span>
                )}
              </div>
            );
          })}
          {pending.length === 0 && <div style={{ fontSize: 12, color: "var(--gray)" }}>No pending requests 🎉</div>}
        </div>

        {/* Submit */}
        <div className="card">
          <div className="card-head"><span className="card-title">Submit leave request</span></div>
          {!isEmployee && (
            <div className="form-group">
              <label className="form-label">Venue</label>
              <select className="form-input" value={form.venueId} onChange={(e) => setForm((p) => ({ ...p, venueId: e.target.value, staffId: "" }))}>
                <option value="">All my venues</option>
                {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Staff member {isEmployee && <span style={{ color: "var(--gray)", fontWeight: 400 }}>(you)</span>}</label>
            {isEmployee ? (
              <input className="form-input" value={myStaff ? fullName(myStaff) : "—"} disabled style={{ background: "var(--gray-light)", color: "var(--gray)" }} />
            ) : (
              <select className="form-input" value={form.staffId} onChange={setF("staffId")}>
                <option value="">{form.venueId ? "Select staff in this venue..." : "Select staff member..."}</option>
                {venueStaffOptions.map((s) => <option key={s.id} value={s.id}>{fullName(s)}</option>)}
              </select>
            )}
            {myScope === "manager" && <div style={{ fontSize: 10, color: "var(--gray)", marginTop: 4 }}>You can submit for staff at your venue(s).</div>}
          </div>
          <div className="form-group">
            <label className="form-label">Leave type</label>
            <select className="form-input" value={form.type} onChange={setF("type")}>
              <option value="">Select type…</option>
              {typeOptions.map((t) => <option key={t}>{t}</option>)}
            </select>
            {form.type === "Other" && (
              <input className="form-input" style={{ marginTop: 6 }} value={form.typeOther} onChange={setF("typeOther")} placeholder="Describe the leave type (required)" />
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div className="form-group"><label className="form-label">Start date</label><input type="date" className="form-input" value={form.start} onChange={setF("start")} /></div>
            <div className="form-group"><label className="form-label">End date</label><input type="date" className="form-input" value={form.end} onChange={setF("end")} /></div>
          </div>
          <div className="form-group"><label className="form-label">Reason</label><textarea className="form-input" rows={3} value={form.reason} onChange={setF("reason")} placeholder="Brief reason for leave request..." /></div>
          <div className="btn-row"><button className="btn btn-primary" onClick={submit}>Submit request</button></div>
        </div>
      </div>

      {/* History */}
      <div className="card">
        <div className="card-head"><span className="card-title">Leave history</span><button className="btn btn-sm" onClick={() => { downloadCsv("leave-history.csv", [["Staff", "Venue", "Type", "Dates", "Days", "Status", "Approved by"], ...history.map((l) => [l.staffName, l.venue, leaveLabel(l), l.dates, l.days, l.status, l.approvedBy || ""])]); showToast("Leave history exported (CSV)"); }}>Export</button></div>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead><tr><th>Staff</th><th>Venue</th><th>Type</th><th>Dates</th><th>Days</th><th>Status</th><th>Approved by</th></tr></thead>
            <tbody>
              {/* per-type sections (Phase 4c) — ONE "Other" section; CSV above stays flat */}
              {historySections.map(([t, rows]) => (
                <React.Fragment key={t}>
                  <tr><td colSpan={7} style={{ padding: "6px 10px", background: "var(--gray-light)", fontSize: 11, fontWeight: 700, color: "var(--gray)", textTransform: "uppercase", letterSpacing: 0.4 }}>{t} <span style={{ fontWeight: 400 }}>· {rows.length}</span></td></tr>
                  {rows.map((l) => (
                    <tr key={l.id}>
                      <td>{l.staffName}</td><td>{l.venue}</td><td>{leaveLabel(l)}</td><td>{l.dates}</td><td>{l.days}</td>
                      <td><span className={`pill ${leaveStatusPill(l.status)}`}>{l.status}</span></td><td>{l.approvedBy || "—"}</td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
              {history.length === 0 && <tr><td colSpan={7} style={{ color: "var(--gray)" }}>No leave history yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
