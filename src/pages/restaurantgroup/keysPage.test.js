/* Keys module (PDF Item 3) — render lock for the key register, now GROUPED one
 * row per PERSON (owner ruling): first key names in the Keys cell, a count pill
 * that opens the per-person popup (store / notes / edit live THERE, not in the
 * table). Mocks RGContext + firestore (repo pattern: the page's import chain
 * pulls firebase). Verifies: grouped rows render across venues, the popup shows
 * store + notes, the venue picker filters, edit gating, and the departed-staff
 * chase flag. Config lock: the module exists in RG_MODULES + all four roles,
 * with NO approve level (permissions.test.js's guard owns that rule globally). */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

jest.mock("firebase/app", () => ({ getApp: jest.fn() }));
jest.mock("../../firebase", () => ({ db: {} }));
const snapshotByVenue = {};
jest.mock("firebase/firestore", () => ({
  onSnapshot: (col, cb) => { cb({ docs: (snapshotByVenue[col.__venueId] || []).map((r) => ({ id: r.id, data: () => r })) }); return () => {}; },
  addDoc: jest.fn(), setDoc: jest.fn(), deleteDoc: jest.fn(), doc: jest.fn(), serverTimestamp: jest.fn(),
}));
jest.mock("../../utils/restaurantGroupPaths", () => ({ venueCol: (g, venueId) => ({ __venueId: venueId }) }));

const mockRG = { groupId: "g1", venues: [], scopedStaff: [], selectedVenue: "all", can: () => true, showToast: jest.fn(), noteErr: jest.fn(), myScope: "admin", myStaff: null };
jest.mock("./RGContext", () => ({ useRG: () => mockRG }));

const KeysPage = require("./KeysPage").default;
const { RG_MODULES, DEFAULT_PERMISSIONS } = require("./rgConfig");

const VENUES = [{ id: "v1", name: "Mad Benji" }, { id: "v2", name: "Hey Sister" }];

beforeEach(() => {
  Object.assign(mockRG, { venues: VENUES, scopedStaff: [{ id: "s1", name: "Mei Chen", status: "Active" }], selectedVenue: "all", can: () => true, myScope: "admin", myStaff: null });
  snapshotByVenue.v1 = [{ id: "k1", keyLabel: "Front door", holderName: "Mei Chen", staffId: "s1", issuedOn: "2026-07-01", notes: "" }];
  snapshotByVenue.v2 = [{ id: "k2", keyLabel: "Back door", holderName: "Old Manager", staffId: "gone-id", issuedOn: "", notes: "spare in safe" }];
});

test("module is wired: RG_MODULES entry + levels in all four roles, no approve", () => {
  const mod = RG_MODULES.find((m) => m.key === "keys");
  expect(mod).toEqual({ key: "keys", label: "Keys", path: "/rg/keys" });
  expect(DEFAULT_PERMISSIONS.owner.keys).toBe("edit");
  expect(DEFAULT_PERMISSIONS.storeAdmin.keys).toBe("edit");
  expect(DEFAULT_PERMISSIONS.manager.keys).toBe("view");
  expect(DEFAULT_PERMISSIONS.staff.keys).toBe("none");
});

test("renders one grouped row per person; the count popup carries store + notes", () => {
  render(<KeysPage />);
  // grouped rows: holder + key names, and the store in its OWN column (owner list #10)
  expect(screen.getByText("Mei Chen")).toBeInTheDocument();
  expect(screen.getByText("Old Manager")).toBeInTheDocument();
  expect(screen.getByText(/Front door/)).toBeInTheDocument();
  expect(screen.getByText(/Back door/)).toBeInTheDocument();
  expect(screen.getByText("Store")).toBeInTheDocument(); // column header
  expect(screen.getByText("Mad Benji")).toBeInTheDocument(); // store cell
  expect(screen.getByText("Hey Sister")).toBeInTheDocument(); // store cell
  // departed holder (staffId no longer in scopedStaff) gets the chase flag
  expect(screen.getByText(/staff record gone/)).toBeInTheDocument();
  // the popup repeats store + carries notes — open Old Manager's count pill
  // (grouped rows sort by name: Mei Chen first, Old Manager second)
  fireEvent.click(screen.getAllByText("1 key")[1]);
  expect(screen.getAllByText(/Hey Sister/).length).toBeGreaterThanOrEqual(2); // store cell + popup line
  expect(screen.getByText(/spare in safe/)).toBeInTheDocument();
});

test("venue picker filters the list", () => {
  mockRG.selectedVenue = "v1";
  render(<KeysPage />);
  expect(screen.getByText(/Front door/)).toBeInTheDocument();
  expect(screen.queryByText(/Back door/)).toBeNull();
});

test("view-only users get the list but no Add/Edit controls", () => {
  mockRG.can = (k, lvl) => lvl !== "edit";
  render(<KeysPage />);
  expect(screen.getByText(/Front door/)).toBeInTheDocument();
  expect(screen.queryByText("+ Add key record")).toBeNull();
  expect(screen.queryByText("Edit")).toBeNull();
});

test("staff viewer sees ONLY their own keys (owner list #10)", () => {
  mockRG.myScope = "staff";
  mockRG.myStaff = { id: "s1", name: "Mei Chen" };
  mockRG.can = (k, lvl) => lvl !== "edit";
  render(<KeysPage />);
  // own record shows; the other holder's record is filtered out entirely
  expect(screen.getByText(/Front door/)).toBeInTheDocument();
  expect(screen.queryByText(/Back door/)).toBeNull();
  expect(screen.queryByText("Old Manager")).toBeNull();
  expect(screen.getByText(/Keys you hold/)).toBeInTheDocument();
});
