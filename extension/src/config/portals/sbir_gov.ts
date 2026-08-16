import type { PortalFieldMap } from "../schema";

/**
 * Seed config for SBIR.gov. The recon pass only reached the public,
 * unauthenticated topic/solicitation search form (`/topics`) — a search
 * filter form with no applicant-data-entry fields. The real
 * organization/application flow lives behind "Register"/"Login" and was not
 * reached, so its live selectors and section flow are unknown.
 *
 * This config carries the shared SF-424-family key→box mapping (Appendix A
 * of the extension spec) with every selector left `TODO`, so import behavior
 * degrades gracefully (INV-9) exactly like the other seed configs, pending
 * the in-session capture pass.
 */
export const sbirGov: PortalFieldMap = {
  portalId: "sbir_gov",
  displayName: "SBIR.gov",
  urlMatch: ["https://www.sbir.gov/*", "https://sbir.gov/*"],

  steps: [
    {
      stepId: "application_form",
      title: "Application — Organization / Project fields",
      order: 0,
      landmark: { labelText: "TODO: in-session selector capture (confirm application-form landmark)" },
    },
  ],

  advanceControls: [{ labelText: "TODO: in-session selector capture" }],
  // NOTE: the public /topics search page also has a control labeled "Apply"
  // (apply search filters) — unrelated to this extension's fill/apply action
  // and NOT a submit target; still, no such control is ever whitelisted here
  // without in-session confirmation of the REAL application flow.
  forbiddenControls: [{ labelText: "Submit Application" }, { labelText: "Certify & Submit" }],

  fields: [
    {
      packageKey: "funding_opportunity_number",
      formName: "SF-424",
      boxRef: "12",
      label: "Funding Opportunity Number",
      elementType: "text",
      stepId: "application_form",
      selector: { id: "TODO: in-session selector capture" },
    },
    {
      packageKey: "funding_opportunity_title",
      formName: "SF-424",
      boxRef: "12",
      label: "Funding Opportunity Title",
      elementType: "text",
      stepId: "application_form",
      selector: { id: "TODO: in-session selector capture" },
    },
    {
      packageKey: "awarding_agency",
      formName: "SF-424",
      boxRef: "10",
      label: "Name of Federal Agency",
      elementType: "text",
      stepId: "application_form",
      selector: { id: "TODO: in-session selector capture" },
    },
    {
      packageKey: "organization_name",
      formName: "SF-424",
      boxRef: "8a",
      label: "Legal Name (Applicant)",
      elementType: "text",
      stepId: "application_form",
      selector: { id: "TODO: in-session selector capture" },
    },
    {
      packageKey: "uei",
      formName: "SF-424",
      boxRef: "8c",
      label: "Unique Entity Identifier (UEI)",
      elementType: "text",
      stepId: "application_form",
      selector: { id: "TODO: in-session selector capture" },
    },
    {
      packageKey: "entity_type",
      formName: "SF-424",
      boxRef: "9",
      label: "Type of Applicant",
      elementType: "select",
      stepId: "application_form",
      transform: "entity_type_to_sf424_option",
      selector: { id: "TODO: in-session selector capture" },
    },
    {
      packageKey: "applicant_street",
      formName: "SF-424",
      boxRef: "8d",
      label: "Address — Street",
      elementType: "text",
      stepId: "application_form",
      selector: { id: "TODO: in-session selector capture" },
    },
    {
      packageKey: "applicant_city",
      formName: "SF-424",
      boxRef: "8d",
      label: "Address — City",
      elementType: "text",
      stepId: "application_form",
      selector: { id: "TODO: in-session selector capture" },
    },
    {
      packageKey: "applicant_state",
      formName: "SF-424",
      boxRef: "8d",
      label: "Address — State",
      elementType: "select",
      stepId: "application_form",
      transform: "state_name_to_code",
      selector: { id: "TODO: in-session selector capture" },
    },
    {
      packageKey: "applicant_zip",
      formName: "SF-424",
      boxRef: "8d",
      label: "Address — ZIP",
      elementType: "text",
      stepId: "application_form",
      selector: { id: "TODO: in-session selector capture" },
    },
    {
      packageKey: "applicant_congressional_district",
      formName: "SF-424",
      boxRef: "16",
      label: "Congressional District (Applicant)",
      elementType: "text",
      stepId: "application_form",
      selector: { id: "TODO: in-session selector capture" },
    },
    {
      packageKey: "naics_code",
      formName: "SF-424",
      boxRef: "supplement",
      label: "NAICS code(s)",
      elementType: "text",
      stepId: "application_form",
      selector: { id: "TODO: in-session selector capture" },
    },
    {
      packageKey: "project_title",
      formName: "SF-424",
      boxRef: "15",
      label: "Descriptive Title of Applicant's Project",
      elementType: "textarea",
      stepId: "application_form",
      selector: { id: "TODO: in-session selector capture" },
    },
    {
      packageKey: "project_start_date",
      formName: "SF-424",
      boxRef: "17",
      label: "Proposed Project Start Date",
      elementType: "date",
      stepId: "application_form",
      transform: "date_iso_to_mmddyyyy",
      selector: { id: "TODO: in-session selector capture" },
    },
    {
      packageKey: "project_end_date",
      formName: "SF-424",
      boxRef: "17",
      label: "Proposed Project End Date",
      elementType: "date",
      stepId: "application_form",
      transform: "date_iso_to_mmddyyyy",
      selector: { id: "TODO: in-session selector capture" },
    },
    {
      packageKey: "federal_funding_requested",
      formName: "SF-424",
      boxRef: "18a",
      label: "Estimated Funding — Federal",
      elementType: "text",
      stepId: "application_form",
      transform: "currency_plain",
      selector: { id: "TODO: in-session selector capture" },
    },
    {
      packageKey: "total_project_cost",
      formName: "SF-424",
      boxRef: "18",
      label: "Estimated Funding — Total",
      elementType: "text",
      stepId: "application_form",
      transform: "currency_plain",
      selector: { id: "TODO: in-session selector capture" },
    },
    {
      packageKey: "authorized_representative_name",
      formName: "SF-424",
      boxRef: "21",
      label: "Authorized Representative — Name",
      elementType: "text",
      stepId: "application_form",
      role: "data",
      selector: { id: "TODO: in-session selector capture" },
    },

    // Box 21 signature + date: STRUCTURALLY EXCLUDED (INV-1/INV-4).
    {
      packageKey: null,
      formName: "SF-424",
      boxRef: "21",
      label: "Signature of Authorized Representative",
      elementType: "text",
      stepId: "application_form",
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
      stepId: "application_form",
      role: "date_signed",
      neverFill: true,
      selector: { id: "TODO: in-session selector capture" },
    },
  ],
};
