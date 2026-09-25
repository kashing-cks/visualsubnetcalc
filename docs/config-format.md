# Configuration and share-link format

This describes the format this version of the app reads and writes. It is written from the
implementation; `NOTES.md` contains earlier design notes that drifted from it (in particular it
describes the mask suffix as base32, while the code has always used base36).

## Share links

A share link is the page URL with a single query parameter:

```
/index.html?c=1N4IgbiBcIEwgNCARlEBGADAOm7g9GgGwIgDOUoGA5hQL71A
```

The value is `LOCAL_FORMAT_VERSION` followed by an LZString payload:

| Part | Value |
| --- | --- |
| Format version | `1` (the `urlVersion` global). Bump it if the way a link is built ever changes. |
| Payload | `LZString.compressToEncodedURIComponent(JSON.stringify(config))` |

The `config_version` inside the payload is a separate number: it describes the shape of the
JSON, not the encoding of the link.

## The configuration object

```jsonc
{
  "config_version": "2",                 // "1" or "2" — required
  "base_network": "10.0.0.0/16",         // required for version 2
  "operating_mode": "AWS",               // optional, defaults to "Standard"
  "subnets": {                           // required, at least one entry
    "0g": {                              // the base network itself
      "_note": "site",                   // optional
      "_color": "#00aa55",               // optional, a background colour
      "0h": { "_cellColors": {} },       // optional, per-cell colours
      "1h": { "_note": "guests" }        // deeper subnets nest the same way
    }
  }
}
```

`operating_mode` is one of `Standard`, `AZURE`, `AWS`, `OCI` or `HUAWEI`; it selects the
reserved-address and minimum-size rules.

### Subnet keys

A key names one subnet. Two forms are accepted, and they cannot be confused with each other
because an Nth string never contains a dot or a slash:

* **A full CIDR**, e.g. `10.0.0.64/26`. This is what version 1 configurations use, and the base
  network is simply the first key.
* **The Nth form**, e.g. `1q`. This is what version 2 configurations use.

### The Nth form

```
[nth as a decimal integer][mask as one base36 digit]
```

The mask suffix is `Number(mask).toString(36)`: `0`–`9` then `a`–`z` for `10`–`35`. Masks up to
31 therefore look the same as they would in base32, but `/32` is `w`, not `07` — `NOTES.md`'s
example predates the implementation.

`nth` is the index of the block within the base network, counting blocks of *that mask's* size
from the start of the base network:

```
nth   = (subnetAddress - baseAddress) / 2 ** (32 - mask)
```

For the base network `10.0.0.0/16`:

| Key | Mask | Meaning |
| --- | --- | --- |
| `0g` | `16` (`g`) | the 0th /16 — the base network itself, `10.0.0.0/16` |
| `0o` | `24` (`o`) | the 0th /24, `10.0.0.0/24` |
| `1o` | `24` (`o`) | the 1st /24, `10.0.1.0/24` |
| `7k` | `20` (`k`) | the 7th /20 — `10.0.112.0/20`, because 7 × 2¹² = 28672 |

A subnet inside a subnet is encoded relative to the **base** network, not to its parent — every
key in the tree is an absolute position within the base.

## What is refused on import

A configuration is untrusted input whether it arrives as a share link or pasted into the import
box, so the whole shape is checked before anything is applied, and a bad one is refused as a
whole with a reason shown to the user. The rules:

* the payload is a JSON object, and `config_version` is `"1"` or `"2"`;
* a version 2 configuration has a `base_network` that is a valid network;
* `subnets` is a non-empty object, and every key is a valid, **aligned** network — an address
  such as `10.0.0.128/18` is not a /18 network at all, and two keys like it share one Nth
  representation, so the second would silently disappear;
* every node is an object;
* if `operating_mode` is present it is one of the known modes;
* every step of the mode/rendering code afterwards is expected to succeed.

A refused share link leaves the default design on screen; refused pasted JSON leaves the
current design alone.
