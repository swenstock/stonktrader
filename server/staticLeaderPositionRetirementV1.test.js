const assert=require('assert');
const fs=require('fs');
const {
  exactV45Shell,
  applyStaticLeaderPositionRetirementPatch,
  STATIC_LEADER_POSITION_RETIREMENT_MARKER,
}=require('./v45ExactShell');

const shell=exactV45Shell.toString('utf8');
assert(shell.includes(STATIC_LEADER_POSITION_RETIREMENT_MARKER),'retirement marker missing');
assert(!shell.includes('YOUR POSITION'),'static YOUR POSITION card still present');
assert(!shell.includes('id="leaderYourRank"'),'static leaderYourRank still present');
assert(!shell.includes('id="leaderYourPnl"'),'static leaderYourPnl still present');
assert(shell.includes('LAST PRIZE-PAYING SPOT'),'unrelated money-line card changed');
assert(shell.includes('TO THE MONEY'),'unrelated gap card changed');
assert(shell.includes('onclick="openGlobalFindMe()"'),'existing find-me control changed');

const idempotent=applyStaticLeaderPositionRetirementPatch(exactV45Shell).toString('utf8');
assert.strictEqual(idempotent,shell,'retirement patch is not idempotent');

const leaderboard=fs.readFileSync('public/v45-leaderboard-v30.js','utf8');
assert(leaderboard.includes("'NOT ENTERED'"),'real not-entered state missing');
assert(leaderboard.includes("'SIGN IN TO FIND ME'"),'real signed-out state missing');
assert(leaderboard.includes("mine?'🎯 FIND ME'"),'real entered-state find control missing');
assert(leaderboard.includes('Your real entry:'),'real entered-state identity note missing');
console.log('Static Leader Position Retirement V1: PASS');
