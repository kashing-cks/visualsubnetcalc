# Visual Subnet Calculator

A fast, visual tool for designing IPv4 subnet layouts and collaborating on them with others.
Split and join subnets, annotate every level of the hierarchy, colour the design, then share
it as a link, a JSON configuration, or a styled Excel workbook.

**Live site:** https://kashing-cks.github.io/visualsubnetcalc/

This repository is a fork of [ckabalan/visualsubnetcalc](https://github.com/ckabalan/visualsubnetcalc)
(itself based on the original work by [davidc](https://github.com/davidc/subnets)), extended with
Huawei Cloud mode, per-level notes, an Excel export and a simplified control layout.

## Features

- **Visual split / join table** — one click halves a subnet or merges siblings back together.
- **Notes at every level** — every subnet in the hierarchy can carry its own note.
- **Huawei Cloud mode** — usable addresses are reduced by the addresses Huawei Cloud reserves.
- **Five operating modes** — Standard, AWS, Azure, OCI and Huawei Cloud (see the table below).
- **Import / Export** — copy the whole design as JSON and paste it back later.
- **Export to Excel** — download an `.xlsx` workbook that keeps colours, blocks and notes.
- **Shareable URL** — the complete design is encoded in the link, nothing is stored on a server.
- **24 preset colours plus a custom colour picker.**
- **Resizable columns** — drag a column edge (or use the arrow keys) to fit longer notes;
  **Reset column widths** restores the default layout.

## Notes at Each Level

The table has no separate Note column; notes are edited where they belong:

- **Inline in the Split / Join blocks.** The orange Split block edits the current subnet's note and
  the blue Join block edits the parent's note. The `/16`, `/17`, … prefix is a button — clicking it
  performs the split or join, while typing in the note field never changes the structure.
- **Hierarchy Notes panel.** Click **Hierarchy Notes** above the table for a scrollable list of every
  subnet, its level and its parent. Each subnet appears exactly once and branches can be collapsed,
  so deep hierarchies stay readable.

Notes follow the design: splitting keeps the parent note and initially copies it to both children,
each level can then be edited independently, and joining restores the parent's note. JSON export and
shareable URLs retain every level.

## Colours

Click **Change Colors »** below the table, pick one of the 24 presets or a custom colour, then click
a subnet's address, range, usable IPs or host count to apply it. Colours are inherited when a subnet
is split and are preserved in JSON, shareable URLs and the Excel export.

## Export to Excel

Choose **Export to Excel** beside the Tools menu to download the current design (for example
`10.0.0.0_16.xlsx`). The workbook contains two sheets:

| Sheet | Contents |
| ----- | -------- |
| **Subnets** | Subnet address, address range, usable IPs for the active mode, host count, note, and the orange/blue Split–Join tree with its colours and merged cells. |
| **Hierarchy Notes** | Every subnet with its level, parent subnet and note — convenient for filtering and reading. |

## Operating Modes

Choose a mode from **Tools**. Each mode reserves the addresses that the corresponding platform does
not make available to instances, and enforces that platform's minimum subnet size.

| Mode | Smallest subnet | Reserved addresses | Usable IPs in `10.0.0.0/24` |
| ---- | --------------- | ------------------ | --------------------------- |
| Standard | /32 | Network address, broadcast | `10.0.0.1 - 10.0.0.254` (254) |
| AWS ([docs](https://docs.aws.amazon.com/vpc/latest/userguide/subnet-sizing.html)) | /28 | Network, VPC router, VPC DNS, future use, broadcast | `10.0.0.4 - 10.0.0.254` (251) |
| Azure ([docs](https://learn.microsoft.com/en-us/azure/virtual-network/virtual-networks-faq#are-there-any-restrictions-on-using-ip-addresses-within-these-subnets)) | /29 | Network, default gateway, two DNS mappings, broadcast | `10.0.0.4 - 10.0.0.254` (251) |
| OCI ([docs](https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/overview.htm#Reserved__reserved_subnet)) | /30 | Network, default gateway, broadcast | `10.0.0.2 - 10.0.0.254` (253) |
| Huawei Cloud ([docs](https://support.huaweicloud.com/intl/en-us/usermanual-vpc/en-us_topic_0013748726.html)) | /28 | Network, gateway, system interface, DHCP, broadcast | `10.0.0.2 - 10.0.0.252` (251) |

Notes on Huawei Cloud mode:

- Five addresses are reserved by default: network address, gateway (`network + 1`), system interface
  (`last - 2`), DHCP (`last - 1`) and broadcast (`last`).
- Calculations assume the default gateway layout; a custom gateway changes the reserved addresses.
- Subnets smaller than /28 are rejected, and switching to Huawei Cloud mode is blocked while the
  design contains smaller subnets.

## Sharing and Saving

- **Copy Shareable URL** encodes the whole design in the URL. Share it and the recipient sees the same
  layout, notes and colours.
- **Import / Export** shows the design as JSON. Copy it out to save, or paste a previous export and
  press Import to restore it.
- Nothing is uploaded or stored — all state lives in the browser and in the link you keep.

## Project Layout

```
dist/                 Static website (this is what gets published)
  index.html          Markup, modals and the colour palette
  css/main.css        Layout, colours and column resizing
  js/main.js          Subnet maths, rendering, notes, Excel export
src/
  scss/               Bootstrap customisation compiled into dist/css
  tests/              Playwright end-to-end tests
  playwright.config.ts
.github/workflows/    GitHub Pages deployment
```

## Local Development

Prerequisites:

- Node.js 20 (see `.nvmrc`), or NVM to manage versions
- `sass` is installed globally by `npm install` (see the `postinstall` script)

```shell
# Clone the repository
git clone https://github.com/kashing-cks/visualsubnetcalc
cd visualsubnetcalc

# Install dependencies and compile Bootstrap
cd src
npm install
npm run build

# Serve the site on http://localhost:8080
npm start
```

The site is served from `./dist/`, so you can also open `./dist/index.html` directly in a browser.

### Run over HTTPS (optional)

`navigator.clipboard.writeText()` — used by **Copy Shareable URL** — only works in a secure context,
and the Playwright suite targets `https://localhost:8443`.

```shell
# Install mkcert and trust the local CA
brew install mkcert        # macOS; use your package manager elsewhere
mkcert -install

cd src
npm run setup:certs        # writes certs/cert.pem and certs/cert.key
npm run local-secure-start # https://localhost:8443
```

### Tests

```shell
cd src
npm test                   # runs the Playwright suite in chromium and firefox
```

The test suite starts its own HTTPS server (certificates from `npm run setup:certs` are required) and
covers the subnet maths, all operating modes, notes, colours, column resizing, URL sharing,
JSON import/export and the Excel export.

## Docker

The upstream project publishes images to
[Docker Hub](https://hub.docker.com/r/ckabalan/visualsubnetcalc). This fork ships the same `Dockerfile`,
which builds `dist/` with Node and serves it from an unprivileged nginx on port 8080:

```shell
docker build -t visualsubnetcalc .
docker run -d -p 8080:8080 --name visualsubnetcalc visualsubnetcalc
```

## Deployment

The website is published to GitHub Pages by `.github/workflows/pages.yml`: every push to `main`
uploads the `dist/` directory as the Pages artifact.

> **Note:** GitHub Pages on the free plan requires the repository to be **public**. If the repository
> is switched back to private, the deployment fails and the site returns 404.

Repository **Settings → Pages** must have **GitHub Actions** selected as the source. The published
URL is https://kashing-cks.github.io/visualsubnetcalc/.

## Design Tenets

The following tenets drive the design of the tool. New features and pull requests should align with
them, or propose an adjustment to the tenets.

- **Simplicity is king.** Network admins are busy, and the tool should always be easy for first-time
  users to pick up and use intuitively.
- **Subnetting is design work.** Promote features that enhance visual clarity and make even complex
  architectures easy to process mentally.
- **Users control the data.** Nothing is stored on a server; convenient ways to save and share designs
  are provided instead.
- **Embrace community contributions.** Consider and respond to all feedback and pull requests in the
  context of these tenets.

## Credits

- Original concept by [davidc](https://github.com/davidc/subnets).
- Upstream project by [ckabalan](https://github.com/ckabalan/visualsubnetcalc).
- Split icon made by [Freepik](https://www.flaticon.com/authors/freepik) from [Flaticon](https://www.flaticon.com/).

## License

Released under the [MIT License](https://opensource.org/licenses/MIT).
