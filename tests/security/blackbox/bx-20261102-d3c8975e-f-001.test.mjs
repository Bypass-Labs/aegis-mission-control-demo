import test from 'node:test';
import assert from 'node:assert/strict';
import {check} from './blackbox-runtime.mjs';
const spec={"schemaVersion":1,"id":"f-001","kind":"model-raw-boundary","origin":"http://127.0.0.1:3010","include":["/"],"never":[],"rps":10,"expiresAt":null,"allowRemoteHttp":false,"identities":{"owner":"OWNER_TOKEN","outsider":"OTHER_TOKEN"},"auth":"bearer","identityPath":null,"identityCookieName":null,"as":"anonymous","rawRequests":[{"method":"GET","path":"/api/mission/controls","as":"anonymous","headers":[{"name":"X-Crew-Id","value":"1"}],"body":""}],"rawProof":{"baseline":[{"method":"GET","path":"/api/mission/controls","as":"anonymous","headers":[],"body":""}],"negative":[{"method":"GET","path":"/api/mission/controls","as":"anonymous","headers":[{"name":"X-Crew-Id","value":"9999"}],"body":""}],"closedText":"Crew access required","openText":"Cmdr. Vega"},"methods":["GET","HEAD","POST","PUT","PATCH","DELETE","OPTIONS"],"targetEnvironment":"local"};
test("f-001 model-raw-boundary is fixed",async()=>{
  const result=await check(spec,process.env);
  assert.equal(result.verdict,'not_reproduced',JSON.stringify(result));
});
