import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomBytes, createHash} from 'node:crypto';
import ts from 'typescript';
import {createRequire} from 'node:module';
const req=createRequire(import.meta.url);
function load(file,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>{if(n in deps)return deps[n];if(n.startsWith('node:'))return req(n);throw Error(n);},m,m.exports);return m.exports;}
const crypto=load('lib/connectors/crypto.ts');
const oauth=load('lib/connectors/google-drive/oauth.ts');
const drive=load('lib/connectors/google-drive/drive.ts');
const key=randomBytes(32);
const json=(status,body)=>({ok:status<300,status,json:async()=>body});

test('secrets are encrypted, tamper-proof and need the right key',()=>{
 const sealed=crypto.encrypt('1//refresh-token',key);
 assert.ok(!sealed.includes('refresh'));assert.equal(crypto.decrypt(sealed,key),'1//refresh-token');
 assert.notEqual(crypto.encrypt('x',key),crypto.encrypt('x',key),'random IV');
 const parts=sealed.split('.');parts[3]=Buffer.from('other').toString('base64url');
 assert.throws(()=>crypto.decrypt(parts.join('.'),key));
 assert.throws(()=>crypto.decrypt(sealed,randomBytes(32)));
 assert.throws(()=>crypto.connectorKey(undefined),/CONNECTORS_ENCRYPTION_KEY/);
 assert.throws(()=>crypto.connectorKey(randomBytes(16).toString('base64')),/32 bytes/);
 assert.equal(crypto.connectorKey(key.toString('base64')).length,32);
});

test('config: Drive credentials, falling back to the login client; redirect from the request origin',()=>{
 assert.deepEqual(oauth.oauthConfig('http://localhost:3000',{GOOGLE_DRIVE_CLIENT_ID:'id',GOOGLE_DRIVE_CLIENT_SECRET:'s'}),
  {clientId:'id',clientSecret:'s',redirectUri:'http://localhost:3000/api/connectors/google-drive/callback'});
 assert.equal(oauth.oauthConfig('https://x.app',{AUTH_GOOGLE_ID:'a',AUTH_GOOGLE_SECRET:'b'}).clientId,'a');
 assert.equal(oauth.oauthConfig('https://x.app',{AUTH_GOOGLE_ID:'a',AUTH_GOOGLE_SECRET:'b',GOOGLE_DRIVE_REDIRECT_URI:'https://y/cb'}).redirectUri,'https://y/cb');
 assert.throws(()=>oauth.oauthConfig('http://l',{}),/GOOGLE_DRIVE_CLIENT_ID/);
});

test('authorization URL: read-only Drive scope, offline, consent, PKCE S256, state',()=>{
 const st=oauth.newOAuthState('ws','u');
 const url=new URL(oauth.authorizationUrl({clientId:'id',clientSecret:'s',redirectUri:'http://l/cb'},st));
 const p=url.searchParams;
 assert.equal(url.origin+url.pathname,'https://accounts.google.com/o/oauth2/v2/auth');
 assert.ok(p.get('scope').split(' ').includes('https://www.googleapis.com/auth/drive.readonly'));
 assert.ok(!p.get('scope').includes('auth/drive '),'never full Drive access');
 assert.equal(p.get('access_type'),'offline');assert.equal(p.get('prompt'),'consent');assert.equal(p.get('state'),st.state);
 assert.equal(p.get('code_challenge_method'),'S256');assert.equal(p.get('code_challenge'),createHash('sha256').update(st.verifier).digest('base64url'));
 assert.equal(oauth.newOAuthState('w','u','//evil.com').returnTo,'/connectors');assert.equal(oauth.newOAuthState('w','u','https://evil').returnTo,'/connectors');
});

test('callback checks: cancel, expiry, state, user and workspace',()=>{
 const st=oauth.newOAuthState('ws','u',undefined,1000);const s={userId:'u',workspaceId:'ws'};
 const q=o=>new URLSearchParams(o);
 assert.equal(oauth.checkCallback(q({code:'c',state:st.state}),st,s,2000),null);
 assert.match(oauth.checkCallback(q({error:'access_denied'}),st,s,2000),/cancelado/);
 assert.match(oauth.checkCallback(q({code:'c',state:st.state}),null,s,2000),/caducado/);
 assert.match(oauth.checkCallback(q({code:'c',state:st.state}),st,s,1000+oauth.STATE_TTL_MS+1),/caducado/);
 assert.match(oauth.checkCallback(q({code:'c',state:'other'}),st,s,2000),/no corresponde/);
 assert.match(oauth.checkCallback(q({code:'c',state:st.state}),st,{userId:'u',workspaceId:'other'},2000),/cambiado/);
 assert.match(oauth.checkCallback(q({state:st.state}),st,s,2000),/código/);
});

test('token exchange and refresh; a dead grant asks to reconnect',async()=>{
 let sent;const f=async(url,init)=>{sent={url,body:new URLSearchParams(init.body)};return json(200,{access_token:'at',expires_in:3599,refresh_token:'rt',scope:'openid https://www.googleapis.com/auth/drive.readonly'});};
 const cfg={clientId:'id',clientSecret:'s',redirectUri:'http://l/cb'};
 const t=await oauth.exchangeCode(cfg,'code','ver',f);
 assert.equal(sent.url,'https://oauth2.googleapis.com/token');assert.equal(sent.body.get('code_verifier'),'ver');assert.equal(sent.body.get('grant_type'),'authorization_code');
 assert.equal(t.refreshToken,'rt');assert.ok(t.scopes.includes(oauth.DRIVE_SCOPE));assert.ok(t.expiresAt.getTime()>Date.now()+3500e3);
 await oauth.refreshAccessToken(cfg,'rt',f);assert.equal(sent.body.get('grant_type'),'refresh_token');assert.equal(sent.body.get('refresh_token'),'rt');
 await assert.rejects(oauth.refreshAccessToken(cfg,'rt',async()=>json(400,{error:'invalid_grant',error_description:'Token has been expired or revoked.'})),e=>e.needsReconnect===true);
 await assert.rejects(oauth.refreshAccessToken(cfg,'rt',async()=>json(500,{})),e=>e.needsReconnect===false);
 assert.equal(await oauth.revoke('x',async()=>{throw new Error('offline');}),false);
});

test('folder queries: only folders, no trash, escaped search, ids validated',()=>{
 const q=drive.folderListQuery('root').get('q');
 assert.equal(q,"mimeType = 'application/vnd.google-apps.folder' and trashed = false and 'root' in parents");
 assert.match(drive.folderListQuery('shared').get('q'),/sharedWithMe = true/);
 assert.match(drive.folderListQuery('root',"Facturas d'Plocia").get('q'),/name contains 'Facturas d\\'Plocia'/);
 assert.throws(()=>drive.folderListQuery("x' or '1'='1"),/no válida/);
 assert.equal(drive.validId('1AbC_d-EfGh'),true);assert.equal(drive.validId('../x'),false);
});

test('Drive calls: folders mapped, folder checked, documents counted by type',async()=>{
 const urls=[];
 const f=async url=>{urls.push(url);
  if(url.includes('/files/FOLDER1?'))return json(200,{id:'FOLDER1',name:'Facturas',mimeType:drive.FOLDER_MIME,parents:['root']});
  if(url.includes('/files/DOCUMENT1?'))return json(200,{id:'D1',name:'a.pdf',mimeType:'application/pdf'});
  if(url.includes('/files/GONE00?'))return json(404,{error:{message:'File not found'}});
  const q=new URL(url).searchParams;
  if(q.get('fields').includes('mimeType)'))return q.get('pageToken')?json(200,{files:[{mimeType:'image/png'}]}):json(200,{files:[{mimeType:'application/pdf'},{mimeType:'application/vnd.google-apps.spreadsheet'}],nextPageToken:'p2'});
  return json(200,{files:[{id:'F1',name:'Facturas',ownedByMe:true},{id:'F2',name:'Gestoría',ownedByMe:false}]});};
 assert.deepEqual(await drive.listFolders('t','root',undefined,f),{folders:[{id:'F1',name:'Facturas',shared:false},{id:'F2',name:'Gestoría',shared:true}],more:false});
 assert.deepEqual(await drive.getFolder('t','FOLDER1',f),{id:'FOLDER1',name:'Facturas',parents:['root']});
 await assert.rejects(drive.getFolder('t','DOCUMENT1',f),/no es una carpeta/);
 await assert.rejects(drive.getFolder('t','GONE00',f),e=>e.status===404);
 assert.deepEqual(await drive.countDocuments('t','FOLDER1',f),{importable:2,other:1,capped:false});
 assert.ok(urls.every(u=>u.startsWith('https://www.googleapis.com/drive/v3/files')));
});

test('settings: only a well-formed folder is read back',()=>{
 assert.deepEqual(drive.readSettings({}),{});assert.deepEqual(drive.readSettings(null),{});assert.deepEqual(drive.readSettings({folder:{id:1}}),{});
 assert.equal(drive.readSettings({folder:{id:'F1',name:'Facturas',selectedAt:'t',selectedBy:'u'}}).folder.name,'Facturas');
});
