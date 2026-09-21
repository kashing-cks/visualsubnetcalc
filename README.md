# Visual Subnet Calculator - [visualsubnetcalc.com](https://visualsubnetcalc.com)

![demo.gif](src%2Fdemo.gif)

Visual Subnet Calculator is a modernized tool based on the original work by [davidc](https://github.com/davidc/subnets).
It strives to be a tool for quickly designing networks and collaborating on that design with others. It focuses on
expediting the work of network administrators, not academic subnetting math.

## Design Tenets

The following tenets are the most important values that drive the design of the tool. New features, pull requests, etc
should align to these tenets, or propose an adjustment to the tenets.

- **Simplicity is king.** Network admins are busy and Visual Subnet Calculator should always be easy for FIRST TIME USERS to
  quickly and intuitively use.
- **Subnetting is design work.** Promote features that enhance visual clarity and easy mental processing of even the most
  complex architectures.
- **Users control the data.** We store nothing, but provide convenient ways for users to save and share their designs.
- **Embrace community contributions.** Consider and respond to all feedback and pull requests in the context of these
  tenets.

## Website Deployment

GitHub Actions publishes the `dist` directory to GitHub Pages on each push to `main`.
In repository **Settings → Pages**, select **GitHub Actions** as the source.
The website URL is https://kashing-cks.github.io/visualsubnetcalc/ once Pages is enabled
and the deployment completes.

## Export to Excel

Choose **Export to Excel** next to Tools to download the current subnet table as an `.xlsx` file
(for example, `10.0.0.0_16.xlsx`). The workbook includes subnet addresses, address ranges,
usable IPs for the selected mode, numeric host counts, and notes.
The **Subnets** sheet preserves row highlight colors and the orange Split / blue Join
blocks with merged cells. **Hierarchy Notes** lists every subnet and its parent, level,
and independent note.

## Notes at Each Level

Edit notes directly inside the orange Split and blue Join blocks, or click **Hierarchy Notes**.
The main table has no separate Note column. The horizontal prefix
button performs the split/join action; typing in the adjacent note does not change
the subnet structure. Excel retains a Note field for convenient filtering and reading.
Use **Hierarchy Notes**
above the table to edit all levels in a scrollable panel. Each subnet appears once,
with its level and a collapsible branch; edits apply immediately to the current design.
Splitting keeps the
parent note and initially copies it to both children; each level can then be edited
independently. Joining restores the parent's note (older configurations without a
parent note use matching child notes). JSON export/import and shareable URLs retain
all levels of notes.

## Colors and File Controls

**Import / Export** and **Export to Excel** are visible buttons beside Tools.
**Change Colors** offers 24 preset colors and a custom color picker. Select a color,
then click a subnet's address, range, usable IPs, or host count to apply it.

## Cloud Subnet Notes

### Standard mode:

- Smallest subnet: /32
- Two reserved addresses per subnet of size <= 30:
  - Network Address (network + 0)
  - Broadcast Address (last network address)

### AWS mode ([docs](https://docs.aws.amazon.com/vpc/latest/userguide/subnet-sizing.html)):

- Smallest subnet: /28
- Five reserved addresses per subnet:
  - Network Address (network + 0)
  - AWS Reserved - VPC Router
  - AWS Reserved - VPC DNS
  - AWS Reserved - Future Use
  - Broadcast Address (last network address)

### Azure mode ([docs](https://learn.microsoft.com/en-us/azure/virtual-network/virtual-networks-faq#are-there-any-restrictions-on-using-ip-addresses-within-these-subnets)):

- Smallest subnet: /29
- Five reserved addresses per subnet:
  - Network Address (network + 0)
  - Azure Reserved - Default Gateway
  - Azure Reserved - DNS Mapping
  - Azure Reserved - DNS Mapping
  - Broadcast Address (last network address)

### OCI mode ([docs](https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/overview.htm#Reserved__reserved_subnet)):

- Smallest subnet: /30
- Three reserved addresses per subnet:
  - Network Address (network + 0)
  - OCI Reserved - Default Gateway Address (network + 1)
  - Broadcast Address (last network address)

### Huawei Cloud mode ([docs](https://support.huaweicloud.com/intl/en-us/usermanual-vpc/en-us_topic_0013748726.html)):

- Choose **Tools → Mode - Huawei Cloud**.
- Smallest subnet: /28.
- Five addresses are reserved by default: network address, gateway (network + 1),
  system interface (last - 2), DHCP (last - 1), and broadcast (last).
- For `192.168.0.0/24`, usable addresses are `192.168.0.2 - 192.168.0.252` (251 hosts).
- Calculations use the default gateway layout; custom gateway settings can change
  the reserved addresses, as described in Huawei Cloud's documentation.

## Building From Source

If you have a more opinionated best-practice way to lay out this repository please open an issue.

Build prerequisites:

- (Optional but recommended) NVM to manage node version
- node.js (version 20) and associated NPM.
- sass (Globally installed, following instructions below.)

Compile from source:

```shell
# Clone the repository
> git clone https://github.com/ckabalan/visualsubnetcalc
# Change to the repository directory
> cd visualsubnetcalc
# Use recommended NVM version
> nvm use
# Change to the sources directory
> cd src
# Install Bootstrap
> npm install
# Compile Bootstrap (Also install sass command line globally)
> npm run build
# Run the local webserver
> npm start
```

The full application should then be available within `./dist/`, open `./dist/index.html` in a browser.

### Run with certificates (Optional)

**_NB:_** _required for testing clipboard.writeText() in the browser. Feature is only available in secure (https) mode._

```shell

#Install mkcert
> brew install mkcert
# generate CA Certs to be trusted by local browsers
> mkcert install
# generate certs for local development
> cd visualsubnetcalc/src
# generate certs for local development
> npm run setup:certs
# run the local webserver with https
> npm run local-secure-start
```

## Running in a container

The application is also available as a container from https://hub.docker.com/r/ckabalan/visualsubnetcalc.
The container is built automatically and pushed to dockerhub on pushes to the develop branch and when when a new git tag is created.

### Available Image Tags

| Image Tag | Description                                                                                           |
| --------- | ----------------------------------------------------------------------------------------------------- |
| develop   | Images built from the develop branch                                                                  |
| latest    | The latest container image that points to the most recent semantic version built from the main branch |
| v1.1.7    | Semantic version generated from git tag from the main branch                                          |

### Running locally

```bash
# Unprivilged container exposes port 8080 and runs as a non root user.
docker run -d -p8080:8080 --name visualsubnetcalc ckabalan/visualsubnetcalc:latest
```

## Credits

Split icon made by [Freepik](https://www.flaticon.com/authors/freepik) from [Flaticon](https://www.flaticon.com/).

## License

Visual Subnet Calculator is released under the [MIT License](https://opensource.org/licenses/MIT)
