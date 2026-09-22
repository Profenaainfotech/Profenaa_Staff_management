// node test/wifi.test.js
const assert = require("assert");
const { parseNetsh, parseNmcli } = require("../src/wifi");

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log("  ✓", name); };
console.log("wifi parsing");

const WIN11 = `
There is 1 interface on the system:

    Name                   : Wi-Fi
    Description            : Intel(R) Wi-Fi 6 AX201 160MHz
    GUID                   : 3c7f7e9c-0000-0000-0000-000000000000
    Physical address       : aa:bb:cc:dd:ee:ff
    Interface type         : Primary
    State                  : connected
    SSID                   : PROFENAA-5G
    AP BSSID               : 8c:c7:c3:09:1d:70
    Band                   : 5 GHz
    Channel                : 44
    Radio type             : 802.11ac
    Signal                 : 91%
`;
const WIN10 = `
    Name                   : Wi-Fi
    State                  : connected
    SSID                   : PROFENAA- 2G
    BSSID                  : 14:a7:2b:ea:2e:51
    Network type           : Infrastructure
    Radio type             : 802.11n
    Signal                 : 80%
`;
const DISCONNECTED = `
    Name                   : Wi-Fi
    State                  : disconnected
`;
const HIDDEN_24H2 = `
    Name                   : Wi-Fi
    State                  : connected
    SSID                   :
    AP BSSID               :
`;
const TWO_ADAPTERS = `
    Name                   : Wi-Fi 2
    State                  : disconnected

    Name                   : Wi-Fi
    State                  : connected
    SSID                   : PROFENAA-2G
    BSSID                  : 8c-c7-c3-09-1d-74
`;
const GERMAN = `
    Name                   : WLAN
    Status                 : Verbunden
    SSID                   : PROFENAA-5G
    BSSID                  : 8c:c7:c3:09:1d:70
`;

t("Windows 11 'AP BSSID' is read; BSSID normalised to upper case", () => {
  const r = parseNetsh(WIN11);
  assert.deepStrictEqual([r.connected, r.ssid, r.bssid, r.hidden], [true, "PROFENAA-5G", "8C:C7:C3:09:1D:70", false]);
});
t("the adapter's own 'Physical address' is never mistaken for the access point", () => {
  assert.notStrictEqual(parseNetsh(WIN11).bssid, "AA:BB:CC:DD:EE:FF");
});
t("Windows 10 'BSSID' works, incl. the SSID with a space (Pollachi)", () => {
  const r = parseNetsh(WIN10);
  assert.strictEqual(r.ssid, "PROFENAA- 2G");
  assert.strictEqual(r.bssid, "14:A7:2B:EA:2E:51");
});
t("disconnected", () => assert.strictEqual(parseNetsh(DISCONNECTED).connected, false));
t("Windows 11 24H2 with Location off: connected but details hidden => flagged", () => {
  const r = parseNetsh(HIDDEN_24H2);
  assert.deepStrictEqual([r.connected, r.hidden], [true, true]);
});
t("picks the connected adapter when there are two", () => {
  const r = parseNetsh(TWO_ADAPTERS);
  assert.deepStrictEqual([r.ssid, r.bssid], ["PROFENAA-2G", "8C:C7:C3:09:1D:74"]);
});
t("non-English Windows (translated 'State') still works via the SSID", () => {
  const r = parseNetsh(GERMAN);
  assert.deepStrictEqual([r.connected, r.ssid], [true, "PROFENAA-5G"]);
});
t("empty / garbage output => not connected, no crash", () => {
  assert.strictEqual(parseNetsh("").connected, false);
  assert.strictEqual(parseNetsh("The Wireless AutoConfig Service (wlansvc) is not running.").connected, false);
});
t("nmcli (Linux dev) escaped colons", () => {
  const r = parseNmcli("no:Other:AA\\:BB\\:CC\\:DD\\:EE\\:FF\nyes:PROFENAA-5G:8C\\:C7\\:C3\\:09\\:1D\\:70\n");
  assert.deepStrictEqual([r.connected, r.ssid, r.bssid], [true, "PROFENAA-5G", "8C:C7:C3:09:1D:70"]);
});

// -----------------------------------------------------
// REAL `netsh wlan show interfaces` OUTPUT from the Profenaa offices
// (copied from the staff PCs; note the Windows 11 label "AP BSSID", the older
// Windows 10 label "BSSID", and the SSID that really contains a space).
// -----------------------------------------------------
const REAL = {
  kinathukadavu5g: `There is 1 interface on the system:

    Name                   : Wi-Fi
    Description            : Intel(R) Wireless-AC 9462
    GUID                   : 62f1bb96-44fe-4723-85d5-87143052b0b2
    Physical address       : e0:2b:e9:1c:9c:42
    Interface type         : Primary
    State                  : connected
    SSID                   : PROFENAA-5G
    AP BSSID               : 8c:c7:c3:09:1d:70
    Band                   : 5 GHz
    Channel                : 36
    Connected Akm-cipher   : [ akm = 00-0f-ac:02, cipher =  00-0f-ac:04 ]
    Network type           : Infrastructure
    Radio type             : 802.11ac
    Authentication         : WPA2-Personal
    Cipher                 : CCMP
    Connection mode        : Auto Connect
    Receive rate (Mbps)    : 263.3
    Transmit rate (Mbps)   : 433.3
    Signal                 : 84%
    Rssi                   : -57
    Profile                : PROFENAA-5G
    QoS MSCS Configured         : 0
    QoS Map Configured          : 0
    QoS Map Allowed by Policy   : 0
`,
  pollachi2g: `There is 1 interface on the system:

    Name                   : Wi-Fi
    Description            : MediaTek Wi-Fi 6E MT7902 Wireless LAN Card
    GUID                   : 3d9f9485-670a-4c24-92d5-5aac916ba462
    Physical address       : 50:2e:91:38:f8:d8
    Interface type         : Primary
    State                  : connected
    SSID                   : PROFENAA- 2G
    AP BSSID               : 14:a7:2b:ea:2e:51
    Band                   : 2.4 GHz
    Channel                : 9
    Connected Akm-cipher   : [ akm = 00-0f-ac:02, cipher =  00-0f-ac:04 ]
    Network type           : Infrastructure
    Radio type             : 802.11n
    Authentication         : WPA2-Personal
    Cipher                 : CCMP
    Connection mode        : Auto Connect
    Receive rate (Mbps)    : 72.2
    Transmit rate (Mbps)   : 72.2
    Signal                 : 89%
    Rssi                   : -43
    Profile                : PROFENAA- 2G
`,
  pollachi5g: `There is 1 interface on the system:

    Name                   : Wi-Fi
    Description            : MediaTek Wi-Fi 6E MT7902 Wireless LAN Card
    Physical address       : 50:2e:91:38:f8:d8
    Interface type         : Primary
    State                  : connected
    SSID                   : PROFENAA-5G
    AP BSSID               : 14:a7:2b:ea:2e:4d
    Band                   : 5 GHz
    Channel                : 149
    Network type           : Infrastructure
    Radio type             : 802.11ac
    Authentication         : WPA2-Personal
    Cipher                 : CCMP
    Connection mode        : Profile
    Signal                 : 76%
    Rssi                   : -69
    Profile                : PROFENAA-5G
`,
  kinathukadavu2g: `There is 1 interface on the system:

    Name                   : Wi-Fi
    Description            : Intel(R) Wireless-AC 9462
    Physical address       : e0:2b:e9:1c:9c:42
    Interface type         : Primary
    State                  : connected
    SSID                   : PROFENAA-2G
    AP BSSID               : 8c:c7:c3:09:1d:74
    Band                   : 2.4 GHz
    Channel                : 1
    Network type           : Infrastructure
    Radio type             : 802.11n
    Authentication         : WPA2-Personal
    Cipher                 : CCMP
    Connection mode        : Profile
    Signal                 : 95%
    Rssi                   : -41
    Profile                : PROFENAA-2G
`,
  udumalpet24g: `There is 1 interface on the system:

    Name                   : Wi-Fi
    Description            : Intel(R) Dual Band Wireless-AC 8260
    Physical address       : e4:b3:18:f4:e7:23
    State                  : connected
    SSID                   : PROFENAA-2.4G
    BSSID                  : 8c:c7:c3:43:32:ac
    Network type           : Infrastructure
    Radio type             : 802.11n
    Authentication         : WPA2-Personal
    Cipher                 : CCMP
    Connection mode        : Auto Connect
    Channel                : 9
    Receive rate (Mbps)    : 144.4
    Transmit rate (Mbps)   : 144.4
    Signal                 : 97%
    Profile                : PROFENAA-2.4G

    Hosted network status  : Not available
`,
};

// what the registered branches contain (Wi-Fi Setup)
const BRANCHES = {
  Kinathukadavu: [["PROFENAA-5G", "8C:C7:C3:09:1D:70"], ["PROFENAA-2G", "8C:C7:C3:09:1D:74"]],
  Pollachi: [["PROFENAA- 2G", "14:A7:2B:EA:2E:51"], ["PROFENAA-5G", "14:A7:2B:EA:2E:4D"]],
  Udumalpet: [["PROFENAA-2.4G", "8C:C7:C3:43:32:AC"]],
};
const asBranch = (list) => ({ active: true, networks: list.map(([ssid, bssid]) => ({ ssid, bssid })) });
let matches = null;
try {
  matches = require("../../crm-backend/src/Utils/wifi").isAuthorizedNetwork;
} catch (_) {
  matches = null; // backend folder not next to the agent: parser tests still run
}

const EXPECT = [
  ["kinathukadavu5g", "PROFENAA-5G", "8C:C7:C3:09:1D:70", "Kinathukadavu"],
  ["kinathukadavu2g", "PROFENAA-2G", "8C:C7:C3:09:1D:74", "Kinathukadavu"],
  ["pollachi2g", "PROFENAA- 2G", "14:A7:2B:EA:2E:51", "Pollachi"],
  ["pollachi5g", "PROFENAA-5G", "14:A7:2B:EA:2E:4D", "Pollachi"],
  ["udumalpet24g", "PROFENAA-2.4G", "8C:C7:C3:43:32:AC", "Udumalpet"],
];
for (const [key, ssid, bssid, branch] of EXPECT) {
  t(`real capture ${key}: parsed as ${ssid} / ${bssid}`, () => {
    const r = parseNetsh(REAL[key]);
    assert.deepStrictEqual([r.connected, r.ssid, r.bssid], [true, ssid, bssid]);
  });
  if (matches) {
    t(`real capture ${key}: accepted ONLY by the ${branch} branch`, () => {
      const r = parseNetsh(REAL[key]);
      for (const [name, list] of Object.entries(BRANCHES)) {
        assert.strictEqual(matches(asBranch(list), r.ssid, r.bssid), name === branch, `${name}`);
      }
    });
  }
}
t("real captures pasted back-to-back (several adapters in one output) still yield one connected reading", () => {
  const r = parseNetsh(REAL.kinathukadavu5g + "\n" + REAL.pollachi2g);
  assert.strictEqual(r.connected, true);
  assert.ok(r.ssid && r.bssid);
});
t("a phone hotspot with the same name as the office is NOT accepted (BSSID differs)", () => {
  if (!matches) return;
  const r = parseNetsh(REAL.kinathukadavu5g.replace("8c:c7:c3:09:1d:70", "02:11:22:33:44:55"));
  assert.strictEqual(matches(asBranch(BRANCHES.Kinathukadavu), r.ssid, r.bssid), false);
});

console.log(`\n${n} passed`);
