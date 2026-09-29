import { describe, expect, it } from 'vitest';
import {
  bestNumericOption,
  bestOption,
  isPlaceholderOption,
  looksLikeYesNo,
  parseRange,
  similarity,
} from '../../src/engine/matcher';
import {
  countryCandidates,
  DECLINE,
  degreeCandidates,
  DISABILITY,
  GENDER,
  hearAboutCandidates,
  RACE,
  stateForms,
  VETERAN,
} from '../../src/engine/synonyms';
import {
  cleanLabel,
  focusQuestion,
  normalize,
  normalizeIdentifier,
  tokenDice,
} from '../../src/engine/text';

const opts = (...labels: string[]) => labels.map((label) => ({ label, value: label }));
const pick = (labels: string[], candidates: string[]) => {
  const m = bestOption(opts(...labels), candidates);
  return m ? labels[m.index] : null;
};

describe('text normalization', () => {
  it('normalizes labels', () => {
    expect(normalize('First Name *')).toBe('first name');
    expect(normalize('Résumé/CV')).toBe('resume cv');
    expect(normalize('Phone (optional)')).toBe('phone');
    expect(normalize('R&D')).toBe('r and d');
  });

  it('splits identifiers', () => {
    expect(normalizeIdentifier('legalNameSection_firstName')).toBe('legal name section first name');
    expect(normalizeIdentifier('urls[LinkedIn]')).toBe('urls linked in');
    expect(normalizeIdentifier('job_application[first_name]')).toBe('job application first name');
  });

  it('cleans display labels', () => {
    expect(cleanLabel('  Email\n  * ')).toBe('Email');
    expect(cleanLabel('Resume/CV ✱')).toBe('Resume/CV');
  });

  it('computes token overlap', () => {
    expect(tokenDice('Black or African American', 'African American')).toBeGreaterThan(0.6);
    expect(tokenDice('Male', 'Female')).toBe(0);
  });

  it('focuses long labels on the question', () => {
    const long = `${'We are an equal opportunity employer. '.repeat(6)}Are you a protected veteran?`;
    expect(focusQuestion(long)).toBe('Are you a protected veteran?');
  });
});

describe('option matching', () => {
  it('skips placeholder options', () => {
    expect(isPlaceholderOption('Select...', '', 0)).toBe(true);
    expect(isPlaceholderOption('-- Please choose --', 'x', 0)).toBe(true);
    expect(isPlaceholderOption('Yes', 'yes', 1)).toBe(false);
  });

  it('never confuses Male with Female', () => {
    expect(pick(['Male', 'Female', 'Decline'], GENDER.female)).toBe('Female');
    expect(pick(['Woman', 'Man', 'Non-binary'], GENDER.male)).toBe('Man');
  });

  it('respects negation for veteran status', () => {
    const options = [
      'I am not a protected veteran',
      'I identify as one or more of the classifications of protected veteran',
      "I don't wish to answer",
    ];
    expect(pick(options, VETERAN.not_veteran)).toBe(options[0]);
    expect(pick(options, VETERAN.protected_veteran)).toBe(options[1]);
    expect(pick(options, VETERAN.decline)).toBe(options[2]);
    expect(similarity('I am not a protected veteran', 'Protected veteran')).toBeLessThan(0.5);
  });

  it('matches the standard disability form answers', () => {
    const options = [
      'Yes, I have a disability, or have had one in the past',
      'No, I do not have a disability and have not had one in the past',
      'I do not want to answer',
    ];
    expect(pick(options, DISABILITY.yes)).toBe(options[0]);
    expect(pick(options, DISABILITY.no)).toBe(options[1]);
    expect(pick(options, DISABILITY.decline)).toBe(options[2]);
  });

  it('matches race options with parenthetical qualifiers', () => {
    const options = [
      'Asian (United States of America)',
      'White (Not Hispanic or Latino)',
      'Two or More Races',
    ];
    expect(pick(options, RACE.asian)).toBe(options[0]);
    expect(pick(options, RACE.white)).toBe(options[1]);
    expect(pick(['Asian', 'Black', 'Decline To Self Identify'], DECLINE)).toBe(
      'Decline To Self Identify',
    );
  });

  it('resolves countries, states and degrees', () => {
    expect(pick(['Canada', 'United States of America', 'Mexico'], countryCandidates('USA'))).toBe(
      'United States of America',
    );
    expect(stateForms('ca')).toEqual({ full: 'California', abbr: 'CA' });
    expect(stateForms('new york')).toEqual({ full: 'New York', abbr: 'NY' });
    expect(
      pick(["Associate's", "Bachelor's Degree", "Master's Degree"], degreeCandidates('BS')),
    ).toBe("Bachelor's Degree");
    expect(pick(['Doctorate', "Master's Degree"], degreeCandidates('Ph.D.'))).toBe('Doctorate');
    expect(degreeCandidates('Doctor of Medicine')).toContain('MD');
  });

  it('maps referral sources', () => {
    expect(
      pick(['Company Website', 'Job Board', 'Social Media'], hearAboutCandidates('LinkedIn')),
    ).toBe('Social Media');
  });

  it('parses numeric ranges', () => {
    expect(parseRange('3-5 years')).toEqual([3, 5]);
    expect(parseRange('10+')).toEqual([10, Infinity]);
    expect(parseRange('$100k - $120k')).toEqual([100000, 120000]);
    expect(parseRange('Less than 1 year')?.[1]).toBeLessThan(1);
    expect(parseRange('Yes')).toBeNull();
    const years = opts(
      'Less than 1 year',
      '1-2 years',
      '3-5 years',
      '6-10 years',
      'More than 10 years',
    );
    expect(bestNumericOption(years, 4)).toBe(2);
    expect(bestNumericOption(years, 12)).toBe(4);
    expect(bestNumericOption(years, 0.5)).toBe(0);
  });

  it('detects yes/no option sets', () => {
    expect(looksLikeYesNo(opts('Select', 'Yes', 'No'))).toBe(true);
    expect(
      looksLikeYesNo(opts('Yes, I have a disability', 'No, I do not', 'I do not want to answer')),
    ).toBe(true);
    expect(looksLikeYesNo(opts('Male', 'Female'))).toBe(false);
  });
});
