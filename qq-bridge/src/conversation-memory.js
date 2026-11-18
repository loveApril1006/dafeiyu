import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {DatabaseSync}from'node:sqlite';
import {cleanText,recallTerms}from'../plugins/qq-agent-presets/context-policy.mjs';
function indexTerms(text){
 const terms=new Set(String(text).toLowerCase().match(/[a-z0-9_]{2,40}/g)||[]);
 for(const run of String(text).match(/[\u4e00-\u9fff]{2,}/g)||[])for(const n of [2,3])for(let i=0;i<=run.length-n;i++)terms.add(run.slice(i,i+n));
 return [...terms].join(' ');
}
export function createConversationMemory(file){
 const observers=new Set();let evidencePolicy=()=>true;
 fs.mkdirSync(path.dirname(file),{recursive:true});const db=new DatabaseSync(file);
 db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=2000;
 CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY, channel TEXT NOT NULL, stamp INTEGER NOT NULL, sender TEXT NOT NULL, user_id TEXT, direction TEXT NOT NULL, message_id TEXT, body TEXT NOT NULL, digest TEXT NOT NULL, UNIQUE(channel,digest));
 CREATE INDEX IF NOT EXISTS messages_channel_time ON messages(channel,stamp DESC);
 CREATE VIRTUAL TABLE IF NOT EXISTS history_fts USING fts5(body, content='messages', content_rowid='id', tokenize='trigram');
 CREATE VIRTUAL TABLE IF NOT EXISTS history_terms USING fts5(terms);
 CREATE TRIGGER IF NOT EXISTS history_insert AFTER INSERT ON messages BEGIN INSERT INTO history_fts(rowid,body) VALUES(new.id,new.body);END;`);
 const addTerms=db.prepare('INSERT OR REPLACE INTO history_terms(rowid,terms) VALUES(?,?)');
 // Repair a partial older index without touching original records.
 for(const row of db.prepare('SELECT id,body FROM messages WHERE id NOT IN(SELECT rowid FROM history_terms)').iterate())addTerms.run(row.id,indexTerms(row.body));
 const valid=key=>{if(!/^(group|private):[1-9]\d*$/.test(String(key)))throw Error('无效的会话记忆范围');};
 return {
  database:db,
  setEvidencePolicy(fn){evidencePolicy=fn||(()=>true);},
  subscribe(fn){observers.add(fn);return()=>observers.delete(fn);},
  scan(after=0,limit=200){return db.prepare('SELECT * FROM messages WHERE id>? ORDER BY id LIMIT ?').all(after,Math.max(1,Math.min(1000,limit)));},
  append(key,row){
   valid(key);const body=cleanText(row.text,64000).trim();if(!body)return;
   const direction=row.isSelf?'self':'user',stamp=Number(row.time)||Date.now();
   const identity=row.messageId?[direction,String(row.messageId)]:[direction,stamp,String(row.sender||''),row.userId||null,body.slice(0,100)];
   const digest=crypto.createHash('sha256').update(JSON.stringify(identity)).digest('hex');
   const result=db.prepare('INSERT OR IGNORE INTO messages(channel,stamp,sender,user_id,direction,message_id,body,digest) VALUES(?,?,?,?,?,?,?,?)').run(key,stamp,String(row.sender||''),row.userId?String(row.userId):null,direction,row.messageId?String(row.messageId):null,body,digest);
   if(result.changes){addTerms.run(result.lastInsertRowid,indexTerms(body));const item={id:Number(result.lastInsertRowid),channel:key,stamp,sender:String(row.sender||''),user_id:row.userId?String(row.userId):null,direction,message_id:row.messageId?String(row.messageId):null,body,digest};for(const fn of observers)try{fn(item);}catch{}}
  },
  recall(key,query,{limit=4,before=Date.now()+1}={}){
   valid(key);limit=Math.max(1,Math.min(10,Number(limit)||4));const terms=recallTerms(query);if(!terms.length)return[];
   // A bound subquery returns only this channel's evidence, even if FTS ranks
   // another group's text first. MATCH data is quoted and SQL values are bound.
   const phrase=terms.filter(t=>t.length>=3).map(t=>'"'+t.replaceAll('"','""')+'"').join(' OR ');
   let rows=[];
   if(phrase)rows=db.prepare(`SELECT m.* FROM history_fts f JOIN messages m ON m.id=f.rowid WHERE history_fts MATCH ? AND m.channel=? AND m.stamp<? ORDER BY m.stamp DESC LIMIT 80`).all(phrase,key,before);
   if(!rows.length){
    const words=terms.map(t=>'"'+t.replaceAll('"','""')+'"').join(' OR ');
    rows=db.prepare('SELECT m.* FROM history_terms f JOIN messages m ON m.id=f.rowid WHERE history_terms MATCH ? AND m.channel=? AND m.stamp<? ORDER BY m.stamp DESC LIMIT 80').all(words,key,before);
   }
   if(!rows.length){
    // Trigram cannot index two-character words. The per-channel recent slice
    // provides a bounded fallback without scanning every user's history.
    rows=db.prepare('SELECT * FROM messages WHERE channel=? AND stamp<? ORDER BY stamp DESC LIMIT 1000').all(key,before);
   }
   const scored=rows.filter(r=>evidencePolicy(key,r)).map(r=>({...r,score:terms.reduce((n,t)=>n+(r.body.toLowerCase().includes(t)?Math.min(3,t.length):0),0)})).filter(r=>r.score>0).sort((a,b)=>b.score-a.score||b.stamp-a.stamp).slice(0,limit);
   return scored.map(r=>({time:r.stamp,sender:r.sender,userId:r.user_id,isSelf:r.direction==='self',messageId:r.message_id,text:cleanText(r.body,900)}));
  },
  recent(key,limit=16,{evidenceOnly=false}={}){valid(key);return db.prepare('SELECT id,stamp AS time,sender,user_id AS userId,direction,message_id AS messageId,body AS text FROM messages WHERE channel=? ORDER BY stamp DESC,id DESC LIMIT ?').all(key,Math.min(40,Math.max(1,limit))).reverse().filter(r=>!evidenceOnly||evidencePolicy(key,r)).map(r=>({...r,text:cleanText(r.text,500)}));},
  stats(){return {messages:db.prepare('SELECT count(*) AS n FROM messages').get().n,channels:db.prepare('SELECT count(DISTINCT channel) AS n FROM messages').get().n};},
  close(){db.close();}
 };
}
