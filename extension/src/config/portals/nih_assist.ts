import type { PortalFieldMap } from "../schema";

/**
 * Seed config for NIH ASSIST. Per the field-map recon, this portal is FULLY
 * auth-gated: `https://public.era.nih.gov/assist/` is itself the login
 * screen — there is no public content beyond the authentication gate, and no
 * post-login flow was (or should be) observed without a human's own
 * credentials.
 *
 * Per spec §2.3: this seed config carries the SF-424-family key→box mapping
 * with all-TODO selectors, but `steps` and `advanceControls` are left EMPTY
 * (no section flow was, or could be, observed) until an in-session capture
 * pass — driven by a human logged into their own eRA Commons / Login.gov
 * session — records the real flow.
 *
 * INV-5: this config MUST NEVER bind any field to the login form's
 * username/password inputs. The only fields visible at the public URL are
 * the login form's own controls, none of which correspond to a package key —
 * so this config simply does not describe them at all (not even as
 * `neverFill` placeholders); the runtime's independent `input[type=password]`
 * refusal (fillEngine) is the structural backstop regardless.
 */
export const nihAssist: PortalFieldMap = {
  portalId: "nih_assist",
  displayName: "NIH ASSIST",
  urlMatch: ["https://public.era.nih.gov/assist/*"],

  // Empty until the in-session capture pass observes the real post-login
  // section flow. No landmark can be captured from a fully gated portal.
  steps: [],
  advanceControls: [],
  forbiddenControls: [{ labelText: "Sign and Submit" }, { labelText: "Certify & Submit" }],

  fields: [
    {
      packageKey: "funding_opportunity_number",
      formName: "SF-424",
      boxRef: "12",
      label: "Funding Opportunity Number",
      elementType: "text",
      stepId: "TODO: unknown until in-session capture",
      selector: { id: "TODO: in-session selector capture" },
    },
    {
      packageKey: "funding_opportunity_title",
      formName: "SF-424",
      boxRef: "12",
      label: "Funding Opportunity Title",
      elementType: "text",
      stepId: "TODO: unknown until in-session capture",
      selector: { id: "TODO: in-session selector capture" },
    },
    {
      packageKey: "awarding_agency",
      formName: "SF-424",
      boxRef: "10",
      label: "Name of Federal Agency",
      elementType: "text",
      stepId: "TODO: unknown until in-session capture",
      selector: { id: "TODO: in-session selector capture" },
    },
    {
      packageKey: "organization_name",
      formName: "SF-424",
      boxRef: "8a",
      label: "Legal Name (Applicant)",
      elementType: "text",
      stepId: "TODO: unknown until in-session capture",
      selector: { id: "TODO: in-session selector capture" },
    },
    {
      packageKey: "uei",
      formName: "SF-424",
      boxRef: "8c",
      label: "Unique Entity Identifier (UEI)",
      elementType: "text",
      stepId: "TODO: unknown until in-session capture",
      selector: { id: "TODO: in-session selector capture" },
    },
    {
      packageKey: "entity_type",
      formName: "SF-424",
      boxRef: "9",
      label: "Type of Applicant",
      elementType: "select",
      stepId: "TODO: unknown until in-session capture",
      transform: "entity_type_to_sf424_option",
      selector: { id: "TODO: in-session selector capture" },
    },
    {
      packageKey: "applicant_street",
      formName: "SF-424",
      boxRef: "8d",
      label: "Address — Street",
      elementType: "text",
      stepId: "TODO: unknown until in-session capture",
      selector: { id: "TODO: in-session selector capture" },
    },
    {
      packageKey: "applicant_city",
      formName: "SF-424",
      boxRef: "8d",
      label: "Address — City",
      elementType: "text",
      stepId: "TODO: unknown until in-session capture",
      selector: { id: "TODO: in-session selector capture" },
    },
    {
      packageKey: "applicant_state",
      formName: "SF-424",
      boxRef: "8d",
      label: "Address — State",
      elementType: "select",
      stepId: "TODO: unknown until in-session capture",
      transform: "state_name_to_code",
      selector: { id: "TODO: in-session selector capture" },
    },
    {
      packageKey: "applicant_zip",
      formName: "SF-424",
      boxRef: "8d",
      label: "Address — ZIP",
      elementType: "text",
      stepId: "TODO: unknown until in-session capture",
      selector: { id: "TODO: in-session selector capture" },
    },
    {
      packageKey: "applicant_congressional_district",
      formName: "SF-424",
      boxRef: "16",
      label: "Congressional District (Applicant)",
      elementType: "text",
      stepId: "TODO: unknown until in-session capture",
      selector: { id: "TODO: in-session selector capture" },
    },
    {
      packageKey: "project_title",
      formName: "SF-424",
      boxRef: "15",
      label: "Descriptive Title of Applicant's Project",
      elementType: "textarea",
      stepId: "TODO: unknown until in-session capture",
      selector: { id: "TODO: in-session selector capture" },
    },
    {
      packageKey: "project_start_date",
      formName: "SF-424",
      boxRef: "17",
      label: "Proposed Project Start Date",
      elementType: "date",
      stepId: "TODO: unknown until in-session capture",
      transform: "date_iso_to_mmddyyyy",
      selector: { id: "TODO: in-session selector capture" },
    },
    {
      packageKey: "project_end_date",
      formName: "SF-424",
      boxRef: "17",
      label: "Proposed Project End Date",
      elementType: "date",
      stepId: "TODO: unknown until in-session capture",
      transform: "date_iso_to_mmddyyyy",
      selector: { id: "TODO: in-session selector capture" },
    },
    {
      packageKey: "federal_funding_requested",
      formName: "SF-424",
      boxRef: "18a",
      label: "Estimated Funding — Federal",
      elementType: "text",
      stepId: "TODO: unknown until in-session capture",
      transform: "currency_plain",
      selector: { id: "TODO: in-session selector capture" },
    },
    {
      packageKey: "total_project_cost",
      formName: "SF-424",
      boxRef: "18",
      label: "Estimated Funding — Total",
      elementType: "text",
      stepId: "TODO: unknown until in-session capture",
      transform: "currency_plain",
      selector: { id: "TODO: in-session selector capture" },
    },
    {
      packageKey: "authorized_representative_name",
      formName: "SF-424",
      boxRef: "21",
      label: "Authorized Representative — Name",
      elementType: "text",
      stepId: "TODO: unknown until in-session capture",
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
      stepId: "TODO: unknown until in-session capture",
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
      stepId: "TODO: unknown until in-session capture",
      role: "date_signed",
      neverFill: true,
      selector: { id: "TODO: in-session selector capture" },
    },
  ],
};
