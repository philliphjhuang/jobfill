/**
 * Declarative classification rules. Each rule maps text patterns (tested on
 * normalized label / attribute / placeholder text) to a field type.
 *
 * Adding support for a new question is usually a one-line change here plus a
 * test case in tests/unit/classifier.test.ts.
 */
import type { ControlKind, FieldType, SectionKind } from './model';

export interface Rule {
  type: FieldType;
  /** Pattern tested against the label, attribute tokens and placeholder. */
  match: RegExp;
  /** Reject when this matches the same text. */
  not?: RegExp;
  /** Control kinds this rule may apply to (default: all). */
  kinds?: readonly ControlKind[];
  /** Only apply inside these sections. */
  sections?: readonly SectionKind[];
  /** Never apply inside these sections. */
  notSections?: readonly SectionKind[];
  /** Added to the score to break ties between overlapping rules. */
  priority?: number;
}

const TEXT: readonly ControlKind[] = ['text', 'textarea', 'combobox'];
const SHORT_TEXT: readonly ControlKind[] = ['text', 'combobox'];
const CHOICE: readonly ControlKind[] = [
  'select',
  'radio',
  'combobox',
  'checkbox',
  'checkbox-group',
];
const ANY_VALUE: readonly ControlKind[] = [...TEXT, ...CHOICE, 'date'];
const DATE_LIKE: readonly ControlKind[] = ['text', 'date', 'select', 'combobox'];
const ENTRY: readonly SectionKind[] = ['work', 'education'];

/** Labels about someone other than the applicant (references, emergency contacts). */
export const PEOPLE_NOT =
  /\b(emergency|reference|referr\w*|recruiter|manager|supervisor|parent|spouse|guardian|hiring)\b/;

// Only used inside work/education sections, so a label merely starting with
// "From"/"To" ("To (Actual or Expected) Year") is safe to treat as a date.
const START =
  /^(from|start|started|began)\b|\bmonth\s*from\b|\byear\s*from\b|\bstart\s*(date|month|year|time)\b|\bdate\s*(started|from)\b|\bfrom\s*(date|month|year)\b|\bbegin(ning)?\s*(date|month|year)\b/;
const END =
  /^(to|end|until|ended|through)\b|\bmonth\s*to\b|\byear\s*to\b|\bend\s*(date|month|year|time)\b|\bdate\s*(ended|to|left)\b|\bto\s*(date|month|year)\b|\bfinish\s*date\b/;
const GRADUATION =
  /\bgraduat(ion|ed|e)\b.*\b(date|year|month)\b|\b(expected|anticipated)\s*graduation\b|\bgrad(uation)?\s*(date|year)\b|\bcompletion\s*date\b|\bclass\s*of\b|\byear\s*of\s*graduation\b|^graduation$/;

export const RULES: readonly Rule[] = [
  // ── Identity ──────────────────────────────────────────────────────────────
  {
    type: 'firstName',
    match: /\b(first|given|fore)\s*name\b|^first$|^fname$/,
    not: /\b(preferred|nick)\b|last\s*name|\bmiddle\b/,
    kinds: SHORT_TEXT,
  },
  {
    type: 'lastName',
    match: /\b(last|family|sur)\s*name\b|^surname$|^last$|^lname$/,
    kinds: SHORT_TEXT,
  },
  {
    type: 'middleName',
    match: /\bmiddle\s*(name|initial)s?\b|^mi$/,
    kinds: SHORT_TEXT,
    priority: 2,
  },
  {
    type: 'preferredName',
    match:
      /\b(preferred|nick)\s*(first\s*)?name\b|^nickname$|\bgo(es)?\s*by\b|\bname\s*you\s*(prefer|go\s*by)\b/,
    kinds: SHORT_TEXT,
    priority: 5,
  },
  {
    type: 'fullName',
    match:
      /^(your\s+)?(full\s+|legal\s+|complete\s+)?name$|\bfull\s*(legal\s*)?name\b|\blegal\s*name\b|^name\s+(first\s+(and\s+)?last|surname)|\b(electronic\s*)?signature\b|\b(type|enter)\s*your\s*(full\s*|legal\s*)?name\b/,
    not: /\b(company|school|employer|user|file|business|university|institution|college|organi[sz]ation|contact|pet|project|degree|account|display)\b|\b(first|last|middle|preferred)\s*name\b/,
    kinds: SHORT_TEXT,
  },
  {
    type: 'email',
    match: /\be\s*mail\b|\bemail\s*address\b/,
    not: /\b(subscribe|newsletter|alerts?|marketing|consent|may\s+we|can\s+we)\b/,
    kinds: ['text'],
  },
  {
    type: 'phone',
    match: /\b(phone|mobile|cell|telephone|tel)\b|\bcontact\s*number\b/,
    not: /\b(device|phone)\s*type\b|\bextension\b|\bext\b|\bsms\b|\btext\s*message|\binterview\b/,
    kinds: ['text'],
  },
  {
    type: 'phoneCountryCode',
    match:
      /\b(country|dial|dialing|calling)\s*code\b|\bphone\s*(country|prefix)\b|\bcountry\s*phone\b|\bdialing\b/,
    not: /\bnumber\b|\bzip\b|\bpostal\b/,
    kinds: ['text', 'select', 'combobox'],
    priority: 10,
  },
  {
    type: 'phoneType',
    match: /\b(phone|device)\s*type\b|\btype\s*of\s*phone\b/,
    kinds: CHOICE,
    priority: 10,
  },

  // ── Address ───────────────────────────────────────────────────────────────
  {
    type: 'address2',
    match: /\baddress\s*(line\s*)?(2|two)\b|\b(apt|apartment|suite|unit|flat)\b/,
    not: /\be\s*mail\b/,
    kinds: SHORT_TEXT,
    priority: 5,
  },
  {
    type: 'address1',
    match: /\bstreet\b|\baddress(\s*line)?(\s*(1|one))?\b|\bmailing\s*address\b/,
    not: /\be\s*mail\b|\bemail\b|\bweb\b|\burl\b|\bip\b|\bline\s*(2|two)\b|\b(city|state|zip|postal|country)\b/,
    kinds: TEXT,
  },
  {
    type: 'city',
    match: /\bcity\b|\btown\b|\bmunicipality\b/,
    not: /\b(state|province|country|zip|postal|citizen\w*|ethnic\w*)\b|\b(preferred|desired|willing)\b/,
    kinds: ['text', 'select', 'combobox'],
  },
  {
    type: 'state',
    match: /\b(state|province|region|prefecture)\b/,
    not: /\bstatement\b|\bunited\s*states\b|\b(city|country|zip|postal)\b|^(please\s+)?state\s+(your|the|why|how|what|any)\b/,
    kinds: ['text', 'select', 'combobox'],
  },
  {
    type: 'postalCode',
    match: /\b(zip|postal|post)\s*code\b|\bpostcode\b|\bzip\b|^postal$/,
    kinds: ['text'],
  },
  {
    type: 'country',
    match: /\bcountry\b/,
    not: /\b(code|dial|calling|phone|citizen\w*|nationality|countries|authori[sz]ed|legally|visa|sponsor\w*)\b/,
    kinds: ['text', 'select', 'combobox'],
  },
  {
    type: 'location',
    match:
      /^(current\s+|your\s+|home\s+|present\s+)?location$|\b(current|home|present)\s+location\b|\bcity\s*(and|,|\/)?\s*state\b|\bwhere\s+(are\s+you|do\s+you)\s+(currently\s+)?(located|based|live|reside)\b|^location\s*(city|city state)?$|\bcurrently\s+(located|based|reside)\b|\bcity\s*of\s*residence\b/,
    kinds: ['text', 'select', 'combobox'],
    notSections: ENTRY,
    priority: 5,
  },

  // ── Links ────────────────────────────────────────────────────────────────
  { type: 'linkedin', match: /\blinked\s*in\b/, kinds: SHORT_TEXT, priority: 10 },
  { type: 'github', match: /\bgit\s*hub\b/, kinds: SHORT_TEXT, priority: 10 },
  {
    type: 'twitter',
    match: /\btwitter\b|\bx\s*(com\s*)?(profile|handle|url|account)\b/,
    kinds: SHORT_TEXT,
    priority: 8,
  },
  {
    type: 'portfolio',
    match:
      /\bportfolio\b|\bweb\s*site\b|\bpersonal\s*(url|link|page|site)\b|\bhome\s*page\b|\bblog\b/,
    not: /\blinked\s*in\b|\bgit\s*hub\b|\btwitter\b|\bcompany\s*web\s*site\b|\bour\s*web\s*site\b/,
    kinds: SHORT_TEXT,
    priority: 5,
  },
  {
    type: 'otherUrl',
    match:
      /\bother\s*(url|link|website|profile)s?\b|^urls?$|^links?$|\bsocial\s*(media\s*)?(profile|link|url)s?\b|\bonline\s*profile\b/,
    kinds: SHORT_TEXT,
    priority: 7,
  },

  // ── Documents ────────────────────────────────────────────────────────────
  {
    type: 'coverLetter',
    match:
      /\bcover\s*letter\b|\bmotivation(al)?\s*letter\b|\bletter\s*of\s*(interest|motivation)\b/,
    kinds: ['file', 'textarea'],
    priority: 10,
  },
  { type: 'resume', match: /\bresume\b|\bcv\b|\bcurriculum\s*vitae\b/, kinds: ['file'] },

  // ── Work history ─────────────────────────────────────────────────────────
  {
    type: 'work.company',
    match: /\b(company|employer|organi[sz]ation|business)(\s*name)?\b|\bworked\s*at\b/,
    not: /\b(web\s*site|url|size|industry|type|e\s*mail|phone|address)\b/,
    kinds: ['text', 'combobox'],
    sections: ['work'],
  },
  {
    type: 'work.company',
    match:
      /\b(current|present|most\s*recent|latest)\s*(company|employer|organi[sz]ation)\b|^(current\s+)?(company|employer)(\s+name)?$/,
    kinds: ['text', 'combobox'],
    notSections: ['work'],
  },
  {
    type: 'work.title',
    match: /\b(job\s*)?title\b|\bposition\b|\brole\b|\bdesignation\b|\boccupation\b/,
    not: /\b(description|responsibilit\w*|salary|level)\b/,
    kinds: ['text', 'combobox'],
    sections: ['work'],
  },
  {
    type: 'work.title',
    match:
      /\b(current|present|most\s*recent|latest)\s*(job\s*)?(title|position|role)\b|^(current\s+)?(job\s+)?title$/,
    kinds: ['text', 'combobox'],
    notSections: ['work', 'education'],
  },
  {
    type: 'work.location',
    match: /\blocation\b|\bcity\b/,
    kinds: ['text', 'combobox'],
    sections: ['work'],
    priority: 8,
  },
  { type: 'work.start', match: START, kinds: DATE_LIKE, sections: ['work'], priority: 5 },
  { type: 'work.end', match: END, kinds: DATE_LIKE, sections: ['work'], priority: 5 },
  {
    type: 'work.current',
    match:
      /\bcurrent(ly)?\s*(work|working|employed|employer|role|job|position)\b|\b(currently|still)\s+work\b|\bi\s*work\s*here\b|\bpresent\b|^current$/,
    kinds: ['checkbox'],
    priority: 10,
  },
  {
    type: 'work.description',
    match:
      /\bdescription\b|\bresponsibilit|\bduties\b|\bachievements?\b|\baccomplishments?\b|\bsummary\b|\bwhat\s*did\s*you\s*do\b/,
    kinds: ['textarea', 'text'],
    sections: ['work'],
    priority: 5,
  },

  // ── Education ────────────────────────────────────────────────────────────
  {
    type: 'edu.school',
    match:
      /\bschool\b|\buniversity\b|\bcollege\b|\binstitution\b|\binstitute\b|\bacademy\b|\balma\s*mater\b/,
    not: /\b(major|degree|gpa|field|year|date|city|location|country|state|diploma)\b|\bhigh\s*school\s*(diploma|graduate)\b/,
    kinds: ['text', 'select', 'combobox'],
  },
  {
    type: 'edu.degree',
    match:
      /\bdegree\b|\bqualification\b|\bdiploma\b|\blevel\s*of\s*education\b|\beducation\s*level\b|\bhighest\s*(level\s*of\s*)?education\b/,
    not: /\bdegree\s*of\b|\bfield\b|\bmajor\b|\bdiscipline\b|\b360\b/,
    kinds: ['text', 'select', 'combobox', 'radio'],
  },
  {
    type: 'edu.field',
    match:
      /\bfield\s*of\s*study\b|\bmajor\b|\bconcentration\b|\barea\s*of\s*study\b|\bcourse\s*of\s*study\b/,
    kinds: ['text', 'select', 'combobox'],
    priority: 5,
  },
  {
    type: 'edu.field',
    match: /\bdiscipline\b|\bspeciali[sz]ation\b|\bprogram\b|\bstudy\b|\bsubject\b/,
    kinds: ['text', 'select', 'combobox'],
    sections: ['education'],
  },
  {
    type: 'edu.gpa',
    match: /\bgpa\b|\bgrade\s*point\b|\bcgpa\b/,
    kinds: ['text', 'select'],
    priority: 5,
  },
  {
    type: 'edu.gpa',
    match: /\bgrades?\b|\bcumulative\b|\bscore\b/,
    kinds: ['text', 'select'],
    sections: ['education'],
  },
  { type: 'edu.start', match: START, kinds: DATE_LIKE, sections: ['education'], priority: 5 },
  { type: 'edu.end', match: END, kinds: DATE_LIKE, sections: ['education'], priority: 5 },
  { type: 'edu.end', match: GRADUATION, kinds: DATE_LIKE, priority: 6 },

  // ── Eligibility & preferences ────────────────────────────────────────────
  {
    type: 'yearsExperience',
    match:
      /\byears?\s*(of\s*)?(professional\s*|relevant\s*|work\s*|industry\s*|total\s*|related\s*)?experience\b|\bhow\s*many\s*years\b|\bexperience\s*(in\s*)?years\b/,
    kinds: ANY_VALUE,
  },
  {
    type: 'sponsorship',
    match:
      /\bsponsor(ship|ed)?\b|\bvisa\b|\bh\s*1\s*b\b|\bimmigration\s*(support|assistance|status)\b/,
    kinds: [...CHOICE, 'text'],
    priority: 6,
  },
  {
    type: 'workAuthorization',
    match:
      /\b(legally\s*)?(authori[sz]ed|eligible|permitted|entitled)\s*to\s*(legally\s*)?work\b|\bwork\s*authori[sz]ation\b|\bright\s*to\s*work\b|\bemployment\s*eligibility\b|\beligib(le|ility)\s*(for|to)\s*(employment|work)\b|\bwork\s*permit\b|\blegal(ly)?\s*(able|allowed)\s*to\s*work\b/,
    kinds: [...CHOICE, 'text'],
    priority: 4,
  },
  { type: 'relocate', match: /\breloca/, kinds: [...CHOICE, 'text'], priority: 6 },
  {
    type: 'over18',
    match:
      /\b(18|eighteen)\s*(years|yrs|\+)|\bat\s*least\s*(18|eighteen)\b|\bover\s*(the\s*age\s*of\s*)?(18|eighteen)\b|\blegal\s*(working\s*)?age\b|\bage\s*of\s*majority\b|\bunder\s*(the\s*age\s*of\s*)?(18|eighteen)\b/,
    kinds: [...CHOICE, 'text'],
    priority: 6,
  },
  {
    type: 'preferredLocations',
    match:
      /\b(preferred|desired|preference|prefer)\b.*\b(location|office|city|cities|site|region)s?\b|\blocation\s*preference|\bwhich\s*(of\s*(our|the|these)\s*)?(office|location|site|hub)s?\b|\bwhere\s*would\s*you\s*(like|prefer)\s*to\s*work\b|\b(office|location)s?\s*(are\s*you\s*)?(interested|open)\b|\bwilling\s*to\s*work\s*(in|from|at)\b/,
    kinds: ANY_VALUE,
    priority: 8,
  },
  {
    type: 'workArrangement',
    match:
      /\bremote\b|\bhybrid\b|\bon\s*site\b|\bin\s*(the\s*)?office\b|\bwork\s*(arrangement|model|setting|environment|style)\b|\bin\s*person\b/,
    kinds: [...CHOICE],
    priority: 2,
  },
  {
    type: 'salary',
    match:
      /\bsalary\b|\bcompensation\b|\bpay\s*(expectation|range|requirement)s?\b|\b(expected|desired)\s*(pay|rate|wage)\b|\bremuneration\b|\bhourly\s*rate\b/,
    kinds: ANY_VALUE,
    priority: 3,
  },
  {
    type: 'noticePeriod',
    match: /\bnotice\s*period\b|\bweeks?\s*notice\b/,
    kinds: ANY_VALUE,
    priority: 5,
  },
  {
    type: 'availableStart',
    match:
      /\b(earliest|available|availability|possible)\b.*\bstart\b|\bwhen\s*(can|could|would)\s*you\s*(start|begin|join)\b|\bstart\s*date\b|\bdate\s*(available|of\s*availability)\b|\bavailab(le|ility)\s*(date|to\s*start)\b/,
    kinds: ANY_VALUE,
    notSections: ENTRY,
    priority: 3,
  },
  {
    type: 'howHeard',
    match:
      /\bhow\s*did\s*you\s*(hear|find|learn|come\s*across|discover)\b|\bwhere\s*did\s*you\s*(hear|find|learn|see)\b|\b(referral|application|candidate|lead|job)\s*source\b|^source$|\bhow\s*were\s*you\s*referred\b/,
    kinds: ANY_VALUE,
    priority: 5,
  },
  {
    type: 'clearance',
    match: /\bsecurity\s*clearance\b|\bclearance\s*(level|status)\b|^clearance$/,
    kinds: ANY_VALUE,
    priority: 5,
  },
  { type: 'citizenship', match: /\bcitizenship\b|\bcitizen\b|\bnationality\b/, kinds: ANY_VALUE },
  {
    type: 'languages',
    match:
      /\blanguages?\b.*\b(speak|spoken|fluent|proficien\w*)\b|\b(spoken|foreign)\s*languages?\b|^languages?$/,
    not: /\bprogramming\b/,
    kinds: TEXT,
    priority: 2,
  },
  {
    type: 'skills',
    match:
      /\b(technical\s*|key\s*|relevant\s*)?skills?\b|\btechnologies\b|\btech\s*stack\b|\bprogramming\s*languages?\b/,
    kinds: TEXT,
    priority: -5,
  },
  {
    type: 'summary',
    match:
      /\b(professional\s*)?summary\b|\babout\s*(yourself|you)\b|\btell\s*us\s*(a\s*(little\s*)?bit\s*)?about\s*yourself\b|\bintroduce\s*yourself\b|\bbio(graphy)?\b|\bpersonal\s*statement\b/,
    kinds: ['textarea', 'text'],
    notSections: ['work'],
  },

  // ── Voluntary self-identification (EEO) ──────────────────────────────────
  {
    type: 'gender',
    match: /\bgender\b|\bsex\b/,
    not: /\bsexual\s*orientation\b|\btransgender\b|\bpronoun/,
    kinds: CHOICE,
    priority: 4,
  },
  { type: 'pronouns', match: /\bpronouns?\b/, kinds: [...CHOICE, 'text'], priority: 6 },
  {
    type: 'race',
    match: /\brace\b|\bethnicit(y|ies)\b|\bracial\b|\bethnic\s*(background|origin|group)\b/,
    kinds: CHOICE,
    priority: 4,
  },
  {
    type: 'hispanic',
    match: /\bhispanic\b|\blatin[oax]\b/,
    not: /\brace\b|\bethnicit/,
    kinds: CHOICE,
    priority: 6,
  },
  {
    type: 'veteran',
    match: /\bveteran\b|\bmilitary\b|\barmed\s*forces\b/,
    kinds: CHOICE,
    priority: 4,
  },
  {
    type: 'disability',
    match: /\bdisabilit(y|ies)\b|\bdisabled\b|\bhandicap/,
    kinds: CHOICE,
    priority: 4,
  },
  {
    type: 'sexualOrientation',
    match: /\bsexual\s*orientation\b/,
    kinds: [...CHOICE, 'text'],
    priority: 8,
  },
  { type: 'transgender', match: /\btransgender\b/, kinds: CHOICE, priority: 8 },
];

/** HTML autocomplete tokens → field types (most reliable signal when present). */
export const AUTOCOMPLETE_MAP: Readonly<Record<string, FieldType>> = {
  'given-name': 'firstName',
  'additional-name': 'middleName',
  'family-name': 'lastName',
  name: 'fullName',
  nickname: 'preferredName',
  email: 'email',
  tel: 'phone',
  'tel-national': 'phone',
  'tel-country-code': 'phoneCountryCode',
  'street-address': 'address1',
  'address-line1': 'address1',
  'address-line2': 'address2',
  'address-level2': 'city',
  'address-level1': 'state',
  'postal-code': 'postalCode',
  country: 'country',
  'country-name': 'country',
  organization: 'work.company',
  'organization-title': 'work.title',
};
