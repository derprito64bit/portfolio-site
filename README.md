# portfolio-site

The source of the 2D front door of **https://derprito64bit.github.io/**, derprito64bit's portfolio.

The front door is fast, works on any hardware, and tells the whole story. The walkable 3D Manor is the second
door, and it lives in the fork [`derprito64bit/derprito64bit.github.io`](https://github.com/derprito64bit/derprito64bit.github.io).
There is no site code yet: the framework is locked in Wave 2 (see [`docs/agents/decisions.md`](docs/agents/decisions.md)).

## One domain, two repos

| Path | Served from |
|---|---|
| `/` and everything not listed below | this repo's build |
| `/manor/**` | the fork's Unity build |
| `/play/**` | the fork: a redirect to `/manor/` that keeps the query string and hash |
| `/arcade/**` | the fork's `site/arcade/` |

The fork's `scripts/fork/publish.ps1` composes both repos into the fork's `gh-pages` branch. **GitHub Pages stays
off for this repo**, so the site exists at one address only.

## Content is placeholder until the owner confirms it

[`content/`](content/) is the source of truth for both doors. The fork copies it into the Manor.

- Every entry carries `"placeholder": true` until the owner confirms it.
- [`content/owner-facts.md`](content/owner-facts.md) is the only source of facts about the owner. Nothing else
  may be stated as fact, and nobody invents details to fill a layout.

## Licence

- Code: MIT, see [`LICENSE`](LICENSE).
- Everything in `content/` and all media (images, video, audio, 3D models) anywhere in the repo: all rights
  reserved, see [`CONTENT-LICENSE.md`](CONTENT-LICENSE.md).

## Agents start here

[`docs/agents/PROTOCOL.md`](docs/agents/PROTOCOL.md) covers how work is claimed, checkpointed, reviewed and resumed.
The rules every prompt includes are in [`docs/agents/blocks/`](docs/agents/blocks/).
