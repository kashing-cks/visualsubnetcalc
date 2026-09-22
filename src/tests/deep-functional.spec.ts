import { test, expect } from '@playwright/test';

async function getClipboardText(page) {
  return page.evaluate(async () => {
    return await navigator.clipboard.readText();
  });
}

test('Deep Functional Test', async ({ page }) => {
  // The goal of this test is to identify any weird interdependencies or issues that may arise
  //   from doing a variety of actions on one page load. It's meant to emulate a complex human
  //   user interaction often with steps that don't make sense.
  // This does a little of everything:
  //   - Manual Network Input
  //   - Subnet splitting/joining
  //   - Colors
  //   - Sharable URLs
  //   - AWS/Azure Mode
  //   - Import Reddit Example Config
  //   - Change Network Size
  await page.goto('/');
  // Change 10.0.0.0/8 -> 172.16.0.0/12
  await page.getByLabel('Network Address').click();
  await page.getByLabel('Network Address').press('Shift+Home');
  await page.getByLabel('Network Address').fill('172.16.0.0');
  await page.getByLabel('Network Size').fill('12');
  await page.getByRole('button', { name: 'Go' }).click();
  // Do a bunch of splitting
  await page.getByText('/12', { exact: true }).click();
  await page.getByLabel('172.24.0.0/13', { exact: true }).getByText('/13', { exact: true }).click();
  await page.getByLabel('172.24.0.0/14', { exact: true }).getByText('/14', { exact: true }).click();
  await page.getByLabel('172.26.0.0/15', { exact: true }).getByText('/15', { exact: true }).click();
  await page.getByLabel('172.26.0.0/16', { exact: true }).getByText('/16', { exact: true }).click();
  await page.getByRole('button', { name: /^Split .+\/15$/ }).click();
  await page.getByRole('button', { name: 'Split 172.24.0.0/16' }).click();
  await page.getByRole('button', { name: 'Split 172.25.0.0/16' }).click();
  await page.getByRole('button', { name: /^Split .+\/14$/ }).click();
  await page.getByRole('button', { name: 'Split 172.30.0.0/15' }).click();
  await page.getByRole('button', { name: 'Split 172.31.0.0/16' }).click();
  await page.getByLabel('172.31.128.0/17', { exact: true }).getByText('/17', { exact: true }).click();
  await page.getByLabel('172.31.192.0/18', { exact: true }).getByText('/18', { exact: true }).click();
  await page.getByLabel('172.31.224.0/19', { exact: true }).getByText('/19', { exact: true }).click();
  await page.getByLabel('172.31.192.0/19', { exact: true }).getByText('/19', { exact: true }).click();
  await page.getByRole('textbox', { name: '172.31.240.0/20 Split Note', exact: true }).click();
  await page.getByRole('textbox', { name: '172.31.240.0/20 Split Note', exact: true }).fill('Test A');
  await page.getByRole('textbox', { name: '172.31.224.0/20 Split Note', exact: true }).click();
  await page.getByRole('textbox', { name: '172.31.224.0/20 Split Note', exact: true }).fill('Test B');
  await page.getByRole('button', { name: 'Split 172.31.240.0/20' }).click();
  await page.getByRole('textbox', { name: '172.31.240.0/21 Split Note', exact: true }).click();
  await page.getByRole('textbox', { name: '172.31.240.0/21 Split Note', exact: true }).fill('Test A - 1');
  await page.getByRole('textbox', { name: '172.31.248.0/21 Split Note', exact: true }).click();
  await page.getByRole('textbox', { name: '172.31.248.0/21 Split Note', exact: true }).fill('Test A - 2');
  await page.getByLabel('172.31.248.0/21', { exact: true }).getByText('/21', { exact: true }).click();
  await page.getByLabel('172.31.252.0/22', { exact: true }).getByText('/22', { exact: true }).click();
  await page.getByRole('button', { name: /^Split .+\/21$/ }).click();
  await page.getByRole('textbox', { name: '172.31.240.0/22 Split Note', exact: true }).click();
  await page.getByRole('textbox', { name: '172.31.240.0/22 Split Note', exact: true }).fill('Test A - 1A');
  await page.getByRole('textbox', { name: '172.31.244.0/22 Split Note', exact: true }).click();
  await page.getByRole('textbox', { name: '172.31.244.0/22 Split Note', exact: true }).fill('Test A - 1B');
  // Join a subnet
  await page.getByRole('button', { name: 'Join 172.31.240.0/21' }).click();
  // Change some colors and do some more splitting
  await page.getByText('Change Colors »').click();
  await page.getByLabel('Color 4', { exact: true }).click();
  await page.getByRole('cell', { name: '172.26.128.0/17 Usable IPs' }).click();
  await page.getByText('« Stop Changing Colors').click();
  await page.getByRole('button', { name: 'Split 172.26.128.0/17' }).click();
  await page.getByRole('button', { name: 'Split 172.26.192.0/18' }).click();
  await page.getByText('Change Colors »').click();
  await page.getByLabel('Color 8', { exact: true }).click();
  await page.getByRole('cell', { name: '172.26.128.0/18 Usable IPs' }).click();
  await page.getByText('« Stop Changing Colors').click();
  // Make sure we're still not changing colors
  await page.getByRole('button', { name: 'Split 172.26.128.0/18' }).click();
  // Check a bunch of specific items
  await expect(page.getByLabel('Network Address')).toHaveValue('172.16.0.0');
  await expect(page.getByLabel('Network Size')).toHaveValue('12');
  await expect(page.getByRole('textbox', { name: '172.31.254.0/23 Split Note', exact: true })).toHaveValue('Test A - 2');
  await expect(page.getByRole('textbox', { name: '172.31.252.0/23 Split Note', exact: true })).toHaveValue('Test A - 2');
  await expect(page.getByRole('textbox', { name: '172.31.248.0/22 Split Note', exact: true })).toHaveValue('Test A - 2');
  // Joining restores the parent's own note (see mutate_subnet_map 'join').
  await expect(page.getByRole('textbox', { name: '172.31.240.0/21 Split Note', exact: true })).toHaveValue('Test A - 1');
  await expect(page.getByRole('textbox', { name: '172.31.224.0/20 Split Note', exact: true })).toHaveValue('Test B');
  await expect(page.getByLabel('172.16.0.0/13', { exact: true }).getByLabel('Split', { exact: true })).toContainText('/13');
  await expect(page.getByLabel('172.24.0.0/17', { exact: true }).getByLabel('Split', { exact: true })).toContainText('/17');
  await expect(page.getByLabel('172.26.128.0/19', { exact: true }).getByLabel('Split', { exact: true })).toContainText('/19');
  await expect(page.getByLabel('172.27.0.0/16', { exact: true }).getByLabel('Split', { exact: true })).toContainText('/16');
  await expect(page.getByLabel('172.28.0.0/15', { exact: true }).getByLabel('Split', { exact: true })).toContainText('/15');
  await expect(page.getByLabel('172.30.0.0/16', { exact: true }).getByLabel('Split', { exact: true })).toContainText('/16');
  await expect(page.getByLabel('172.31.0.0/17', { exact: true }).getByLabel('Split', { exact: true })).toContainText('/17');
  await expect(page.getByLabel('172.31.128.0/18', { exact: true }).getByLabel('Split', { exact: true })).toContainText('/18');
  await expect(page.getByLabel('172.31.192.0/20', { exact: true }).getByLabel('Split', { exact: true })).toContainText('/20');
  await expect(page.getByLabel('172.31.240.0/21', { exact: true }).getByLabel('Split', { exact: true })).toContainText('/21');
  await expect(page.getByLabel('172.31.248.0/22', { exact: true }).getByLabel('Split', { exact: true })).toContainText('/22');
  await expect(page.getByLabel('172.31.252.0/23', { exact: true }).getByLabel('Split', { exact: true })).toContainText('/23');
  await expect(page.getByRole('cell', { name: /\/12 Join$/ })).toContainText('/12');
  await expect(page.getByRole('cell', { name: /\/13 Join$/ })).toContainText('/13');
  await expect(page.getByRole('cell', { name: '172.26.128.0/17 Join' })).toContainText('/17');
  await expect(page.getByRole('cell', { name: '172.31.128.0/17 Join' })).toContainText('/17');
  await expect(page.getByRole('cell', { name: '172.31.192.0/19 Join' })).toContainText('/19');
  await expect(page.getByRole('cell', { name: '172.31.224.0/19 Join' })).toContainText('/19');
  await expect(page.getByRole('cell', { name: /\/21 Join$/ })).toContainText('/21');
  await expect(page.getByRole('cell', { name: /\/22 Join$/ })).toContainText('/22');
  await expect(page.getByRole('row', { name: '172.26.128.0/19' })).toHaveCSS('background-color', 'rgb(255, 198, 255)');
  await expect(page.getByRole('row', { name: '172.26.160.0/19' })).toHaveCSS('background-color', 'rgb(255, 198, 255)');
  await expect(page.getByRole('row', { name: '172.26.192.0/19' })).toHaveCSS('background-color', 'rgb(202, 255, 191)');
  await expect(page.getByRole('row', { name: '172.26.224.0/19' })).toHaveCSS('background-color', 'rgb(202, 255, 191)');
  // Check the Shareable URL
  await page.getByText('Copy Shareable URL').click();
  let clipboardUrl = await getClipboardText(page);
  expect(clipboardUrl).toContain('/index.html?c=1N4Igxg9gNhBOD6UCmBzJA7AJiAXKAxGAIYBmJARibiCADQj5lgBsZ1IAvvQG7UBMdEOWoBGAOx8AdCOaSADPID0IgfQDOuUHLCaQc7Hi4gRB0HyS6ALFTwgAHCl0yAFpqPjXhowE5HtkXaewO7eQRzh9ACsNqAicn5mcmH0fCJBIJZ8AJa6dpYAVro6OAxMrFRGdpGFtsWlJCxsERkAzDm2dsw1oHWEpBQV9HZi3eDUfWSUnOHuIgkz9C0Wtqxu9GIxxpbz9CKRCSAtSWuHabrM2SfMbU58Xbp8kXwA1iePLa9eu3wjD5GWn1A6GoABUkGoAC4AAgAQpwUpFIoCQMCSmDIVCAIKCSJxKC6VEgdHQzFQgC0UJEgjq8JAuJE+NshOJWPJUNUxjkfD4AFsCaDwSS2QJ3FyWnymQKMaSKRy+HJLMxUUCpULZbT5ZYxMqUarWeqZoajeEgA');
  // Check the Export
  await page.getByRole('button', { name: 'Tools' }).click();
  await page.getByRole('button', { name: 'Import / Export' }).click();
  await expect(page.getByLabel('Import/Export Content')).toHaveValue('{\n  "config_version": "2",\n  "base_network": "172.16.0.0/12",\n  "subnets": {\n    "172.16.0.0/12": {\n      "172.16.0.0/13": {},\n      "172.24.0.0/13": {\n        "172.24.0.0/14": {\n          "172.24.0.0/15": {\n            "172.24.0.0/16": {\n              "172.24.0.0/17": {},\n              "172.24.128.0/17": {}\n            },\n            "172.25.0.0/16": {\n              "172.25.0.0/17": {},\n              "172.25.128.0/17": {}\n            }\n          },\n          "172.26.0.0/15": {\n            "172.26.0.0/16": {\n              "172.26.0.0/17": {},\n              "172.26.128.0/17": {\n                "172.26.128.0/18": {\n                  "172.26.128.0/19": {\n                    "_color": "#ffc6ff"\n                  },\n                  "172.26.160.0/19": {\n                    "_color": "#ffc6ff"\n                  }\n                },\n                "172.26.192.0/18": {\n                  "172.26.192.0/19": {\n                    "_color": "#caffbf"\n                  },\n                  "172.26.224.0/19": {\n                    "_color": "#caffbf"\n                  }\n                }\n              }\n            },\n            "172.27.0.0/16": {}\n          }\n        },\n        "172.28.0.0/14": {\n          "172.28.0.0/15": {},\n          "172.30.0.0/15": {\n            "172.30.0.0/16": {},\n            "172.31.0.0/16": {\n              "172.31.0.0/17": {},\n              "172.31.128.0/17": {\n                "172.31.128.0/18": {},\n                "172.31.192.0/18": {\n                  "172.31.192.0/19": {\n                    "172.31.192.0/20": {},\n                    "172.31.208.0/20": {}\n                  },\n                  "172.31.224.0/19": {\n                    "172.31.224.0/20": {\n                      "_note": "Test B"\n                    },\n                    "172.31.240.0/20": {\n                      "172.31.240.0/21": {\n                        "_note": "Test A - 1",\n                        "_color": ""\n                      },\n                      "172.31.248.0/21": {\n                        "172.31.248.0/22": {\n                          "_note": "Test A - 2"\n                        },\n                        "172.31.252.0/22": {\n                          "172.31.252.0/23": {\n                            "_note": "Test A - 2"\n                          },\n                          "172.31.254.0/23": {\n                            "_note": "Test A - 2"\n                          },\n                          "_note": "Test A - 2"\n                        },\n                        "_note": "Test A - 2"\n                      },\n                      "_note": "Test A"\n                    }\n                  }\n                }\n              }\n            }\n          }\n        }\n      }\n    }\n  },\n  "color_legend": {\n    "#caffbf": "",\n    "#ffc6ff": ""\n  }\n}');
  await page.getByLabel('Import/Export', { exact: true }).getByText('Close').click();
  // Set to AWS Mode
  await page.getByRole('button', { name: 'Tools' }).click();
  await page.getByRole('link', { name: 'Mode - AWS' }).click();
  // Check AWS Mode Settings
  await expect(page.getByLabel('172.31.254.0/23', { exact: true }).getByLabel('Usable IPs (AWS)')).toContainText('172.31.254.4 - 172.31.255.254');
  await expect(page.getByLabel('172.31.254.0/23', { exact: true }).getByLabel('Hosts')).toContainText('507');
  await page.getByText('Copy Shareable URL').click();
  clipboardUrl = await getClipboardText(page);
  expect(clipboardUrl).toContain('/index.html?c=1N4Igxg9gNhBOD6UCmBzJA7AJiAXKAxGAIYBmJARibiCADQj5lgBsZ1IAvvQG7UBMdEOWoBGAOx8AdCOaSADPID0IgfQC21AIIB1AMqCAzrlBywxkHOx4uIEVdB8k5gCxU8IABwpzMgBbGbcX9rGwBOb3cRD2DgQNCYjkT6AFY3UBE5CIc5BPo+ERiQZz4AS3MPZwArczMcBiZWKhsPZOr3WvqSFjYkooBmMvcPZjbQDsJSCib6DzFR8GoJskpORMCRLLX6Pqd3VgD6MTTbZ036EWSskD6cg+uC82ZSu+YBnz4R8z5kvgBrO++fX+IXOfDmX2SzmBoHQ1AAKkgDAAXAAEACFOHlksloSBYXUEciUZpBMkMlBzPiQITUZoUQBaFEiQQdTEgMkiCnuKk04kMlGqWxyPh8DTc+GI2n8gSBYV9MUwiVEumMwV8OTOZj4xUEyV81Vs9XOMTavFKqUGtZW62JIA');
  // Set to Azure Mode
  await page.getByRole('button', { name: 'Tools' }).click();
  await page.getByRole('link', { name: 'Mode - Azure' }).click();
  // Check Azure Mode Settings
  await expect(page.getByLabel('172.31.254.0/23', { exact: true }).getByLabel('Usable IPs (Azure)')).toContainText('172.31.254.4 - 172.31.255.254');
  await expect(page.getByLabel('172.31.254.0/23', { exact: true }).getByLabel('Hosts')).toContainText('507');
  await page.getByText('Copy Shareable URL').click();
  clipboardUrl = await getClipboardText(page);
  expect(clipboardUrl).toContain('/index.html?c=1N4Igxg9gNhBOD6UCmBzJA7AJiAXKAxGAIYBmJARibiCADQj5lgBsZ1IAvvQG7UBMdEOWoBGAOx8AdCOaSADPID0IgfQC21AIIAtAKoAlAKKCAzrlByw5kHOx4uIEXdB8k1gCxU8IABwprMgAW5g7iwfYOAJz+3iI+4cChkQkcqfQArF6gInIxLnIp9HwiCSDufACW1j7uAFbWVjgMTKxUDj7p9d6NzSQsbGllAMxV3j7MXaA9hKQUbfQ+YpPg1DNklJypoSJ5W-RDbt6sIfRiWY7uu-Qi6XkgQwUn9yXWzJVPzCMBfBPWfOl8ADWT3+Q2BEWufCWf3S7nBoHQ1AAKkgTAAXAAEACFOEV0ul4SBEU0UeiMZpBOkclBrMSQKTMZoMQBaDEiQQ9XEgKkiGneOkM8ksjGqRxyPh8DT85GoxnCgShcVDKUImVkpms0V8OTuZjE1Uk2VCzVc7XuMT6olquUmrZ2+2pIA');
  // Import Default Reddit Config
  await page.getByRole('button', { name: 'Tools' }).click();
  await page.getByRole('button', { name: 'Import / Export' }).click();
  await page.getByLabel('Import/Export Content').click();
  await page.getByLabel('Import/Export Content').press('ControlOrMeta+a');
  await page.getByLabel('Import/Export Content').fill('{\n  "config_version": "2",\n  "base_network": "10.0.0.0/20",\n  "subnets": {\n    "10.0.0.0/20": {\n      "10.0.0.0/21": {\n        "10.0.0.0/22": {\n          "10.0.0.0/23": {\n            "10.0.0.0/24": {\n              "_note": "Data Center - Virtual Servers",\n              "_color": "#9bf6ff"\n            },\n            "10.0.1.0/24": {\n              "_note": "Data Center - Virtual Servers",\n              "_color": "#9bf6ff"\n            }\n          },\n          "10.0.2.0/23": {\n            "10.0.2.0/24": {\n              "_note": "Data Center - Virtual Servers",\n              "_color": "#9bf6ff"\n            },\n            "10.0.3.0/24": {\n              "_note": "Data Center - Physical Servers",\n              "_color": "#a0c4ff"\n            }\n          }\n        },\n        "10.0.4.0/22": {\n          "10.0.4.0/23": {\n            "_note": "Building A - Wifi",\n            "_color": "#ffd6a5"\n          },\n          "10.0.6.0/23": {\n            "_note": "Building A - LAN",\n            "_color": "#ffd6a5"\n          }\n        }\n      },\n      "10.0.8.0/21": {\n        "10.0.8.0/22": {\n          "10.0.8.0/23": {\n            "10.0.8.0/24": {\n              "_note": "Building A - Printers",\n              "_color": "#ffd6a5"\n            },\n            "10.0.9.0/24": {\n              "_note": "Building A - Voice",\n              "_color": "#ffd6a5"\n            }\n          },\n          "10.0.10.0/23": {\n            "_note": "Building B - Wifi",\n            "_color": "#fdffb6"\n          }\n        },\n        "10.0.12.0/22": {\n          "10.0.12.0/23": {\n            "_note": "Building B - LAN",\n            "_color": "#fdffb6"\n          },\n          "10.0.14.0/23": {\n            "10.0.14.0/24": {\n              "_note": "Building B - Printers",\n              "_color": "#fdffb6"\n            },\n            "10.0.15.0/24": {\n              "_note": "Building B - Voice",\n              "_color": "#fdffb6"\n            }\n          }\n        }\n      }\n    }\n  }\n}');
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  // Do all the Reddit Default Checks
  await expect(page.getByLabel('Network Address')).toHaveValue('10.0.0.0');
  await expect(page.getByLabel('Network Size')).toHaveValue('20');
  await expect(page.getByLabel('10.0.0.0/24', { exact: true }).getByLabel('Subnet Address')).toContainText('10.0.0.0/24');
  await expect(page.getByLabel('10.0.1.0/24', { exact: true }).getByLabel('Subnet Address')).toContainText('10.0.1.0/24');
  await expect(page.getByLabel('10.0.2.0/24', { exact: true }).getByLabel('Subnet Address')).toContainText('10.0.2.0/24');
  await expect(page.getByLabel('10.0.3.0/24', { exact: true }).getByLabel('Subnet Address')).toContainText('10.0.3.0/24');
  await expect(page.getByLabel('10.0.4.0/23', { exact: true }).getByLabel('Subnet Address')).toContainText('10.0.4.0/23');
  await expect(page.getByLabel('10.0.6.0/23', { exact: true }).getByLabel('Subnet Address')).toContainText('10.0.6.0/23');
  await expect(page.getByLabel('10.0.8.0/24', { exact: true }).getByLabel('Subnet Address')).toContainText('10.0.8.0/24');
  await expect(page.getByLabel('10.0.9.0/24', { exact: true }).getByLabel('Subnet Address')).toContainText('10.0.9.0/24');
  await expect(page.getByLabel('10.0.10.0/23', { exact: true }).getByLabel('Subnet Address')).toContainText('10.0.10.0/23');
  await expect(page.getByLabel('10.0.12.0/23', { exact: true }).getByLabel('Subnet Address')).toContainText('10.0.12.0/23');
  await expect(page.getByLabel('10.0.14.0/24', { exact: true }).getByLabel('Subnet Address')).toContainText('10.0.14.0/24');
  await expect(page.getByLabel('10.0.15.0/24', { exact: true }).getByLabel('Subnet Address')).toContainText('10.0.15.0/24');
  await expect(page.getByRole('textbox', { name: '10.0.0.0/24 Split Note', exact: true })).toHaveValue('Data Center - Virtual Servers');
  await expect(page.getByRole('textbox', { name: '10.0.1.0/24 Split Note', exact: true })).toHaveValue('Data Center - Virtual Servers');
  await expect(page.getByRole('textbox', { name: '10.0.2.0/24 Split Note', exact: true })).toHaveValue('Data Center - Virtual Servers');
  await expect(page.getByRole('textbox', { name: '10.0.3.0/24 Split Note', exact: true })).toHaveValue('Data Center - Physical Servers');
  await expect(page.getByRole('textbox', { name: '10.0.4.0/23 Split Note', exact: true })).toHaveValue('Building A - Wifi');
  await expect(page.getByRole('textbox', { name: '10.0.6.0/23 Split Note', exact: true })).toHaveValue('Building A - LAN');
  await expect(page.getByRole('textbox', { name: '10.0.8.0/24 Split Note', exact: true })).toHaveValue('Building A - Printers');
  await expect(page.getByRole('textbox', { name: '10.0.9.0/24 Split Note', exact: true })).toHaveValue('Building A - Voice');
  await expect(page.getByRole('textbox', { name: '10.0.10.0/23 Split Note', exact: true })).toHaveValue('Building B - Wifi');
  await expect(page.getByRole('textbox', { name: '10.0.12.0/23 Split Note', exact: true })).toHaveValue('Building B - LAN');
  await expect(page.getByRole('textbox', { name: '10.0.14.0/24 Split Note', exact: true })).toHaveValue('Building B - Printers');
  await expect(page.getByRole('textbox', { name: '10.0.15.0/24 Split Note', exact: true })).toHaveValue('Building B - Voice');
  await expect(page.getByRole('row', { name: '10.0.0.0/24' })).toHaveCSS('background-color', 'rgb(155, 246, 255)');
  await expect(page.getByRole('row', { name: '10.0.1.0/24' })).toHaveCSS('background-color', 'rgb(155, 246, 255)');
  await expect(page.getByRole('row', { name: '10.0.2.0/24' })).toHaveCSS('background-color', 'rgb(155, 246, 255)');
  await expect(page.getByRole('row', { name: '10.0.3.0/24' })).toHaveCSS('background-color', 'rgb(160, 196, 255)');
  await expect(page.getByRole('row', { name: '10.0.4.0/23' })).toHaveCSS('background-color', 'rgb(255, 214, 165)');
  await expect(page.getByRole('row', { name: '10.0.6.0/23' })).toHaveCSS('background-color', 'rgb(255, 214, 165)');
  await expect(page.getByRole('row', { name: '10.0.8.0/24' })).toHaveCSS('background-color', 'rgb(255, 214, 165)');
  await expect(page.getByRole('row', { name: '10.0.9.0/24' })).toHaveCSS('background-color', 'rgb(255, 214, 165)');
  await expect(page.getByRole('row', { name: '10.0.10.0/23' })).toHaveCSS('background-color', 'rgb(253, 255, 182)');
  await expect(page.getByRole('row', { name: '10.0.12.0/23' })).toHaveCSS('background-color', 'rgb(253, 255, 182)');
  await expect(page.getByRole('row', { name: '10.0.14.0/24' })).toHaveCSS('background-color', 'rgb(253, 255, 182)');
  await expect(page.getByRole('row', { name: '10.0.15.0/24' })).toHaveCSS('background-color', 'rgb(253, 255, 182)');
  // Now change the whole network address
  await page.getByLabel('Network Address').click();
  await page.getByLabel('Network Address').press('ControlOrMeta+a');
  await page.getByLabel('Network Address').fill('192.168.0.0');
  await page.getByRole('button', { name: 'Go' }).click();
  await expect(page.getByLabel('192.168.0.0/24', { exact: true }).getByLabel('Subnet Address')).toContainText('192.168.0.0/24');
});



//test('Test', async ({ page }) => {
//  await page.goto('/');
//});
