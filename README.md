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

The layout uses the available window width and reflows when you zoom in Chrome.
Manually resized columns scale proportionally with the table container, with minimum
widths for readability and horizontal scrolling for large hierarchies.

## Sharing a Design

Use **Copy Shareable URL** in the action bar above the table. The link retains the
site's deployment path, including GitHub Pages project directories. Success is
shown only after copying completes; if clipboard access is unavailable, a selectable
link appears for manual copying with Ctrl+C / ⌘C.

## Notes at Each Level

The table has no separate Note column; notes are edited where they belong:

- **Inline in the Split / Join blocks.** The orange Split block edits the current subnet's note and
  the blue Join block edits the parent's note. The `/16`, `/17`, … prefix is a button — clicking it
  performs the split or join, while typing in the note field never changes the structure. Empty
  blocks show a pencil icon instead of placeholder wording; it disappears as soon as the block has
  text or receives focus, and hovering a block shows its full note.
- **Hierarchy Notes panel.** Click **Hierarchy Notes** above the table for a scrollable list of every
  subnet, its level and its parent. Each subnet appears exactly once and branches can be collapsed,
  so deep hierarchies stay readable.

Notes follow the design: splitting keeps the parent note and initially copies it to both children,
each level can then be edited independently, and joining restores the parent's note. JSON export and
shareable URLs retain every level.

## Colours

Click **Change Colors »** above the table, pick one of the 24 presets or a custom colour, then click
a subnet's address, range, usable IPs or host count to apply it. Colours are inherited when a subnet
is split and are preserved in JSON, shareable URLs and the Excel export.
The expandable colour panel shows the selected colour and a **Stop Changing Colors**
button to finish. The action bar and palette wrap to fit smaller screens.

- **Default block colors:** customise Split and Join independently; dark backgrounds
  automatically use light text. **Reset block colors** restores the original palette.
- **Quick cell colors:** right-click any data cell or Split/Join block to open a nearby
  palette and apply a preset or custom colour immediately. **Reset cell** removes its override.
- **Paint brush:** choose **Whole row** or **Single cell**, pick a colour, then click or
  drag across cells. Split/Join backgrounds always paint individually; note editors,
  prefix buttons and resize handles retain their normal actions. Use the block's outer
  background or its right-click palette to colour a block.
- **Undo color** reverses the last colour operation (a drag counts as one); **Esc** stops
  painting. Undo history resets on Split/Join, network changes or importing another design.
- Per-cell colours and default block colours travel with JSON and shareable links and
  appear in Excel. Children inherit cell colours on Split; Join restores the parent's
  cell colours. A cell override takes priority over row and default block colours.

## Color usage & meanings

Applying a row/cell color or committing a Split/Join color automatically adds it to
the **Color usage & meanings** table above the subnet table, beneath the color controls. Each color appears once;
enter its meaning (for example Production, DMZ or Reserved) directly beside the swatch.
Selecting a brush without painting does not add a record. Unused colors are removed
automatically after repainting, clearing, undoing or joining; an empty legend is hidden.
Only effective colors in the current table count, so overridden colors and hidden parent
metadata do not keep unused entries alive. Reusing a color in the same session restores
its previous description. JSON, shareable links and Excel include only currently used colors.
Importing a design replaces the legend; older designs automatically collect their
visible custom colors. Default untouched block colors
are not added. JSON and shareable links preserve the legend; Excel includes
color swatches and meanings below the subnet table in the same **Subnets** sheet
whenever there are recorded colors.

## Export to Excel

Choose **Export to Excel** beside the Tools menu to download the current design (for example
`10.0.0.0_16.xlsx`). The workbook contains these sheets:

| Sheet | Contents |
| ----- | -------- |
| **Subnets** | Subnet address, address range, usable IPs for the active mode, host count, and the hierarchy with its colours and merged cells. Each block contains its prefix and note, without Split/Join labels or a separate Note column. Recorded color swatches and meanings appear below the subnet table in the same sheet. |
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
