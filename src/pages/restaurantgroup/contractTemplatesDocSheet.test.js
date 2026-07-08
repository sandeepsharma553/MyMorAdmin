/* DocSheet — document-styled template renderer. Verifies against the REAL
 * template shape (mirrors the seeded boh_hourly structure) that the doc design
 * comes out right: centred title, numbered clauses, detected sub-headings,
 * un-numbered SCHEDULE parts, token blanks, and no content lines lost. */
import React from "react";
import { render, screen } from "@testing-library/react";
import { DocSheet } from "./contractDocSheet";

const TEMPLATE = {
  sections: [
    { heading: "EMPLOYMENT AGREEMENT", body: [
      "Date: {{offer_date}}",
      "Employee Name: {{employee_name}}",
      "Dear {{employee_first_name}},",
      "Re: Offer of employment",
      "I am delighted to make the following offer of employment to you as {{employment_type}} employee with {{employer_name}} (Employer).",
    ] },
    { heading: "Position", body: [
      "Role and duties",
      "You will be employed as Back of House (BOH) Team Member / Kitchen Hand / Cook on the terms and conditions in this agreement.",
      "Change of role and duties",
      "The nature of your role, duties, levels of responsibility and reporting lines may be changed during the term of this agreement at the discretion of the Employer.",
    ] },
    { heading: "Location", body: [
      "You agree to perform your duties at the Employer's nominated workplace(s), being a {{location_basis}}, as specified by the Employer from time to time.",
    ] },
    { heading: "Employee Obligations", body: [
      "Apron; and", // list-fragment line — must NOT be detected as a sub-heading
      "Professional Conduct",
      "You must behave professionally at all times.",
    ] },
    { heading: "SCHEDULE 1 – JOB DESCRIPTION", body: [
      "Position Summary",
      "The BOH Team Member prepares food to standard.",
      "1. Food Quality",
      "Achieve at least 95% compliance with recipes and presentation standards.",
    ] },
  ],
};

test("renders the docx design: title, numbered clauses, sub-heads, schedule, tokens", () => {
  const { container } = render(<DocSheet template={TEMPLATE} />);

  // centred bold title (not numbered)
  const title = screen.getByText("EMPLOYMENT AGREEMENT");
  expect(title).toHaveStyle({ textAlign: "center", fontWeight: 700 });

  // cover: bold label prefix, bold Re: line
  expect(screen.getByText("Date:").tagName).toBe("STRONG");
  expect(screen.getByText("Re: Offer of employment")).toHaveStyle({ fontWeight: 700 });

  // clauses numbered sequentially; SCHEDULE not numbered
  expect(screen.getByText("1. Position")).toHaveStyle({ fontWeight: 700 });
  expect(screen.getByText("2. Location")).toBeInTheDocument();
  expect(screen.getByText("3. Employee Obligations")).toBeInTheDocument();
  expect(screen.getByText("SCHEDULE 1 – JOB DESCRIPTION")).toBeInTheDocument();
  expect(screen.queryByText(/4\.\s+SCHEDULE/)).toBeNull();

  // sub-headings numbered n.m and bold; list fragments left alone
  expect(screen.getByText("1.1 Role and duties")).toHaveStyle({ fontWeight: 700 });
  expect(screen.getByText("1.2 Change of role and duties")).toBeInTheDocument();
  expect(screen.getByText("3.1 Professional Conduct")).toBeInTheDocument();
  expect(screen.getByText(/Apron; and/)).not.toHaveStyle({ fontWeight: 700 });

  // schedule keeps its own inline numbering, bolded as-is (no re-numbering)
  expect(screen.getByText("1. Food Quality")).toHaveStyle({ fontWeight: 700 });
  expect(screen.getByText("Position Summary")).toHaveStyle({ fontWeight: 700 });

  // tokens render as underlined ‹token› blanks via shared contractFill.line
  expect(screen.getByText("‹offer_date›")).toBeInTheDocument();
  expect(screen.getByText("‹location_basis›", { exact: false })).toBeInTheDocument();

  // no content line lost: every body line's text is present
  TEMPLATE.sections.flatMap((s) => s.body).forEach((line) => {
    const probe = line.replace(/{{(\w+)}}/g, "‹$1›").slice(0, 40);
    expect(container.textContent).toContain(probe.replace(/\s+/g, " ").trim().slice(0, 30));
  });
});
