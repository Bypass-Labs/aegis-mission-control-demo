import test from 'node:test';
import assert from 'node:assert/strict';
import {check} from './blackbox-runtime.mjs';
const spec={"schemaVersion":1,"id":"f-002","kind":"model-raw-boundary","origin":"http://127.0.0.1:3010","include":["/"],"never":[],"rps":10,"expiresAt":null,"allowRemoteHttp":false,"identities":{"owner":"OWNER_TOKEN","outsider":"OTHER_TOKEN"},"auth":"bearer","identityPath":null,"identityCookieName":null,"as":"anonymous","rawRequests":[{"method":"POST","path":"/api/mission/vector","as":"anonymous","headers":[{"name":"X-Crew-Id","value":"1"},{"name":"Content-Type","value":"application/json"}],"body":"{\"angle\":32.4,\"thrust\":68}"}],"rawProof":{"baseline":[{"method":"POST","path":"/api/mission/vector","as":"anonymous","headers":[{"name":"Content-Type","value":"application/json"}],"body":"{\"angle\":32.4,\"thrust\":68}"}],"negative":[{"method":"POST","path":"/api/mission/vector","as":"anonymous","headers":[{"name":"X-Crew-Id","value":"9999"},{"name":"Content-Type","value":"application/json"}],"body":"{\"angle\":32.4,\"thrust\":68}"}],"closedText":"Crew access required","openText":"Cmdr. Vega"},"methods":["GET","HEAD","POST","PUT","PATCH","DELETE","OPTIONS"],"targetEnvironment":"local"};
test("f-002 model-raw-boundary is fixed",async()=>{
  const result=await check(spec,process.env);
  assert.equal(result.verdict,'not_reproduced',JSON.stringify(result));
});
