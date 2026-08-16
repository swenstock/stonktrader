const assert = require('assert');
const { parseTestDate } = require('./testClock');

// August = EDT (UTC-4)
assert.equal(
  parseTestDate('2026-08-17T09:30').toISOString(),
  '2026-08-17T13:30:00.000Z',
  '9:30am ET in August must map to 13:30Z'
);

// January = EST (UTC-5)
assert.equal(
  parseTestDate('2027-01-04T09:30').toISOString(),
  '2027-01-04T14:30:00.000Z',
  '9:30am ET in January must map to 14:30Z'
);

// Explicit offsets remain absolute instants.
assert.equal(
  parseTestDate('2026-08-17T09:30:00-04:00').toISOString(),
  '2026-08-17T13:30:00.000Z'
);

console.log('testClock tests passed');
