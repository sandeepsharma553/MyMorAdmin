/* Keys module (PDF Item 3) — render lock for the simple key-register list.
 * Mocks RGContext + firestore (repo pattern: the page's import chain pulls
 * firebase). Verifies: rows render across venues, the venue picker filters,
 * edit gating (Add button only at can("keys","edit")), and the departed-staff
 * chase flag. Config lock: the module exists in RG_MODULES + all four roles,
 * with NO approve level (permissions.test.js's guard owns that rule globally). */
import React from "react";
import { render, screen } from "@testing-library/react";

jest.mock("firebase/app", () => ({ getApp: jest.fn() }));
jest.mock("../../firebase", () => ({ db: {} }));
const snapshotByVenue = {};
jest.mock("firebase/firestore", () => ({
  onSnapshot: (col, cb) => { cb({ docs: (snapshotByVenue[col.__venueId] || []).map((r) => ({ id: r.id, data: () => r })) }); return () => {}; },
  addDoc: jest.fn(), setDoc: jest.fn(), deleteDoc: jest.fn(), doc: jest.fn(), serverTimestamp: jest.fn(),
}));
jest.mock("../../utils/restaurantGroupPaths", () => ({ venueCol: (g, venueId) => ({ __venueId: venueId }) }));

const mockRG = { groupId: "g1", venues: [], scopedStaff: [], selectedVenue: "all", can: () => true, showToast: jest.fn(), noteErr: jest.fn() };
jest.mock("./RGContext", () => ({ useRG: () => mockRG }));

const KeysPage = require("./KeysPage").default;
const { RG_MODULES, DEFAULT_PERMISSIONS } = require("./rgConfig");

const VENUES = [{ id: "v1", name: "Mad Benji" }, { id: "v2", name: "Hey Sister" }];

beforeEach(() => {
  Object.assign(mockRG, { venues: VENUES, scopedStaff: [{ id: "s1", name: "Mei Chen", status: "Active" }], selectedVenue: "all", can: () => true });
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

test("renders key records from every venue with store names", () => {
  render(<KeysPage />);
  expect(screen.getByText("Front door")).toBeInTheDocument();
  expect(screen.getByText("Back door")).toBeInTheDocument();
  expect(screen.getByText("Mad Benji")).toBeInTheDocument();
  expect(screen.getByText("Hey Sister")).toBeInTheDocument();
  expect(screen.getByText("spare in safe")).toBeInTheDocument();
  // departed holder (staffId no longer in scopedStaff) gets the chase flag
  expect(screen.getByText(/staff record gone/)).toBeInTheDocument();
});

test("venue picker filters the list", () => {
  mockRG.selectedVenue = "v1";
  render(<KeysPage />);
  expect(screen.getByText("Front door")).toBeInTheDocument();
  expect(screen.queryByText("Back door")).toBeNull();
});

test("view-only users get the list but no Add/Edit controls", () => {
  mockRG.can = (k, lvl) => lvl !== "edit";
  render(<KeysPage />);
  expect(screen.getByText("Front door")).toBeInTheDocument();
  expect(screen.queryByText("+ Add key record")).toBeNull();
  expect(screen.queryByText("Edit")).toBeNull();
});
