/**
 * Applicant-tracking-system adapters. The generic heuristics handle most
 * forms; adapters add high-confidence selector hints for known platforms and
 * identify the ATS for the report and application log.
 */
import type { FieldHint } from './classifier';

export interface AtsAdapter {
  id: string;
  name: string;
  /** Tested against `location.hostname`. */
  host: RegExp;
  /** Tested against iframe `src` when the ATS is embedded on a company site. */
  embed?: RegExp;
  hints: FieldHint[];
}

export const ADAPTERS: readonly AtsAdapter[] = [
  {
    id: 'greenhouse',
    name: 'Greenhouse',
    host: /(^|\.)greenhouse\.io$/,
    embed: /greenhouse\.io/,
    hints: [
      { selector: '#first_name', type: 'firstName' },
      { selector: '#last_name', type: 'lastName' },
      { selector: '#preferred_name', type: 'preferredName' },
      { selector: '#email', type: 'email' },
      { selector: '#phone', type: 'phone' },
      { selector: '#resume, input[type="file"][id*="resume"]', type: 'resume' },
      { selector: '#cover_letter, input[type="file"][id*="cover_letter"]', type: 'coverLetter' },
      { selector: '#candidate-location, #job_application_location', type: 'location' },
      { selector: '#gender', type: 'gender' },
      { selector: '#hispanic_ethnicity', type: 'hispanic' },
      { selector: '#race', type: 'race' },
      { selector: '#veteran_status', type: 'veteran' },
      { selector: '#disability_status', type: 'disability' },
    ],
  },
  {
    id: 'lever',
    name: 'Lever',
    host: /(^|\.)lever\.co$/,
    embed: /lever\.co/,
    hints: [
      { selector: 'input[name="name"]', type: 'fullName' },
      { selector: 'input[name="email"]', type: 'email' },
      { selector: 'input[name="phone"]', type: 'phone' },
      { selector: 'input[name="location"]', type: 'location' },
      { selector: 'input[name="org"]', type: 'work.company' },
      { selector: 'input[name="urls[LinkedIn]"]', type: 'linkedin' },
      { selector: 'input[name="urls[GitHub]"]', type: 'github' },
      { selector: 'input[name="urls[Twitter]"]', type: 'twitter' },
      { selector: 'input[name="urls[Portfolio]"]', type: 'portfolio' },
      { selector: 'input[name="urls[Other]"]', type: 'otherUrl' },
      { selector: 'input[name="resume"]', type: 'resume' },
      { selector: 'textarea[name="comments"]', type: 'coverLetter' },
      { selector: 'select[name="eeo[gender]"]', type: 'gender' },
      { selector: 'select[name="eeo[race]"]', type: 'race' },
      { selector: 'select[name="eeo[veteran]"]', type: 'veteran' },
      { selector: 'select[name="eeo[disability]"]', type: 'disability' },
    ],
  },
  {
    id: 'workday',
    name: 'Workday',
    host: /(^|\.)(myworkdayjobs\.com|myworkdaysite\.com|workday\.com)$/,
    embed: /myworkday(jobs|site)\.com/,
    hints: [
      { selector: '[data-automation-id="legalNameSection_firstName"]', type: 'firstName' },
      { selector: '[data-automation-id="legalNameSection_middleName"]', type: 'middleName' },
      { selector: '[data-automation-id="legalNameSection_lastName"]', type: 'lastName' },
      { selector: '[data-automation-id="preferredNameSection_firstName"]', type: 'preferredName' },
      { selector: '[data-automation-id="addressSection_addressLine1"]', type: 'address1' },
      { selector: '[data-automation-id="addressSection_addressLine2"]', type: 'address2' },
      { selector: '[data-automation-id="addressSection_city"]', type: 'city' },
      { selector: '[data-automation-id="addressSection_postalCode"]', type: 'postalCode' },
      { selector: '[data-automation-id="addressSection_countryRegion"]', type: 'state' },
      { selector: '[data-automation-id="countryDropdown"]', type: 'country' },
      { selector: '[data-automation-id="email"]', type: 'email' },
      { selector: '[data-automation-id="phone-number"]', type: 'phone' },
      { selector: '[data-automation-id="phone-device-type"]', type: 'phoneType' },
      { selector: '[data-automation-id="countryPhoneCode"]', type: 'phoneCountryCode' },
      { selector: '[data-automation-id="file-upload-input-ref"]', type: 'resume' },
      { selector: '[data-automation-id="jobTitle"]', type: 'work.title' },
      { selector: '[data-automation-id="company"]', type: 'work.company' },
      { selector: '[data-automation-id="location"]', type: 'work.location' },
      { selector: '[data-automation-id="currentlyWorkHere"]', type: 'work.current' },
      { selector: '[data-automation-id="description"]', type: 'work.description' },
      { selector: '[data-automation-id="school"]', type: 'edu.school' },
      { selector: '[data-automation-id="degree"]', type: 'edu.degree' },
      { selector: '[data-automation-id="gpa"]', type: 'edu.gpa' },
      { selector: '[data-automation-id="linkedinQuestion"]', type: 'linkedin' },
      { selector: '[data-automation-id="gender"]', type: 'gender' },
      { selector: '[data-automation-id="ethnicityDropdown"]', type: 'race' },
      { selector: '[data-automation-id="veteranStatus"]', type: 'veteran' },
    ],
  },
  {
    id: 'ashby',
    name: 'Ashby',
    host: /(^|\.)ashbyhq\.com$/,
    embed: /ashbyhq\.com/,
    hints: [
      { selector: 'input[name="_systemfield_name"]', type: 'fullName' },
      { selector: 'input[name="_systemfield_email"]', type: 'email' },
      { selector: 'input[name="_systemfield_phone"]', type: 'phone' },
      { selector: 'input[name="_systemfield_location"]', type: 'location' },
      {
        selector: 'input[name="_systemfield_resume"], input[id="_systemfield_resume"]',
        type: 'resume',
      },
    ],
  },
  {
    id: 'smartrecruiters',
    name: 'SmartRecruiters',
    host: /(^|\.)smartrecruiters\.com$/,
    hints: [],
  },
  { id: 'icims', name: 'iCIMS', host: /(^|\.)icims\.com$/, embed: /icims\.com/, hints: [] },
  { id: 'jobvite', name: 'Jobvite', host: /(^|\.)jobvite\.com$/, embed: /jobvite\.com/, hints: [] },
  { id: 'bamboohr', name: 'BambooHR', host: /(^|\.)bamboohr\.com$/, hints: [] },
  {
    id: 'workable',
    name: 'Workable',
    host: /(^|\.)workable\.com$/,
    embed: /workable\.com/,
    hints: [],
  },
  { id: 'taleo', name: 'Taleo', host: /(^|\.)taleo\.net$/, hints: [] },
  {
    id: 'successfactors',
    name: 'SAP SuccessFactors',
    host: /(^|\.)(successfactors\.(com|eu)|sapsf\.com)$/,
    hints: [],
  },
  { id: 'breezy', name: 'Breezy HR', host: /(^|\.)breezy\.hr$/, hints: [] },
  { id: 'jazzhr', name: 'JazzHR', host: /(^|\.)(applytojob\.com|jazzhr\.com)$/, hints: [] },
  { id: 'recruitee', name: 'Recruitee', host: /(^|\.)recruitee\.com$/, hints: [] },
  { id: 'rippling', name: 'Rippling', host: /(^|\.)rippling(-ats)?\.com$/, hints: [] },
  { id: 'teamtailor', name: 'Teamtailor', host: /(^|\.)teamtailor\.com$/, hints: [] },
  { id: 'personio', name: 'Personio', host: /(^|\.)personio\.(de|com)$/, hints: [] },
  { id: 'oracle', name: 'Oracle Recruiting', host: /(^|\.)oraclecloud\.com$/, hints: [] },
];

export function detectAts(hostname: string): AtsAdapter | null {
  const host = hostname.toLowerCase();
  return ADAPTERS.find((a) => a.host.test(host)) ?? null;
}

/** An ATS iframe embedded in a company careers page (e.g. Greenhouse's #grnhse_iframe). */
export function findEmbeddedAts(doc: Document): AtsAdapter | null {
  for (const frame of Array.from(doc.querySelectorAll('iframe'))) {
    const src = frame.getAttribute('src') ?? '';
    if (frame.id === 'grnhse_iframe') return ADAPTERS[0]!;
    const hit = ADAPTERS.find((a) => a.embed?.test(src));
    if (hit) return hit;
  }
  return null;
}
