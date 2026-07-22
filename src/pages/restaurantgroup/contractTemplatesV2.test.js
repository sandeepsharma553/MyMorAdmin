/* v2 template set (scripts/seed/data/contract-templates-v2.json) — the exact JSON the
 * reseed script writes. Verifies each of the 6 docs renders through DocSheet and that
 * tokens are colour-coded by tokenTypes (pink=system / green=settings / yellow=text,
 * the client's docx highlight legend). */
import React from "react";
import { render } from "@testing-library/react";
import { DocSheet, TOKEN_TYPE_STYLE } from "./contractDocSheet";
import contractFill from "./contractFill";

const V2 = require("../../../scripts/seed/data/contract-templates-v2.json");
const IDS = ["boh_casual", "foh_casual", "boh_fulltime", "foh_fulltime", "boh_parttime", "foh_parttime"];

test("v2 set is the 6 expected templates with typed tokens", () => {
  expect(Object.keys(V2).sort()).toEqual([...IDS].sort());
  for (const id of IDS) {
    const t = V2[id];
    // every token used in the body is listed and typed
    const used = new Set();
    for (const s of t.sections) for (const line of s.body) {
      for (const m of line.matchAll(/{{(\w+)}}/g)) used.add(m[1]);
    }
    expect([...used].sort()).toEqual(t.tokenKeys);
    for (const k of t.tokenKeys) expect(["system", "settings", "text"]).toContain(t.tokenTypes[k]);
    // tokenDefaults only cover real tokens
    for (const k of Object.keys(t.tokenDefaults || {})) expect(t.tokenKeys).toContain(k);
  }
});

test.each(IDS)("%s renders with colour-coded tokens and no lost lines", (id) => {
  const t = V2[id];
  const { container } = render(<DocSheet template={t} />);
  // pink system token, green settings token, yellow text token all present
  const spanFor = (token) =>
    [...container.querySelectorAll("span")].find((el) => el.textContent === `‹${token}›`);
  expect(spanFor("employee_name")).toHaveStyle({ background: TOKEN_TYPE_STYLE.system.background });
  expect(spanFor("employer_name")).toHaveStyle({ background: TOKEN_TYPE_STYLE.settings.background });
  expect(spanFor("commence_date")).toHaveStyle({ background: TOKEN_TYPE_STYLE.text.background });
  // no content line lost
  for (const s of t.sections) for (const line of s.body) {
    const probe = contractFill.line(line, {}).replace(/\s+/g, " ").slice(0, 30);
    expect(container.textContent.replace(/\s+/g, " ")).toContain(probe);
  }
});
