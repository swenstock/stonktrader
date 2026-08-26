const express=require('express');
const router=express.Router();
const db=require('../db');
const reserveLedger=require('../reserveLedger');
const freerollReserve=require('../freerollReserveV45');
const {getContestFundingPoolStatus}=require('../contestJuniorFundingPool');
const {getBalances}=require('../prizeReserveLedger');
const {SUBUNITS_PER_STONK}=require('../prizeReserveLedger');

function stonk(n){return Number(n)/Number(SUBUNITS_PER_STONK)}
router.get('/',(req,res)=>{
  const legacyReserves=reserveLedger.balances();
  const prizePool=getContestFundingPoolStatus(db);
  const prizeBalances=getBalances(db);
  const freerollV45=freerollReserve.all().map(r=>({categoryId:r.category_id,balanceStonk:Number(r.balance_stonk),contributedLifetime:Number(r.contributed_lifetime),spentLifetime:Number(r.spent_lifetime),updatedAt:r.updated_at}));
  const ticketRows=db.prepare(`SELECT ticket_type,COUNT(*) owned_count,COALESCE(SUM(COALESCE(backing_stonk,value_stonk)),0) backing FROM tickets WHERE status IN ('unredeemed','listed') AND ticket_type IN ('runner','clerk','trader','junior') GROUP BY ticket_type`).all();
  const outstandingTickets=Object.fromEntries(ticketRows.map(r=>[r.ticket_type,{count:Number(r.owned_count),backingStonk:Number(r.backing)}]));
  res.json({
    jrBrokerBadges:{
      fundingUnitStonk:40000,
      unallocatedCarryStonk:stonk(prizePool.unallocatedSubunits),
      fundableNow:Number(prizePool.fundableWonJuniors),
      outstandingBackingStonk:stonk(prizePool.backingLiabilitySubunits),
      brokerReserveStonk:stonk(prizeBalances.broker_reserve.balanceSubunits),
      overflowReserveStonk:stonk(prizeBalances.overflow_reserve.balanceSubunits),
      badgesPerActivatedBroker:20,
    },
    freerollV45,
    outstandingTickets,
    legacyReserveLedger:legacyReserves,
    note:'Main Event is retired from the active prize path. Legacy reserve rows remain historical accounting only.',
  });
});
module.exports=router;
