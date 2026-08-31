'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');
const { migrateLegacyPortfolioSchema, LEGACY_LABEL } = require('./legacyPortfolioSchemaMigration');

function tempDb(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sbc-legacy-db-'));
  return { dir, dbPath: path.join(dir, name) };
}

function columnNames(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map(r => r.name);
}

function seedCore(db) {
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, password_hash TEXT, display_name TEXT, referral_code TEXT);
    CREATE TABLE accounts (id INTEGER PRIMARY KEY, user_id INTEGER, stonk_balance REAL DEFAULT 0, created_at TEXT);
    INSERT INTO users (id,email,password_hash,display_name,referral_code) VALUES
      (1,'a@example.com','x','A','A1'),(2,'b@example.com','x','B','B2');
    INSERT INTO accounts (id,user_id,stonk_balance) VALUES (1,1,1000),(2,2,1000);
  `);
}

(function testLegacyAccountTablesAndIdempotency(){
  const { dbPath } = tempDb('shape-a.db');
  const db = new DatabaseSync(dbPath);
  seedCore(db);
  db.exec(`
    CREATE TABLE portfolios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      label TEXT NOT NULL,
      cash_balance REAL NOT NULL DEFAULT 100000,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO portfolios (id,account_id,label,cash_balance) VALUES
      (10,1,'Only portfolio',90000),
      (20,2,'Contest one',80000),
      (21,2,'Contest two',70000);

    CREATE TABLE positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      avg_cost REAL NOT NULL DEFAULT 0,
      UNIQUE(account_id, symbol)
    );
    INSERT INTO positions (id,account_id,symbol,quantity,avg_cost) VALUES
      (101,1,'AAPL',5,190),(102,2,'TSLA',3,320);

    CREATE TABLE trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      quantity REAL NOT NULL,
      price REAL NOT NULL,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO trades (id,account_id,symbol,side,quantity,price,timestamp) VALUES
      (201,1,'AAPL','buy',5,190,'2026-08-01T00:00:00Z'),
      (202,2,'TSLA','buy',3,320,'2026-08-02T00:00:00Z');
  `);

  const first = migrateLegacyPortfolioSchema({ db });
  assert.deepStrictEqual(first,{positionsMigrated:true,tradesMigrated:true,mappedAccounts:2});
  assert(columnNames(db,'positions').includes('portfolio_id'));
  assert(!columnNames(db,'positions').includes('account_id'));
  assert(columnNames(db,'trades').includes('portfolio_id'));
  assert(!columnNames(db,'trades').includes('account_id'));

  const a = db.prepare("SELECT p.*, pf.account_id FROM positions p JOIN portfolios pf ON pf.id=p.portfolio_id WHERE p.symbol='AAPL'").get();
  assert.strictEqual(a.id,101);
  assert.strictEqual(a.portfolio_id,10,'single existing portfolio should be preserved');
  assert.strictEqual(a.account_id,1);

  const b = db.prepare("SELECT p.*, pf.account_id, pf.label FROM positions p JOIN portfolios pf ON pf.id=p.portfolio_id WHERE p.symbol='TSLA'").get();
  assert.strictEqual(b.id,102);
  assert.strictEqual(b.account_id,2);
  assert.strictEqual(b.label,LEGACY_LABEL,'ambiguous multi-portfolio account must get a dedicated legacy portfolio');
  assert.notStrictEqual(b.portfolio_id,20);
  assert.notStrictEqual(b.portfolio_id,21);

  const trade = db.prepare("SELECT t.*, pf.account_id FROM trades t JOIN portfolios pf ON pf.id=t.portfolio_id WHERE t.id=202").get();
  assert.strictEqual(trade.account_id,2);
  assert.strictEqual(trade.timestamp,'2026-08-02T00:00:00Z');

  const before = db.prepare('SELECT COUNT(*) AS n FROM portfolios').get().n;
  const second = migrateLegacyPortfolioSchema({ db });
  const after = db.prepare('SELECT COUNT(*) AS n FROM portfolios').get().n;
  assert.deepStrictEqual(second,{positionsMigrated:false,tradesMigrated:false,mappedAccounts:0});
  assert.strictEqual(after,before,'second migration run must be idempotent');
  db.close();
})();

(function testDifferentLegacyShapeWithoutPortfoliosOrTimestamp(){
  const { dbPath } = tempDb('shape-b.db');
  const db = new DatabaseSync(dbPath);
  seedCore(db);
  db.exec(`
    CREATE TABLE trades (
      id INTEGER PRIMARY KEY,
      account_id INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      quantity REAL NOT NULL,
      price REAL NOT NULL
    );
    INSERT INTO trades (id,account_id,symbol,side,quantity,price) VALUES (301,1,'NVDA','buy',2,180);
  `);
  const result = migrateLegacyPortfolioSchema({ db });
  assert.deepStrictEqual(result,{positionsMigrated:false,tradesMigrated:true,mappedAccounts:1});
  assert(columnNames(db,'trades').includes('portfolio_id'));
  const row = db.prepare("SELECT t.id,t.symbol,t.timestamp,p.account_id,p.label FROM trades t JOIN portfolios p ON p.id=t.portfolio_id WHERE t.id=301").get();
  assert.strictEqual(row.account_id,1);
  assert.strictEqual(row.label,LEGACY_LABEL);
  assert(row.timestamp,'missing legacy timestamp should receive a migration timestamp');
  assert.deepStrictEqual(migrateLegacyPortfolioSchema({ db }),{positionsMigrated:false,tradesMigrated:false,mappedAccounts:0});
  db.close();
})();

async function bootCommittedSnapshotCopy(){
  const source = path.join(__dirname,'..','data','app.db');
  assert(fs.existsSync(source),'committed data/app.db snapshot missing');
  const { dir, dbPath } = tempDb('committed-copy.db');
  fs.copyFileSync(source,dbPath);
  const port = 34271;
  const child = spawn(process.execPath,['server/index.js'],{
    cwd:path.join(__dirname,'..'),
    env:{...process.env,DB_PATH:dbPath,PORT:String(port),TEST_MODE:'true'},
    stdio:['ignore','pipe','pipe']
  });
  let out='',err='';
  child.stdout.on('data',d=>{out+=d;});
  child.stderr.on('data',d=>{err+=d;});
  try {
    for(let i=0;i<100;i++){
      if(child.exitCode!==null) throw new Error(`server exited code=${child.exitCode}\nstdout:\n${out}\nstderr:\n${err}`);
      try {
        const r=await fetch(`http://127.0.0.1:${port}/api/health`);
        if(r.ok){
          const health=await r.json();
          assert.strictEqual(health.ok,true);
          return;
        }
      } catch (_) {}
      await new Promise(r=>setTimeout(r,100));
    }
    throw new Error(`server did not become ready\nstdout:\n${out}\nstderr:\n${err}`);
  } finally {
    if(child.exitCode===null) child.kill('SIGTERM');
    fs.rmSync(dir,{recursive:true,force:true});
  }
}

bootCommittedSnapshotCopy().then(()=>{
  console.log('Legacy Portfolio Schema Migration: PASS');
  console.log('IDEMPOTENT=two-runs');
  console.log('ALTERNATE_LEGACY_SHAPE=covered');
  console.log('COMMITTED_DB_SNAPSHOT_BOOT=pass');
}).catch(err=>{
  console.error(err.stack||err);
  process.exitCode=1;
});
