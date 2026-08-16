import type { PortalFieldMap } from "../schema";

/**
 * Seed config for Grants.gov Workspace. Every selector is a `TODO:` placeholder
 * (Phase-1 recon captured zero live selectors — see spec §2, §2.3). The
 * resolver treats a `TODO`-prefixed string as absent, so this config produces
 * the correct graceful-degradation behavior (INV-9): import works, nothing is
 * filled, everything is flagged "unmapped", until a future in-session capture
 * pass replaces the TODOs with real selector strings.
 *
 * Box 21's signature + Date Signed rows are present as STRUCTURALLY EXCLUDED
 * roles (`signature` / `date_signed`, `neverFill: true`) — never as fillable
 * data, regardless of `packageKey` (INV-1 / INV-4).
 */
export const grantsGov: PortalFieldMap = {
  portalId: "grants_gov",
  displayName: "Grants.gov Workspace",
  urlMatch: ["https://www.grants.gov/*", "https://grants.gov/*", "https://apply07.grants.gov/*"],

  steps: [
    {
      stepId: "sf424_page1",
      title: "SF-424 — Applicant & Program",
      order: 0,
      landmark: { labelText: "Application for Federal Assistance" },
    },
    {
      stepId: "sf424_page2",
      title: "SF-424 — Funding & Representative",
      order: 1,
      landmark: { labelText: "Estimated Funding" },
    },
  ],

  // Allowlist of advance controls. Submit-guard (submitGuard.ts) still screens
  // each one; it always wins over this allowlist (INV-1).
  advanceControls: [{ labelText: "Save" }, { labelText: "Save & Continue" }, { labelText: "Next" }],

  // Documented only — the runtime denylist blocks these unconditionally.
  forbiddenControls: [
    { labelText: "Sign and Submit" },
    { labelText: "Check Package for Errors" }, // not submit, but do not auto-click; human-driven
  ],

  fields: [
    // --- Program / agency identifiers (grounded from Opportunity in the package) ---
    {
      packageKey: "funding_opportunity_number",
      formName: "SF-424",
      boxRef: "12",
      label: "Funding Opportunity Number",
      elementType: "text",
      stepId: "sf424_page1",
      selector: { id: "TODO: in-session selector capture" },
    },
    {
      packageKey: "funding_opportunity_title",
      formName: "SF-424",
      boxRef: "12",
      label: "Funding Opportunity Title",
      elementType: "text",
      stepId: "sf424_page1",
      selector: { id: "TODO: in-session selector capture" },
    },
    {
      packageKey: "awarding_agency",
      formName: "SF-424",
      boxRef: "10",
      label: "Name of Federal Agency",
      elementType: "text",
      stepId: "sf424_page1",
      selector: { id: "TODO: in-session selector capture" },
    },

    // --- Applicant identity ---
    {
      packageKey: "organization_name",
      formName: "SF-424",
      boxRef: "8a",
      label: "Legal Name (Applicant)",
      elementType: "text",
      stepId: "sf424_page1",
      selector: { id: "TODO: in-session selector capture" },
    },
    {
      packageKey: "uei",
      formName: "SF-424",
      boxRef: "8c",
      label: "Unique Entity Identifier (UEI)",
      elementType: "text",
      stepId: "sf424_page1",
      selector: { id: "TODO: in-session selector capture" },
    },
    {
      packageKey: "entity_type",
      formName: "SF-424",
      boxRef: "9",
      label: "Type of Applicant",
      elementType: "select",
      stepId: "sf424_page1",
      transform: "entity_type_to_sf424_option",
      selector: { id: "TODO: in-session selector capture" },
    },

    // --- Address ---
    {
      packageKey: "applicant_street",
      formName: "SF-424",
      boxRef: "8d",
      label: "Address — Street",
      elementType: "text",
      stepId: "sf424_page1",
      selector: { id: "TODO: in-session selector capture" },
    },
    {
      packageKey: "applicant_city",
      formName: "SF-424",
      boxRef: "8d",
      label: "Address — City",
      elementType: "text",
      stepId: "sf424_page1",
      selector: { id: "TODO: in-session selector capture" },
    },
    {
      packageKey: "applicant_state",
      formName: "SF-424",
      boxRef: "8d",
      label: "Address — State",
      elementType: "select",
      stepId: "sf424_page1",
      transform: "state_name_to_code",
      selector: { id: "TODO: in-session selector capture" },
    },
    {
      packageKey: "applicant_zip",
      formName: "SF-424",
      boxRef: "8d",
      label: "Address — ZIP",
      elementType: "text",
      stepId: "sf424_page1",
      selector: { id: "TODO: in-session selector capture" },
    },
    {
      packageKey: "applicant_congressional_district",
      formName: "SF-424",
      boxRef: "16",
      label: "Congressional District (Applicant)",
      elementType: "text",
      stepId: "sf424_page1",
      selector: { id: "TODO: in-session selector capture" },
    },

    // --- Project ---
    {
      packageKey: "project_title",
      formName: "SF-424",
      boxRef: "15",
      label: "Descriptive Title of Applicant's Project",
      elementType: "textarea",
      stepId: "sf424_page1",
      selector: { id: "TODO: in-session selector capture" },
    },
    {
      packageKey: "project_start_date",
      formName: "SF-424",
      boxRef: "17",
      label: "Proposed Project Start Date",
      elementType: "date",
      stepId: "sf424_page2",
      transform: "date_iso_to_mmddyyyy",
      selector: { id: "TODO: in-session selector capture" },
    },
    {
      packageKey: "project_end_date",
      formName: "SF-424",
      boxRef: "17",
      label: "Proposed Project End Date",
      elementType: "date",
      stepId: "sf424_page2",
      transform: "date_iso_to_mmddyyyy",
      selector: { id: "TODO: in-session selector capture" },
    },

    // --- Amounts ---
    {
      packageKey: "federal_funding_requested",
      formName: "SF-424",
      boxRef: "18a",
      label: "Estimated Funding — Federal",
      elementType: "text",
      stepId: "sf424_page2",
      transform: "currency_plain",
      selector: { id: "TODO: in-session selector capture" },
    },
    {
      packageKey: "total_project_cost",
      formName: "SF-424",
      boxRef: "18",
      label: "Estimated Funding — Total",
      elementType: "text",
      stepId: "sf424_page2",
      transform: "currency_plain",
      selector: { id: "TODO: in-session selector capture" },
    },

    // --- Authorized Representative (Box 21) — IDENTITY fields only ---
    {
      packageKey: "authorized_representative_name",
      formName: "SF-424",
      boxRef: "21",
      label: "Authorized Representative — Name",
      elementType: "text",
      stepId: "sf424_page2",
      role: "data", // identity field: allowed
      selector: { id: "TODO: in-session selector capture" },
    },

    // --- Box 21 signature + date: STRUCTURALLY EXCLUDED (INV-1/INV-4). Present
    //     so the config documents them as never-fill; the engine refuses them
    //     even if a packageKey were (erroneously) set. ---
    {
      packageKey: null,
      formName: "SF-424",
      boxRef: "21",
      label: "Signature of Authorized Representative",
      elementType: "text",
      stepId: "sf424_page2",
      role: "signature",
      neverFill: true,
      selector: { id: "TODO: in-session selector capture" },
    },
    {
      packageKey: null,
      formName: "SF-424",
      boxRef: "21",
      label: "Date Signed",
      elementType: "date",
      stepId: "sf424_page2",
      role: "date_signed",
      neverFill: true,
      selector: { id: "TODO: in-session selector capture" },
    },
  ],
};
