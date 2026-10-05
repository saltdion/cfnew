const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(__dirname + '/_worker.js', 'utf8');
const start = source.indexOf('function Clash订阅配置文件热补丁(');
const end = source.indexOf('\nfunction ', start + 1);
const context = vm.createContext({});
vm.runInContext(source.slice(start, end), context);
const fixture = `dns:
  enable: false
  nameserver:
    - 114.114.114.114
  fallback:
    - 8.8.4.4
  fallback-filter:
    domain:
      - '+.example.com'
  listen: 0.0.0.0:1053
  fake-ip-filter:
    - '*.lan'
  nameserver-policy:
    'node.example.com': https://223.5.5.5/dns-query
proxies:
  - {name: node, type: vless, uuid: example-credential, server: node.example.com}
proxy-groups:
  - name: 🚀 节点选择
    type: select
    proxies: [DIRECT, node]
  - name: ♻️ 自动选择
    type: url-test
    proxies: [node]
rules:
  - 'DOMAIN,dl.google.com,🎯 全球直连'
  - DOMAIN,dl.google.com,🚀 节点选择
  - DOMAIN-SUFFIX,xdrig.com,🎯 全球直连
  - DOMAIN-SUFFIX,xdrig.com,🛑 全球拦截
  - "DOMAIN-SUFFIX,baidustatic.com,🛑 全球拦截" # conflicting template rule
  - DOMAIN-SUFFIX,baidustatic.com,🎯 全球直连
  - DOMAIN-SUFFIX,cpro.baidustatic.com,🛑 全球拦截
  - MATCH,🚀 节点选择
`;
function patch(input) {
  context.input = input;
  return vm.runInContext('Clash订阅配置文件热补丁(input)', context);
}
for (const input of [fixture, fixture.replaceAll('\n', '\r\n')]) {
  const output = patch(input);
  for (const provider of ['cloudflare-dns.com', 'dns.google', 'dns.quad9.net']) {
    assert.ok(output.includes(`https://${provider}/dns-query#♻️ 自动选择`));
  }
  assert.ok(output.includes('respect-rules: true'));
  assert.ok(output.includes('enhanced-mode: fake-ip'));
  assert.ok(output.includes('https://dns.alidns.com/dns-query#DIRECT'));
  assert.ok(output.includes('https://doh.pub/dns-query#DIRECT'));
  assert.ok(!output.includes('8.8.4.4'));
  for (const field of ['listen: 0.0.0.0:1053', "- '*.lan'", "'node.example.com': https://223.5.5.5/dns-query", 'uuid: example-credential']) assert.ok(output.includes(field));
  assert.ok(!output.includes('dl.google.com,🎯 全球直连'));
  assert.ok(!output.includes('xdrig.com,🎯 全球直连'));
  assert.ok(!output.includes('DOMAIN-SUFFIX,baidustatic.com,🛑 全球拦截'));
  assert.ok(output.includes('DOMAIN-SUFFIX,cpro.baidustatic.com,🛑 全球拦截'));
  assert.equal(patch(output), output);
}
const custom = patch('proxies:\n  - {name: node, type: vless}\nproxy-groups:\n  - {name: custom, type: select, proxies: [node]}\nrules:\n  - MATCH,custom\n');
assert.ok(custom.includes('https://dns.google/dns-query#custom'));
const compactName = patch(fixture.replaceAll('♻️ 自动选择', '♻️自动选择'));
assert.ok(compactName.includes('https://dns.google/dns-query#♻️自动选择'));
const protocolFixture = `proxies:
  - {name: "VLESS, WS", type: vless, network: ws}
  - name: Trojan WS
    type: trojan
    network: ws
  - {name: VLESS xhttp, type: vless, network: xhttp}
proxy-groups:
  - name: ♻️ 自动选择
    type: url-test
    interval: 300
    proxies: ["VLESS, WS", Trojan WS, VLESS xhttp]
  - {name: backup, type: fallback, interval: 180, proxies: [Trojan WS]}
rules:
  - MATCH,♻️ 自动选择
`;
for (const input of [protocolFixture, protocolFixture.replaceAll('\n', '\r\n')]) {
  const output = patch(input);
  assert.equal((output.match(/interval: 600/g) || []).length, 3);
  assert.equal((output.match(/lazy: false/g) || []).length, 3);
  assert.equal((output.match(/expected-status: 204/g) || []).length, 3);
  assert.ok(output.includes('name: "♻️ 自动选择"\n    type: select'));
  assert.ok(output.includes('type: fallback, interval: 0'));
  for (const name of ['♻️ VLESS＋WS', '♻️ Trojan＋WS', '♻️ VLESS＋xhttp']) assert.ok(output.includes('name: ' + JSON.stringify(name)));
  assert.ok(output.includes('      - "VLESS, WS"'));
  assert.equal(patch(output), output);
}
const partial = patch(protocolFixture.replace('network: xhttp', 'network: grpc'));
assert.ok(!partial.includes('name: "♻️ VLESS＋xhttp"'));
assert.equal((partial.match(/interval: 600/g) || []).length, 2);
console.log('PASS: protocol/transport grouping, 600-second full checks, disabled duplicate timers, flow/block YAML, quoted names, partial protocol support and idempotence.');
console.log('PASS: DNS replacement/insertion, proxy binding, preserved custom fields and credentials, three rule overrides, CRLF, custom groups and idempotence.');
