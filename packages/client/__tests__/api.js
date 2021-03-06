// @flow

import { Connection } from '../../__tests__/fixtures';
import Client from '../src';
import { InMemory } from '../src/storage';

test('client.on(...)', async () => {
  const storage = new InMemory();
  const client = new Client({
    storage,
    upstream: new Connection('004-query.ron'),
    db: {
      name: 'test',
      id: 'user',
      clockMode: 'Logical',
    },
  });

  await client.ensure();
  let resp = await new Promise(async r => {
    client.on('#object', (frame, state) => r({ frame, state }));
  });

  expect(resp).toEqual({
    state: '',
    frame: '#object',
  });

  expect(client.lstn['object']).toBeDefined();
  expect(client.lstn['object']).toHaveLength(1);

  await new Promise(r => setTimeout(r, 500));

  resp = await new Promise(async r => {
    client.on('#object', (frame, state) => r({ frame, state }));
  });

  expect(client.lstn['object']).toHaveLength(2);
  expect(storage.storage['object']).toBe("*lww#object@time+author!:key'value'");
  expect(resp).toEqual({
    state: "*lww#object@time+author!:key'value'",
    frame: '#object',
  });

  // $FlowFixMe
  let dump = client.upstream.dump();
  expect(dump.session).toEqual(dump.fixtures);

  // $FlowFixMe
  expect(client.storage.storage.object).toBe(
    "*lww#object@time+author!:key'value'",
  );
  // $FlowFixMe
  expect(JSON.parse(client.storage.storage.__meta__ || '{}')).toEqual({
    name: 'test',
    clockLen: 5,
    forkMode: '// FIXME',
    peerIdBits: 30,
    horizont: 604800,
    clockMode: 'Logical',
    id: 'user',
    offset: 0,
  });

  function cbk(a: string, b: string) {}
  function cbk2(a: string, b: string) {}
  function cbk3(a: string, b: string) {}

  await client.on('#testlength', cbk);
  await client.on('#testlength', cbk2);
  await client.on('#testlength', cbk2);
  await client.on('#testlength', cbk3);
  await client.on('#testlength', cbk3);
  await client.on('#testlength', cbk);

  expect(client.lstn['testlength']).toHaveLength(3);
});

test('client.update(...)', async () => {
  const toCheck = [];
  const storage = new InMemory();
  // stealth-mode client
  const client = new Client({
    storage,
    db: { clockMode: 'Logical', name: 'test' },
  });

  await client.ensure();

  await client.on('*lww#object', (frame: string, state: string): void => {
    toCheck.push({ frame, state });
  });
  await client.merge("*lww#object@time+author!:key'value'");
  await client.merge("*lww#object@time2+author!:key'value2'");
  await client.merge("*lww#object@time1+author!:key'value1'");

  // $FlowFixMe
  expect(client.storage.storage.object).toBe(
    "*lww#object@time1+author!@(2+:key'value2'",
  );
  // $FlowFixMe
  expect(JSON.parse(storage.storage.__meta__)).toEqual({
    name: 'test',
    clockLen: 5,
    forkMode: '// FIXME',
    peerIdBits: 30,
    horizont: 604800,
    clockMode: 'Logical',
    offset: 0,
  });

  expect(toCheck).toEqual([
    {
      frame: '#object',
      state: '',
    },
    {
      frame: '#object',
      state: "*lww#object@time+author!:key'value'",
    },
    {
      frame: '#object',
      state: "*lww#object@time2+author!:key'value2'",
    },
    {
      frame: '#object',
      state: "*lww#object@time1+author!@(2+:key'value2'",
    },
  ]);
});

test('client.off(...)', async () => {
  // stealth-mode client
  const client = new Client({
    id: 'user',
    storage: new InMemory(),
    db: { clockMode: 'Logical', name: 'test' },
  });
  await client.ensure();
  const cbk = (frame: string, state: string): void => {};
  await client.on('*lww#object', cbk);
  expect(client.lstn['object']).toEqual([cbk]);
  client.off('#object');
  expect(client.lstn['object']).toBeUndefined();

  function cbk2(a: string, b: string) {}

  await client.on('#test1', cbk2);
  await client.on('#test2', cbk2);
  await client.on('#test3', cbk2);
  await client.on('#batman', cbk2);

  expect(client.lstn['test1']).toHaveLength(1);
  expect(client.lstn['test2']).toHaveLength(1);
  expect(client.lstn['test3']).toHaveLength(1);
  expect(client.lstn['batman']).toHaveLength(1);

  client.off('#test1#test2#test3', cbk2);

  expect(client.lstn['test1']).toHaveLength(0);
  expect(client.lstn['test2']).toHaveLength(0);
  expect(client.lstn['test3']).toHaveLength(0);
  expect(client.lstn['batman']).toHaveLength(1);
  client.off('#batman');
  expect(client.lstn['batman']).toBeUndefined();
});

test('client.push(...)', async () => {
  const client = new Client({
    storage: new InMemory(),
    upstream: new Connection('005-push.ron'),
    db: {
      id: 'user',
      name: 'test',
      clockMode: 'Logical',
    },
  });

  await client.ensure();
  const resp = await new Promise(async r => {
    client.on('#object', (frame, state) => r({ frame, state }));
  });

  expect(client.lstn['object']).toBeDefined();
  expect(resp).toEqual({
    state: '',
    frame: '#object',
  });

  await new Promise(r => setTimeout(r, 200));

  client.off('#object');

  await client.push("#object!:bar'biz'");
  await client.push('#object!:foo>object');

  await new Promise(r => setTimeout(r, 20));
  // $FlowFixMe
  let dump = client.upstream.dump();
  expect(dump.session).toEqual(dump.fixtures);

  // $FlowFixMe
  expect(client.storage.storage.object).toBe(
    "*lww#object@1ABD2+user!@(1+:bar'biz'@(2+:foo>object@(+author:key'value'",
  );
  // $FlowFixMe
  expect(JSON.parse(client.storage.storage.__pending__)).toEqual([
    "*lww#object@1ABD1+user!:bar'biz'",
    '*lww#object@1ABD2+user!:foo>object',
  ]);
});

test('client.storage.__pending__', async () => {
  let storage = new InMemory({
    __meta__: JSON.stringify({
      name: 'test',
      clockLen: 5,
      forkMode: '// FIXME',
      peerIdBits: 30,
      horizont: 604800,
      clockMode: 'Logical',
    }),
    __pending__: JSON.stringify([
      "*lww#object@1ABC1+user!:username'olebedev'",
      "*lww#object@1ABC2+user!:email'ole6edev@gmail.com'",
      '*lww#object@1ABC3+user!:email,',
      '*lww#object@1ABC5+user!:profile>1ABC4+user',
      '*lww#1ABC4+user@1ABC6+user!:active>true',
      '*lww#1ABC4+user@1ABC7+user!:active>false',
    ]),
  });

  let client = new Client({
    storage,
    upstream: new Connection('007-pending.ron'),
    db: {
      id: 'user',
      name: 'test',
      auth: 'JwT.t0k.en',
      clockMode: 'Logical',
    },
  });

  await new Promise(r => setTimeout(r, 1000));

  // $FlowFixMe
  let dump = client.upstream.dump();
  expect(dump.session).toEqual(dump.fixtures);
  expect(JSON.parse(storage.storage.__pending__)).toEqual([
    '*lww#1ABC4+user@1ABC7+user!:active>false',
  ]);

  // ----------------------- //
  storage = new InMemory({
    __meta__: JSON.stringify({
      name: 'test',
      clockLen: 5,
      forkMode: '// FIXME',
      peerIdBits: 30,
      horizont: 604800,
      auth: 'JwT.t0k.en',
      clockMode: 'Logical',
    }),
    __pending__: JSON.stringify([
      "*lww#object@1ABC1+user!:username'olebedev'",
      "*lww#object@1ABC2+user!:email'ole6edev@gmail.com'",
      '*lww#object@1ABC3+user!:email,',
      '*lww#object@1ABC5+user!:profile>1ABC4+user',
      '*lww#1ABC4+user@1ABC6+user!:active>true',
      '*lww#1ABC4+user@1ABC7+user!:active>false',
    ]),
  });

  client = new Client({
    storage,
    upstream: new Connection('009-pending.ron'),
    db: {
      id: 'user',
      name: 'test',
      auth: 'jwt',
      clockMode: 'Logical',
    },
  });

  await new Promise(r => setTimeout(r, 500));

  // $FlowFixMe
  dump = client.upstream.dump();
  expect(dump.session).toEqual(dump.fixtures);
  expect(storage.storage.__pending__).toBe('[]');
});

test('client.clock.time().local()', async () => {
  let client = new Client({
    storage: new InMemory(),
    upstream: new Connection('012-local-uuids.ron'),
    db: { id: 'user', name: 'test', auth: 'JwT.t0k.en', clockMode: 'Logical' },
  });

  await client.ensure();

  let value: string[] = [];
  const cbk = (f: string, s: string) => {
    value.push(s);
  };

  await client.on(
    '#' +
      client.clock
        // $FlowFixMe
        .time()
        .local()
        .toString(),
    cbk,
  );
  await client.on(
    '#' +
      client.clock
        // $FlowFixMe
        .time()
        .local()
        .toString(),
    cbk,
  );
  await client.on('#object', cbk);
  await client.on(
    '#' +
      client.clock
        // $FlowFixMe
        .time()
        .local()
        .toString(),
    cbk,
  );

  await client.push(
    `*lww#${client.clock
      // $FlowFixMe
      .last()
      .local()
      .toString()}@time+author!:key'value'`,
  );
  await client.push("*lww#object@time+author!:key'value'");
  client.off(
    `#${client.clock
      // $FlowFixMe
      .last()
      .local()
      .toString()}`,
    cbk,
  );

  expect(Object.keys(client.lstn)).toEqual([
    '1ABC1+~local',
    '1ABC2+~local',
    'object',
    '1ABC3+~local',
  ]);
  for (const id of Object.keys(client.lstn)) {
    await client.push(`*lww#${id}@time+author!:key'value'`);
  }

  expect(value).toEqual([
    // empty b/c it's a local object, so we call back
    // anyway first
    '',
    '',
    '',
    '',
    "*lww#1ABC3+~local@time+author!:key'value'",
    "*lww#object@time+author!:key'value'",
    "*lww#1ABC1+~local@time+author!:key'value'",
    "*lww#1ABC2+~local@time+author!:key'value'",
  ]);

  // $FlowFixMe
  const dump = client.upstream.dump();
  expect(dump.session).toEqual(dump.fixtures);
});

test('client: offline re-start', async () => {
  const storage = new InMemory({
    __meta__: JSON.stringify({
      name: 'test',
      id: 'user',
      clockLen: 5,
      forkMode: '// FIXME',
      peerIdBits: 30,
      horizont: 604800,
      auth: 'JwT.t0k.en',
      clockMode: 'Logical',
    }),
  });

  let client = new Client({
    storage,
    upstream: new Connection('019-pending.ron'),
    db: { id: 'user', name: 'test', auth: 'JwT.t0k.en', clockMode: 'Logical' },
  });

  await client.ensure();
});
