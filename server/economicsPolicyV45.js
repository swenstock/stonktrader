'use strict';

// Canonical product economics. These are business rules, not deployment knobs.
// A missing environment variable must never silently turn a paid market into a
// fee-free market. Ticket and Badge P2P sales use the same 5% transaction fee.
const EXCHANGE_FEE_PCT = 0.05;

module.exports = Object.freeze({
  EXCHANGE_FEE_PCT,
});
