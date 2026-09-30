// The shop's opening hours, as the FAQ, the contact page and the LocalBusiness
// markup state them. The week below is the one the owner confirmed on
// 2026-09-30 (and the column default in db/schema.sql).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatTime,
  hoursGroups,
  hoursLines,
  hoursSentence,
  normalizeHours,
  openingHoursJsonLd,
} from '../src/lib/hours.js'

const WEEK = {
  mon: ['09:00', '17:00'],
  tue: ['09:00', '17:00'],
  wed: ['09:00', '17:00'],
  thu: ['09:00', '17:00'],
  fri: ['09:00', '17:00'],
  sat: ['09:00', '14:00'],
  sun: null,
}

test('times read as a person says them', () => {
  assert.equal(formatTime('09:00'), '9:00 AM')
  assert.equal(formatTime('17:00'), '5:00 PM')
  assert.equal(formatTime('12:30'), '12:30 PM')
  assert.equal(formatTime('00:15'), '12:15 AM')
})

test('the confirmed week, as a sentence', () => {
  assert.equal(
    hoursSentence(WEEK),
    'Monday to Friday 9:00 AM to 5:00 PM, and Saturday 9:00 AM to 2:00 PM. Closed on Sunday.',
  )
})

test('the confirmed week, as lines', () => {
  assert.deepEqual(hoursLines(WEEK), [
    { label: 'Monday to Friday', value: '9:00 AM to 5:00 PM' },
    { label: 'Saturday', value: '9:00 AM to 2:00 PM' },
    { label: 'Sunday', value: 'Closed' },
  ])
})

test('structured data lists open days only, grouped', () => {
  const spec = openingHoursJsonLd(WEEK)
  assert.equal(spec.length, 2)
  assert.deepEqual(spec[0].dayOfWeek, [
    'https://schema.org/Monday',
    'https://schema.org/Tuesday',
    'https://schema.org/Wednesday',
    'https://schema.org/Thursday',
    'https://schema.org/Friday',
  ])
  assert.equal(spec[0].opens, '09:00')
  assert.equal(spec[0].closes, '17:00')
  assert.deepEqual(spec[1].dayOfWeek, ['https://schema.org/Saturday'])
  assert.equal(spec[1].closes, '14:00')
})

test('days with equal hours only group when they are consecutive', () => {
  const week = { ...WEEK, wed: null }
  assert.deepEqual(
    hoursGroups(week).map((g) => g.days.join(',')),
    ['mon,tue', 'wed', 'thu,fri', 'sat', 'sun'],
  )
  assert.match(hoursSentence(week), /^Monday and Tuesday 9:00 AM to 5:00 PM, Thursday and Friday/)
  assert.match(hoursSentence(week), /Closed on Wednesday and Sunday\.$/)
})

test('bad or empty input says nothing rather than something wrong', () => {
  assert.equal(normalizeHours(null), null)
  assert.equal(normalizeHours({}), null)
  assert.equal(hoursSentence(null), '')
  assert.deepEqual(openingHoursJsonLd(undefined), [])
  // A closing time before the opening time is not a real day: it reads as closed.
  assert.equal(normalizeHours({ ...WEEK, mon: ['17:00', '09:00'] }).mon, null)
  assert.equal(normalizeHours({ ...WEEK, tue: ['9am', '5pm'] }).tue, null)
})
